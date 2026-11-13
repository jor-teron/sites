"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/selftest.py
Purpose:      Checks run by `mcp.sh --selftest` (and `python3 -m mcp.selftest`):
              Python version, config and PIN strength, live initialize,
              jail, network, git, awk, workspace size limit, Funnel, and
              the cron autostart line. Prints PASS/FAIL/SKIP lines and a
              summary; never prints the PIN or other secrets.
Place:        mcp/selftest.py — invoked from mcp.sh --selftest.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only, plus mcp.config, mcp.http
              helpers via urllib, and constants from mcp.config.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

from .config import (
    Config,
    ConfigError,
    DEFAULT_PIN,
    FUNNEL_PATH,
    JAIL_UID,
    JAIL_WORKSPACE_PATH,
    LATEST_PROTOCOL_VERSION,
    PIN_REDACT_MARK,
    PYTHON_MIN_MAJOR,
    PYTHON_MIN_MINOR,
    SELFTEST_CLIENT_NAME,
    SELFTEST_COMMAND_TIMEOUT,
    SELFTEST_FAIL,
    SELFTEST_HTTP_TIMEOUT,
    SELFTEST_MARK_CWD,
    SELFTEST_MARK_ISOLATED,
    SELFTEST_MARK_ROOT,
    SELFTEST_MARK_UID,
    SELFTEST_MARKER_NAME,
    SELFTEST_NET_HOST,
    SELFTEST_NET_PORT,
    SELFTEST_NET_TIMEOUT,
    SELFTEST_OUTSIDE_NAME,
    SELFTEST_PASS,
    SELFTEST_SKIP,
    VERSION,
    pin_is_weak,
    workspace_path,
)


class CheckResult(object):
    """One self-test result: status, short name, and a detail sentence."""

    def __init__(self, status, name, detail):
        """Store one result line.

        Args:
            status (str): SELFTEST_PASS, SELFTEST_FAIL or SELFTEST_SKIP.
            name (str): Short check name (python3, config, server, ...).
            detail (str): Human-readable outcome; must not contain a PIN.
        """
        self.status = status
        self.name = name
        self.detail = detail


def format_check_line(result):
    """Return one printed self-test line, without a trailing newline.

    Args:
        result (CheckResult): The result to format.

    Returns:
        str: 'STATUS  name: detail'.
    """
    return "%s  %s: %s" % (result.status, result.name, result.detail)


def redact_pin(text, pin):
    """Replace every occurrence of pin in text with PIN_REDACT_MARK.

    Args:
        text: A string (or any value converted with str). None becomes "".
        pin (str | None): The secret to strip. Empty or None is a no-op.

    Returns:
        str: text with the PIN removed.
    """
    if text is None:
        return ""
    text = text if isinstance(text, str) else str(text)
    if not pin:
        return text
    return text.replace(str(pin), PIN_REDACT_MARK)


def pin_leaks(text, pin):
    """Return True if a non-empty pin appears as a substring of text.

    Args:
        text (str): Haystack (already a string).
        pin (str | None): PIN to look for.

    Returns:
        bool: True only when pin is non-empty and present.
    """
    if not pin or not text:
        return False
    return str(pin) in text


def _result(status, name, detail, pin=None):
    """Build a CheckResult, redacting pin from the detail first.

    Args:
        status (str): PASS, FAIL or SKIP.
        name (str): Check name.
        detail (str): Detail sentence, possibly unsafe.
        pin (str | None): PIN to strip from detail.

    Returns:
        CheckResult: With a redacted detail string.
    """
    return CheckResult(status, name, redact_pin(detail, pin))


def check_python():
    """Check that python3 meets the minimum version.

    Returns:
        CheckResult: PASS with the version, or FAIL if it is too old.
    """
    # info is the running interpreter version (major, minor, micro).
    info = sys.version_info
    version = "%d.%d.%d" % (info[0], info[1], info[2])
    if (info[0], info[1]) >= (PYTHON_MIN_MAJOR, PYTHON_MIN_MINOR):
        return _result(
            SELFTEST_PASS,
            "python3",
            "%s (need %d.%d+)" % (version, PYTHON_MIN_MAJOR, PYTHON_MIN_MINOR),
        )
    return _result(
        SELFTEST_FAIL,
        "python3",
        "%s is too old (need %d.%d+)"
        % (version, PYTHON_MIN_MAJOR, PYTHON_MIN_MINOR),
    )


def load_config():
    """Load and validate a Config from the environment and mcp.conf.

    Returns:
        tuple[Config | None, CheckResult]: The config when loading
        succeeded (the result may still be FAIL if the PIN is weak),
        or (None, FAIL) when the file or values cannot be used.
    """
    try:
        cfg = Config().validate()
    except (ConfigError, ValueError, OSError) as exc:
        return None, _result(
            SELFTEST_FAIL, "config", "not readable or invalid: %s" % exc
        )
    # pin is read only to classify it; it is never added to the detail.
    pin = getattr(cfg, "pin", "") or ""
    if pin_is_weak(pin) or pin == DEFAULT_PIN:
        return cfg, _result(
            SELFTEST_FAIL,
            "config",
            "readable, but the PIN is the default or too weak (not printed)",
        )
    return cfg, _result(
        SELFTEST_PASS,
        "config",
        "readable, PIN is set and is not the default or a weak value",
    )


def _mcp_url(cfg):
    """Return the local MCP endpoint URL for cfg.

    Args:
        cfg (Config): Must expose host and port.

    Returns:
        str: http://host:port/mcp
    """
    host = getattr(cfg, "host", None) or "127.0.0.1"
    port = int(getattr(cfg, "port", 0) or 0)
    return "http://%s:%s/mcp" % (host, port)


def _rpc(cfg, method, params=None, req_id=1, timeout=None):
    """POST one authenticated JSON-RPC method to the local server.

    The PIN is sent only as an Authorization Bearer header, never on
    the URL and never logged.

    Args:
        cfg (Config): Supplies host, port and pin.
        method (str): JSON-RPC method name.
        params (dict | None): JSON-RPC params; omitted when None.
        req_id: JSON-RPC id.
        timeout (float | None): urllib timeout; defaults to
            SELFTEST_HTTP_TIMEOUT.

    Returns:
        tuple[int, dict | str | None, str | None]: HTTP status, parsed
        JSON body (or raw text), and an error string on transport
        failure (already safe to print).

    Raises:
        This function catches network and HTTP errors and returns them
        as the third tuple item instead of raising.
    """
    url = _mcp_url(cfg)
    payload = {"jsonrpc": "2.0", "method": method, "id": req_id}
    if params is not None:
        payload["params"] = params
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer %s" % (cfg.pin,),
    }
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    # wait is the socket timeout for this probe.
    wait = SELFTEST_HTTP_TIMEOUT if timeout is None else timeout
    try:
        with urllib.request.urlopen(req, timeout=wait) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read() if exc.fp is not None else b""
    except Exception as exc:
        return 0, None, "no answer: %s" % exc
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            parsed = raw.decode("utf-8", errors="replace")
    return status, parsed, None


def check_server(cfg):
    """Check that the local server answers initialize with the PIN.

    Args:
        cfg (Config): Live configuration (host, port, pin).

    Returns:
        CheckResult: PASS when initialize succeeds, otherwise FAIL.
    """
    params = {
        "protocolVersion": LATEST_PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {"name": SELFTEST_CLIENT_NAME, "version": VERSION},
    }
    status, parsed, err = _rpc(cfg, "initialize", params)
    if err:
        return _result(SELFTEST_FAIL, "server", "not answering on %s" % _mcp_url(cfg), cfg.pin)
    if status != 200 or not isinstance(parsed, dict) or "result" not in parsed:
        # hint is a short, redacted reason for a non-result response.
        hint = "HTTP %s" % status
        if isinstance(parsed, dict) and parsed.get("error"):
            hint = "HTTP %s: %s" % (status, parsed["error"])
        return _result(
            SELFTEST_FAIL,
            "server",
            "initialize failed (%s)" % hint,
            cfg.pin,
        )
    result = parsed["result"]
    version = ""
    if isinstance(result, dict):
        info = result.get("serverInfo") or {}
        version = info.get("version") or ""
    detail = "running, initialize answered on port %s" % cfg.port
    if version:
        detail += " (version %s)" % version
    return _result(SELFTEST_PASS, "server", detail, cfg.pin)


def _tool_run(cfg, command, timeout=None):
    """Call run_command on the live server and return the tool payload.

    Args:
        cfg (Config): Live configuration.
        command (str): Shell command to run.
        timeout (float | None): Tool timeout; defaults to
            SELFTEST_COMMAND_TIMEOUT.

    Returns:
        tuple[dict | None, str | None]: The parsed tool result dict, or
        (None, error) when the call failed. The error is safe to print.
    """
    wait = SELFTEST_COMMAND_TIMEOUT if timeout is None else timeout
    # rpc_timeout is slightly longer than the command so HTTP does not
    # fire first on a well-behaved command.
    rpc_timeout = wait + SELFTEST_HTTP_TIMEOUT
    status, parsed, err = _rpc(
        cfg,
        "tools/call",
        {"name": "run_command", "arguments": {"command": command, "timeout": wait}},
        timeout=rpc_timeout,
    )
    if err:
        return None, err
    if status != 200 or not isinstance(parsed, dict):
        return None, "HTTP %s" % status
    if parsed.get("error"):
        return None, "rpc error"
    result = parsed.get("result") or {}
    content = result.get("content") or []
    text = ""
    if content and isinstance(content[0], dict):
        text = content[0].get("text") or ""
    if result.get("isError"):
        return None, text or "tool error"
    try:
        data = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        return None, "unexpected tool output"
    if not isinstance(data, dict):
        return None, "unexpected tool output"
    return data, None


def check_jail(cfg):
    """Confirm cwd, non-root uid, sandbox-as-/, and host paths are hidden.

    Writes a short-lived marker in /workspace and a second marker
    outside the sandbox, then runs a probe command through the live
    server. Both markers are removed afterwards.

    Args:
        cfg (Config): Live configuration with root and workspace.

    Returns:
        CheckResult: PASS, FAIL, or SKIP when isolation is off.
    """
    sandbox_mode = str(getattr(cfg, "sandbox", "ns") or "ns").strip().lower()
    if sandbox_mode in ("none", "off", "0"):
        return _result(
            SELFTEST_SKIP,
            "jail",
            "isolation is off (MCP_SANDBOX=none); jail checks were not run",
        )
    workspace = getattr(cfg, "workspace", None) or workspace_path(cfg.root)
    root = getattr(cfg, "root", None)
    if not workspace or not os.path.isdir(workspace) or not root:
        return _result(SELFTEST_FAIL, "jail", "sandbox or /workspace is missing")
    # inside_path is visible at /workspace/<name> only if '/' is the sandbox.
    inside_path = os.path.join(workspace, SELFTEST_MARKER_NAME)
    # outside_dir is a temp folder next to, not inside, the sandbox.
    outside_dir = tempfile.mkdtemp(prefix="aimcp-selftest-")
    outside_path = os.path.join(outside_dir, SELFTEST_OUTSIDE_NAME)
    try:
        with open(inside_path, "w", encoding="utf-8") as fh:
            fh.write(SELFTEST_MARK_ROOT + "\n")
        with open(outside_path, "w", encoding="utf-8") as fh:
            fh.write("OUTSIDE\n")
        # probe prints one marker per check; quotes around the outside
        # path are single quotes so a space in the temp dir is safe.
        probe = (
            "if [ \"$(pwd)\" = \"%s\" ]; then echo %s; fi; "
            "if [ \"$(id -u)\" != \"0\" ]; then echo %s; fi; "
            "if [ -f /%s/%s ]; then echo %s; fi; "
            "if [ ! -e '%s' ]; then echo %s; fi"
            % (
                JAIL_WORKSPACE_PATH,
                SELFTEST_MARK_CWD,
                SELFTEST_MARK_UID,
                "workspace",
                SELFTEST_MARKER_NAME,
                SELFTEST_MARK_ROOT,
                outside_path,
                SELFTEST_MARK_ISOLATED,
            )
        )
        data, err = _tool_run(cfg, probe)
        if err or not data:
            return _result(SELFTEST_FAIL, "jail", "probe failed: %s" % (err or "no result"), cfg.pin)
        combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
        # missing lists the markers that did not appear in the output.
        missing = []
        if SELFTEST_MARK_CWD not in combined:
            missing.append("cwd is not %s" % JAIL_WORKSPACE_PATH)
        if SELFTEST_MARK_UID not in combined:
            missing.append("uid is root or unknown")
        if SELFTEST_MARK_ROOT not in combined:
            missing.append("/ is not the sandbox")
        if SELFTEST_MARK_ISOLATED not in combined:
            missing.append("a host path was reachable")
        if missing:
            return _result(
                SELFTEST_FAIL,
                "jail",
                "; ".join(missing),
                cfg.pin,
            )
        # uid_note mentions the expected mapped uid when we can see it.
        return _result(
            SELFTEST_PASS,
            "jail",
            "cwd=%s, uid is not root (mapped %d), / is the sandbox, "
            "host paths unreachable" % (JAIL_WORKSPACE_PATH, JAIL_UID),
            cfg.pin,
        )
    finally:
        try:
            os.unlink(inside_path)
        except OSError:
            pass
        try:
            os.unlink(outside_path)
        except OSError:
            pass
        try:
            os.rmdir(outside_dir)
        except OSError:
            pass


def check_network(cfg):
    """Check that the jail has no network, unless network is enabled.

    Args:
        cfg (Config): Live configuration (sandbox, sandbox_net).

    Returns:
        CheckResult: PASS when blocked (or honestly reported as enabled),
        FAIL if a blocked jail can still connect, SKIP if isolation is off.
    """
    sandbox_mode = str(getattr(cfg, "sandbox", "ns") or "ns").strip().lower()
    if sandbox_mode in ("none", "off", "0"):
        return _result(
            SELFTEST_SKIP,
            "network",
            "isolation is off; commands use the host network",
        )
    if getattr(cfg, "sandbox_net", False):
        return _result(
            SELFTEST_PASS,
            "network",
            "enabled (MCP_SANDBOX_NET=1)",
        )
    # probe tries a raw-IP TCP connect so DNS is not required.
    probe = (
        "python3 -c \"import socket; s=socket.socket(); "
        "s.settimeout(%s); s.connect(('%s', %d)); s.close()\" "
        "2>/dev/null && echo NET_OPEN || echo NET_BLOCKED"
        % (SELFTEST_NET_TIMEOUT, SELFTEST_NET_HOST, SELFTEST_NET_PORT)
    )
    data, err = _tool_run(cfg, probe, timeout=SELFTEST_COMMAND_TIMEOUT)
    if err or not data:
        return _result(SELFTEST_FAIL, "network", "probe failed: %s" % (err or "no result"), cfg.pin)
    combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
    if "NET_OPEN" in combined and "NET_BLOCKED" not in combined:
        return _result(
            SELFTEST_FAIL,
            "network",
            "expected to be blocked, but a TCP connect succeeded",
            cfg.pin,
        )
    return _result(SELFTEST_PASS, "network", "blocked", cfg.pin)


def check_git(cfg):
    """Check that git works in /workspace (it should already be a repo).

    Args:
        cfg (Config): Live configuration.

    Returns:
        CheckResult: PASS, FAIL, or SKIP if git is missing on the host.
    """
    data, err = _tool_run(cfg, "git rev-parse --is-inside-work-tree")
    if err or not data:
        return _result(SELFTEST_FAIL, "git", "probe failed: %s" % (err or "no result"), cfg.pin)
    combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
    if data.get("exit_code") == 0 and "true" in combined:
        return _result(SELFTEST_PASS, "git", "works in %s" % JAIL_WORKSPACE_PATH, cfg.pin)
    return _result(
        SELFTEST_FAIL,
        "git",
        "did not report a repository in %s" % JAIL_WORKSPACE_PATH,
        cfg.pin,
    )


def check_awk(cfg):
    """Check that awk resolves and runs inside the jail.

    Args:
        cfg (Config): Live configuration (bind_alternatives, sandbox).

    Returns:
        CheckResult: PASS if awk works, FAIL if it should but does not,
        SKIP if isolation is off or the alternatives bind is disabled
        and awk is missing.
    """
    sandbox_mode = str(getattr(cfg, "sandbox", "ns") or "ns").strip().lower()
    data, err = _tool_run(cfg, "command -v awk && awk 'BEGIN{print \"AWK_OK\"}'")
    if err or not data:
        return _result(SELFTEST_FAIL, "awk", "probe failed: %s" % (err or "no result"), cfg.pin)
    combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
    if data.get("exit_code") == 0 and "AWK_OK" in combined:
        return _result(SELFTEST_PASS, "awk", "available and runs", cfg.pin)
    if sandbox_mode in ("none", "off", "0"):
        return _result(
            SELFTEST_SKIP,
            "awk",
            "not available on this host (isolation is off)",
            cfg.pin,
        )
    if not getattr(cfg, "bind_alternatives", True):
        return _result(
            SELFTEST_SKIP,
            "awk",
            "MCP_ALTERNATIVES is off and awk did not run",
            cfg.pin,
        )
    return _result(
        SELFTEST_FAIL,
        "awk",
        "not found or did not run (is /etc/alternatives bound?)",
        cfg.pin,
    )


def check_workspace_limit(cfg):
    """Report whether the /workspace size limit is on, and its usage.

    Either state is a PASS if it can be determined (the limit is
    optional). FAIL only when the workspace path is missing.

    Args:
        cfg (Config): Live configuration.

    Returns:
        CheckResult: PASS with on/off and usage, or FAIL if unreadable.
    """
    from .workspace import workspace_limit_status

    workspace = getattr(cfg, "workspace", None)
    if not workspace or not os.path.isdir(workspace):
        return _result(SELFTEST_FAIL, "workspace size limit", "/workspace is missing")
    # on is whether the folder is a separate mount.
    on = bool(getattr(cfg, "workspace_limit_on", False))
    label = workspace_limit_status(workspace, on)
    return _result(
        SELFTEST_PASS,
        "workspace size limit",
        label,
        getattr(cfg, "pin", None),
    )


def check_funnel():
    """Check that Tailscale Funnel publishes FUNNEL_PATH, if tailscale exists.

    Returns:
        CheckResult: PASS, FAIL, or SKIP when tailscale is not installed.
    """
    # which is used only to decide SKIP vs a real check.
    try:
        found = subprocess.run(
            ["sh", "-c", "command -v tailscale"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return _result(SELFTEST_SKIP, "funnel", "tailscale is not installed")
    if found.returncode != 0:
        return _result(SELFTEST_SKIP, "funnel", "tailscale is not installed")
    try:
        proc = subprocess.run(
            ["tailscale", "funnel", "status"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
            text=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return _result(SELFTEST_FAIL, "funnel", "could not read funnel status: %s" % exc)
    output = proc.stdout or ""
    if FUNNEL_PATH in output:
        return _result(SELFTEST_PASS, "funnel", "%s is configured" % FUNNEL_PATH)
    return _result(
        SELFTEST_FAIL,
        "funnel",
        "%s is not in `tailscale funnel status` (fix with: ./mcp.sh --funnel)"
        % FUNNEL_PATH,
    )


def check_autostart(cfg=None):
    """Check that a user crontab @reboot line starts this install's mcp.sh.

    Args:
        cfg: Optional Config; install_dir is inferred from this package
            when cfg is None.

    Returns:
        CheckResult: PASS, FAIL, or SKIP if crontab is not installed.
    """
    # dest is the directory that holds mcp.sh.
    if cfg is not None and getattr(cfg, "conf_path", None):
        dest = os.path.dirname(os.path.realpath(cfg.conf_path))
    else:
        dest = os.path.realpath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        )
    # script is the path install.sh would put on the crontab line.
    script = os.path.join(dest, "mcp.sh")
    try:
        found = subprocess.run(
            ["sh", "-c", "command -v crontab"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return _result(SELFTEST_SKIP, "autostart", "crontab is not installed")
    if found.returncode != 0:
        return _result(SELFTEST_SKIP, "autostart", "crontab is not installed")
    try:
        proc = subprocess.run(
            ["crontab", "-l"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=5,
            text=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return _result(SELFTEST_FAIL, "autostart", "could not read crontab: %s" % exc)
    output = proc.stdout or ""
    if script in output and "mcp.sh" in output:
        return _result(
            SELFTEST_PASS,
            "autostart",
            "cron @reboot line present for %s" % script,
        )
    return _result(
        SELFTEST_FAIL,
        "autostart",
        "no @reboot crontab line for %s (install.sh adds one)" % script,
    )


def run_all(cfg=None, include_live=True):
    """Run every self-test check and return the results in order.

    Args:
        cfg (Config | None): If None, a Config is loaded from the
            environment and mcp.conf. When provided, the config check
            still classifies the PIN.
        include_live (bool): If False, skip checks that need a running
            server (used by unit tests). Default True.

    Returns:
        list[CheckResult]: In the documented order.
    """
    results = [check_python()]
    if cfg is None:
        loaded, conf_result = load_config()
        cfg = loaded
        results.append(conf_result)
    else:
        # pin classification still applies when a Config is supplied.
        pin = getattr(cfg, "pin", "") or ""
        if pin_is_weak(pin) or pin == DEFAULT_PIN:
            results.append(_result(
                SELFTEST_FAIL,
                "config",
                "readable, but the PIN is the default or too weak (not printed)",
            ))
        else:
            results.append(_result(
                SELFTEST_PASS,
                "config",
                "readable, PIN is set and is not the default or a weak value",
            ))
    if cfg is None:
        # Remaining checks that need a Config cannot run.
        for name in (
            "server", "jail", "network", "git", "awk", "workspace size limit",
        ):
            results.append(_result(SELFTEST_SKIP, name, "skipped because config did not load"))
        results.append(check_funnel())
        results.append(check_autostart(None))
        return results
    if not include_live:
        results.append(check_workspace_limit(cfg))
        results.append(check_funnel())
        results.append(check_autostart(cfg))
        return results
    server = check_server(cfg)
    results.append(server)
    if server.status != SELFTEST_PASS:
        for name in ("jail", "network", "git", "awk"):
            results.append(_result(
                SELFTEST_SKIP, name, "skipped because the server is not answering"
            ))
    else:
        results.append(check_jail(cfg))
        results.append(check_network(cfg))
        results.append(check_git(cfg))
        results.append(check_awk(cfg))
    results.append(check_workspace_limit(cfg))
    results.append(check_funnel())
    results.append(check_autostart(cfg))
    return results


def summarise(results):
    """Return (passed, failed, skipped, exit_code) for a result list.

    Args:
        results (list[CheckResult]): Output of run_all().

    Returns:
        tuple[int, int, int, int]: Counts and the process exit status
        (1 if any FAIL, else 0).
    """
    passed = sum(1 for item in results if item.status == SELFTEST_PASS)
    failed = sum(1 for item in results if item.status == SELFTEST_FAIL)
    skipped = sum(1 for item in results if item.status == SELFTEST_SKIP)
    exit_code = 1 if failed else 0
    return passed, failed, skipped, exit_code


def format_summary(passed, failed, skipped):
    """Return the summary line printed at the end of a self-test.

    Args:
        passed (int): PASS count.
        failed (int): FAIL count.
        skipped (int): SKIP count.

    Returns:
        str: A one-line summary, without a trailing newline.
    """
    return "%d passed, %d failed, %d skipped" % (passed, failed, skipped)


def main(argv=None):
    """Run the self-test and print results to stdout.

    Args:
        argv (list[str] | None): Unused arguments (accepted for symmetry
            with other entry points). The self-test takes no flags.

    Returns:
        int: 1 if any check failed, otherwise 0.
    """
    del argv  # no flags; mcp.sh already loaded mcp.conf into the env.
    results = run_all()
    # pin is used only to make a final leak check on printed text.
    pin = None
    try:
        pin = Config().pin
    except Exception:
        pin = None
    for item in results:
        line = format_check_line(item)
        if pin_leaks(line, pin):
            line = redact_pin(line, pin)
        sys.stdout.write(line + "\n")
    passed, failed, skipped, code = summarise(results)
    sys.stdout.write(format_summary(passed, failed, skipped) + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
