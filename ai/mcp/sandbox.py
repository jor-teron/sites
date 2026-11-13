"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/sandbox.py
Purpose:      Layer 2 of isolation: per-command user, mount, PID, IPC and
              UTS namespaces (and a network namespace unless MCP_SANDBOX_NET=1),
              rlimits, no_new_privs, and the command runner. After unshare
              it hands off to jail.enter() for layer 1. Commands run as a
              mapped non-root uid. A fresh Python interpreter is spawned
              for each command so the threaded HTTP server never fork()s.
Place:        mcp/sandbox.py — called from tools.tool_run_command, and also
              as `python3 -m mcp.sandbox --worker <job.json>` for the child.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+ standard library only, plus mcp.jail, mcp.nscompat
              and constants from mcp.config.
"""
from __future__ import annotations

import json
import os
import tempfile
import resource
import signal
import subprocess
import sys
import threading
import time
import traceback

from . import jail
from .config import (
    ALLOW_NET_FLAG,
    BYTES_PER_MIB,
    GIT_DEFAULT_EMAIL,
    GIT_DEFAULT_NAME,
    CPU_TIMEOUT_PAD,
    DEFAULT_LANG,
    DEFAULT_MAX_PROCS,
    DEFAULT_MEMORY_MB,
    DEFAULT_NOFILE,
    DEFAULT_FSIZE,
    DEFAULT_TIMEOUT,
    DURATION_DECIMALS,
    JAIL_PATH,
    JAIL_SHELL,
    JAIL_TERM,
    JAIL_TMP_PATH,
    JAIL_USER_NAME,
    JAIL_WORKSPACE_PATH,
    JOB_FILE_MODE,
    JOB_FILE_PREFIX,
    JOB_FILE_SUFFIX,
    MAX_OUTPUT,
    MAX_TIMEOUT,
    MIN_CPU_SECONDS,
    MIN_MAX_PROCS,
    MIN_MEMORY_MB,
    PIPE_POLL_MAX,
    PIPE_POLL_MIN,
    PIPE_READ_SIZE,
    REAP_GRACE_SEC,
    RLIMIT_CORE_VALUE,
    SANDBOX_DISABLED_VALUES,
    SANDBOX_FAIL_EXIT,
    SANDBOX_ORPHAN_EXIT,
    SANDBOX_USAGE_EXIT,
    SIGNAL_EXIT_OFFSET,
    TIMEOUT_EXIT_CODE,
    TRUNC_MARK,
)
from .nscompat import (
    CLONE_NEWIPC,
    CLONE_NEWNET,
    CLONE_NEWNS,
    CLONE_NEWPID,
    CLONE_NEWUSER,
    CLONE_NEWUTS,
    PR_SET_NO_NEW_PRIVS,
    PR_SET_PDEATHSIG,
    libc_prctl,
    libc_unshare,
)


class SandboxError(Exception):
    """Reserved for sandbox setup failures raised to the caller.

    Most child-side failures are written to the error pipe and surfaced
    as a non-zero exit_code instead, so this class is rarely raised.
    """


def _kill_pg(proc_or_pid):
    """Send SIGKILL to a process group, falling back to the single pid.

    Args:
        proc_or_pid (int | subprocess.Popen): A pid or a Popen object
            whose pid is the process-group leader (start_new_session or
            setsid was used).

    Returns:
        None. OSError is ignored (the process may already have exited).
    """
    pid = proc_or_pid if isinstance(proc_or_pid, int) else proc_or_pid.pid
    if pid <= 0:
        return
    try:
        os.killpg(pid, signal.SIGKILL)
    except OSError:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


def apply_rlimits(cfg, timeout):
    """Apply CPU, memory, process, file-size and no-new-privs limits.

    Called inside the jail, just before exec of bash. Every configured
    limit and no_new_privs is mandatory; a failure aborts command startup
    rather than running with weaker isolation.

    Args:
        cfg (Config | _CfgView): Must expose memory_mb and max_procs.
        timeout (float | int): Command wall-clock timeout, in seconds.
            RLIMIT_CPU is set to timeout + CPU_TIMEOUT_PAD so the
            wall-clock killer usually fires first.

    Returns:
        None.
    """

    def _set(res, value):
        """Set a hard and soft rlimit or abort sandbox startup.

        Args:
            res (int): A resource.RLIMIT_* constant.
            value (int): Both the soft and hard limit.

        Returns:
            None.
        """
        try:
            resource.setrlimit(res, (value, value))
        except (OSError, ValueError, resource.error) as exc:
            raise SandboxError("cannot apply resource limit %s: %s" % (res, exc)) from exc

    cpu = max(MIN_CPU_SECONDS, int(timeout) + CPU_TIMEOUT_PAD)
    mem = int(getattr(cfg, "memory_mb", DEFAULT_MEMORY_MB) or DEFAULT_MEMORY_MB)
    procs = int(getattr(cfg, "max_procs", DEFAULT_MAX_PROCS) or DEFAULT_MAX_PROCS)
    _set(resource.RLIMIT_CPU, cpu)
    if hasattr(resource, "RLIMIT_AS"):
        _set(resource.RLIMIT_AS, max(MIN_MEMORY_MB, mem) * BYTES_PER_MIB)
    _set(resource.RLIMIT_NPROC, max(MIN_MAX_PROCS, procs))
    _set(resource.RLIMIT_NOFILE, DEFAULT_NOFILE)
    _set(resource.RLIMIT_FSIZE, DEFAULT_FSIZE)
    _set(resource.RLIMIT_CORE, RLIMIT_CORE_VALUE)
    # no_new_privs: setuid binaries (su, sudo, passwd) cannot gain caps.
    try:
        libc_prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)
    except OSError as exc:
        raise SandboxError("cannot set no_new_privs: %s" % exc) from exc


def jail_env():
    """Return the environment dict used inside the jail (no host secrets).

    Host environment variables are not copied, so MCP_PIN, PATH additions
    and so on cannot leak into the command. LANG is the only host value
    that is reused, falling back to DEFAULT_LANG.

    HOME and PWD are /workspace. A default git identity is set so
    `git commit` works without a user gitconfig; /etc/gitconfig (on the
    private /etc tmpfs) also sets user.* and safe.directory.

    Returns:
        dict[str, str]: The environment passed to execve.
    """
    lang = os.environ.get("LANG") or DEFAULT_LANG
    return {
        "PATH": JAIL_PATH,
        "HOME": JAIL_WORKSPACE_PATH,
        "USER": JAIL_USER_NAME,
        "LOGNAME": JAIL_USER_NAME,
        "LANG": lang,
        "LC_ALL": lang,
        "TMPDIR": JAIL_TMP_PATH,
        "TMP": JAIL_TMP_PATH,
        "TEMP": JAIL_TMP_PATH,
        "PWD": JAIL_WORKSPACE_PATH,
        "TERM": JAIL_TERM,
        "SHELL": JAIL_SHELL,
        "GIT_AUTHOR_NAME": GIT_DEFAULT_NAME,
        "GIT_AUTHOR_EMAIL": GIT_DEFAULT_EMAIL,
        "GIT_COMMITTER_NAME": GIT_DEFAULT_NAME,
        "GIT_COMMITTER_EMAIL": GIT_DEFAULT_EMAIL,
    }


def _child_enter_and_exec(cfg, command, cwd, timeout, err_fd):
    """Unshare namespaces, fork for the PID ns, enter the jail, and exec bash.

    Called in the worker process (a fresh interpreter). On success this
    function does not return: bash replaces the process. On failure a
    traceback is written to err_fd and the process exits SANDBOX_FAIL_EXIT.

    Args:
        cfg (Config | _CfgView): Runtime configuration (root, binds, limits).
        command (str): Shell command passed to `bash -lc`.
        cwd (str | None): Host working directory to resume inside the jail.
        timeout (float): Used only to size RLIMIT_CPU.
        err_fd (int): File descriptor for setup-error messages (usually
            stderr of the worker, which the parent collects as stderr).

    Returns:
        None. Either execve succeeds or os._exit is called.
    """
    try:
        try:
            # New session: the parent can kill the whole group on timeout.
            os.setsid()
        except OSError:
            pass
        try:
            # If the worker's parent (the HTTP server child) dies, kill us.
            libc_prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0)
        except OSError:
            pass
        if os.getppid() == 1:
            # Parent already died before we could set PDEATHSIG.
            os._exit(SANDBOX_ORPHAN_EXIT)

        # Capture host ids before unshare: afterwards getuid() is the
        # overflow uid until the map is written.
        host_uid = os.getuid()
        host_gid = os.getgid()
        flags = (
            CLONE_NEWUSER
            | CLONE_NEWNS
            | CLONE_NEWPID
            | CLONE_NEWIPC
            | CLONE_NEWUTS
        )
        # One-time approval: if the flag file exists, allow network
        # for this command and remove the flag.
        allow_once = False
        try:
            if os.path.exists(ALLOW_NET_FLAG):
                allow_once = True
                os.unlink(ALLOW_NET_FLAG)
        except Exception:
            pass
        if not getattr(cfg, "sandbox_net", False) and not allow_once:
            flags |= CLONE_NEWNET
        libc_unshare(flags)
        # Map this process to uid 0 in the new user ns so it can mount
        # and pivot_root; drop_to_mapped_user() later moves us to JAIL_UID.
        jail.write_maps(host_uid, host_gid, inside_uid=0, inside_gid=0)

        # CLONE_NEWPID only takes effect for children, so we fork once more.
        pid = os.fork()
        if pid != 0:
            # Intermediate process: wait for jail PID 1 and propagate its status.
            _, status = os.waitpid(pid, 0)
            if os.WIFEXITED(status):
                os._exit(os.WEXITSTATUS(status))
            if os.WIFSIGNALED(status):
                os._exit(SIGNAL_EXIT_OFFSET + os.WTERMSIG(status))
            os._exit(SANDBOX_ORPHAN_EXIT)

        # PID 1 in the new PID namespace.
        try:
            libc_prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0)
        except OSError:
            pass
        binds = getattr(cfg, "binds", None) or ()
        # bind_alternatives defaults to True so awk/vi resolve on Debian.
        bind_alternatives = getattr(cfg, "bind_alternatives", True)
        jail.enter(
            cfg.root,
            cwd=cwd,
            binds=binds,
            drop_user=True,
            bind_alternatives=bind_alternatives,
        )
        apply_rlimits(cfg, timeout)
        env = jail_env()
        if cwd:
            # jail.enter already chdir'd; keep PWD in sync.
            try:
                env["PWD"] = os.getcwd()
            except OSError:
                env["PWD"] = JAIL_WORKSPACE_PATH
        os.execve(JAIL_SHELL, ["bash", "-lc", command], env)
    except Exception:
        try:
            msg = "mcp-sandbox: %s\n" % traceback.format_exc()
            os.write(err_fd, msg.encode("utf-8", errors="replace"))
        except OSError:
            pass
        os._exit(SANDBOX_FAIL_EXIT)


def _run_pipes(pid, out_r, err_r, timeout):
    """Read stdout/stderr from the jail child with a cap and a wall-clock timeout.

    Combined output is capped at MAX_OUTPUT bytes; extra data is discarded
    and truncated is set. On timeout the child's process group is killed
    and a short grace period is given for it to be reaped.

    Args:
        pid (int): Pid of the worker (session leader).
        out_r (int): Read fd for the worker's stdout.
        err_r (int): Read fd for the worker's stderr.
        timeout (float): Wall-clock timeout in seconds.

    Returns:
        dict: exit_code, stdout, stderr, timed_out, truncated, duration_sec.
    """
    started = time.time()
    # remaining/truncated are lists so the reader threads can mutate them.
    remaining = [MAX_OUTPUT]
    truncated = [False]
    out_chunks, err_chunks = [], []

    def reader(fd, dest):
        """Copy fd into dest until EOF, honouring the shared byte cap.

        Args:
            fd (int): File descriptor to read (closed when this returns).
            dest (list): List of byte chunks to append to.

        Returns:
            None.
        """
        try:
            while True:
                data = os.read(fd, PIPE_READ_SIZE)
                if not data:
                    break
                take = remaining[0]
                if take <= 0:
                    truncated[0] = True
                    continue
                if len(data) > take:
                    dest.append(data[:take])
                    remaining[0] = 0
                    truncated[0] = True
                else:
                    dest.append(data)
                    remaining[0] = take - len(data)
        except OSError:
            pass
        finally:
            try:
                os.close(fd)
            except OSError:
                pass

    threads = []
    for fd, dest in ((out_r, out_chunks), (err_r, err_chunks)):
        thread = threading.Thread(target=reader, args=(fd, dest))
        thread.daemon = True
        thread.start()
        threads.append(thread)

    timed_out = False
    deadline = time.time() + timeout
    status = None
    while True:
        remaining_wait = deadline - time.time()
        if remaining_wait <= 0:
            timed_out = True
            _kill_pg(pid)
            break
        try:
            waited, status = os.waitpid(pid, os.WNOHANG)
        except OSError:
            waited, status = 0, None
        if waited == pid:
            break
        time.sleep(min(PIPE_POLL_MAX, max(PIPE_POLL_MIN, remaining_wait)))

    if timed_out:
        try:
            # Reap with a short grace period after SIGKILL.
            grace = time.time() + REAP_GRACE_SEC
            while time.time() < grace:
                try:
                    waited, status = os.waitpid(pid, os.WNOHANG)
                    if waited == pid:
                        break
                except OSError:
                    break
                time.sleep(PIPE_POLL_MAX)
            else:
                _kill_pg(pid)
                try:
                    _, status = os.waitpid(pid, 0)
                except OSError:
                    pass
        except OSError:
            pass

    for thread in threads:
        thread.join(timeout=REAP_GRACE_SEC)

    stdout = b"".join(out_chunks).decode("utf-8", errors="replace")
    stderr = b"".join(err_chunks).decode("utf-8", errors="replace")
    if truncated[0]:
        stdout = stdout + TRUNC_MARK

    if timed_out:
        exit_code = TIMEOUT_EXIT_CODE
    elif status is None:
        exit_code = TIMEOUT_EXIT_CODE
    elif os.WIFEXITED(status):
        exit_code = os.WEXITSTATUS(status)
    elif os.WIFSIGNALED(status):
        exit_code = SIGNAL_EXIT_OFFSET + os.WTERMSIG(status)
    else:
        exit_code = TIMEOUT_EXIT_CODE

    return {
        "exit_code": exit_code,
        "stdout": stdout,
        "stderr": stderr,
        "timed_out": timed_out,
        "truncated": truncated[0],
        "duration_sec": round(time.time() - started, DURATION_DECIMALS),
    }


class _CfgView(object):
    """Minimal cfg rebuilt in the worker process from a JSON payload.

    The worker is a fresh interpreter, so it cannot see the parent's
    Config object. Only the fields needed to enter the jail and apply
    rlimits are carried across.
    """

    def __init__(self, data):
        """Populate attributes from a job dict.

        Args:
            data (dict): The JSON object written by run_sandboxed.

        Returns:
            None.
        """
        self.root = data["root"]
        self.sandbox_net = bool(data.get("sandbox_net"))
        self.memory_mb = int(data.get("memory_mb") or DEFAULT_MEMORY_MB)
        self.max_procs = int(data.get("max_procs") or DEFAULT_MAX_PROCS)
        self.binds = [tuple(item) for item in (data.get("binds") or ())]
        # Missing key (older job files) keeps the Debian awk/vi bind on.
        if "bind_alternatives" in data:
            self.bind_alternatives = bool(data.get("bind_alternatives"))
        else:
            self.bind_alternatives = True


def _worker_main(job_path):
    """Entry point of `python3 -m mcp.sandbox --worker <job.json>`.

    Reads and then deletes the job file (it must not linger, and it must
    never sit inside the sandbox folder). Then enters the jail and execs.

    Args:
        job_path (str): Path to the JSON job file.

    Returns:
        None. Always exits via _child_enter_and_exec or os._exit.
    """
    try:
        with open(job_path, "r", encoding="utf-8") as fh:
            job = json.load(fh)
    finally:
        try:
            os.unlink(job_path)
        except OSError:
            pass
    cfg = _CfgView(job)
    _child_enter_and_exec(
        cfg, job["command"], job.get("cwd"), float(job["timeout"]), sys.stderr.fileno()
    )
    os._exit(SANDBOX_FAIL_EXIT)


def run_sandboxed(command, cwd, timeout, cfg):
    """Run a command inside a fresh interpreter, namespaces, and the jail.

    A job file is written with mode JOB_FILE_MODE, the worker is started
    with start_new_session=True, and stdout/stderr are collected under
    the same cap and timeout as the unsandboxed runner.

    Args:
        command (str): Shell command for `bash -lc`.
        cwd (str): Host working directory (inside MCP_ROOT).
        timeout (float): Wall-clock timeout in seconds.
        cfg (Config): Must expose root, sandbox_net, memory_mb, max_procs, binds.

    Returns:
        dict: The same result shape as _run_pipes / _run_capped.

    Raises:
        Exception: If the worker cannot be started. A leftover job file
            is removed in that case.
    """
    # Spawn a fresh interpreter so we never fork() from the threaded HTTP server.
    job = {
        "command": command,
        "cwd": cwd,
        "timeout": timeout,
        "root": os.path.realpath(cfg.root),
        "sandbox_net": bool(getattr(cfg, "sandbox_net", False)),
        "memory_mb": int(getattr(cfg, "memory_mb", DEFAULT_MEMORY_MB) or DEFAULT_MEMORY_MB),
        "max_procs": int(getattr(cfg, "max_procs", DEFAULT_MAX_PROCS) or DEFAULT_MAX_PROCS),
        "binds": [list(item) for item in (getattr(cfg, "binds", None) or ())],
        "bind_alternatives": bool(getattr(cfg, "bind_alternatives", True)),
    }
    fd, job_path = tempfile.mkstemp(prefix=JOB_FILE_PREFIX, suffix=JOB_FILE_SUFFIX)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(job, fh)
        # World-unreadable: contains only the command and paths, but still not for the sandbox.
        try:
            os.chmod(job_path, JOB_FILE_MODE)
        except OSError:
            pass
        env = os.environ.copy()
        # Put the install dir on PYTHONPATH so `python3 -m mcp.sandbox` works
        # even if the parent was started as a script.
        install = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        env["PYTHONPATH"] = install + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
        proc = subprocess.Popen(
            [sys.executable, "-m", "mcp.sandbox", "--worker", job_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            env=env,
        )
        # Steal the pipe fds so _run_pipes can close them without racing
        # Popen's file objects.
        out_r = os.dup(proc.stdout.fileno())
        err_r = os.dup(proc.stderr.fileno())
        proc.stdout.close()
        proc.stderr.close()
        try:
            return _run_pipes(proc.pid, out_r, err_r, timeout)
        finally:
            # Reap if _run_pipes already waited; this is a no-op then.
            try:
                proc.wait(timeout=0)
            except Exception:
                pass
    except Exception:
        try:
            os.unlink(job_path)
        except OSError:
            pass
        raise


def _run_capped(cmd, cwd, timeout):
    """Unsandboxed runner (MCP_SANDBOX=none). Same output cap / timeout as v1.

    The process still gets its own session so a timeout can kill the
    whole group, but there is no jail and the command can leave MCP_ROOT.

    Args:
        cmd (list[str]): argv, typically ["bash", "-lc", command].
        cwd (str): Working directory.
        timeout (float): Wall-clock timeout in seconds.

    Returns:
        dict: exit_code, stdout, stderr, timed_out, truncated, duration_sec.
    """
    started = time.time()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        start_new_session=True,
    )
    remaining = [MAX_OUTPUT]
    truncated = [False]
    out_chunks, err_chunks = [], []

    def reader(pipe, dest):
        """Copy a pipe into dest until EOF, honouring the shared byte cap.

        Args:
            pipe: A binary file object (proc.stdout or proc.stderr).
            dest (list): List of byte chunks to append to.

        Returns:
            None.
        """
        try:
            while True:
                data = pipe.read(PIPE_READ_SIZE)
                if not data:
                    break
                take = remaining[0]
                if take <= 0:
                    truncated[0] = True
                    continue
                if len(data) > take:
                    dest.append(data[:take])
                    remaining[0] = 0
                    truncated[0] = True
                else:
                    dest.append(data)
                    remaining[0] = take - len(data)
        finally:
            try:
                pipe.close()
            except OSError:
                pass

    threads = []
    for pipe, dest in ((proc.stdout, out_chunks), (proc.stderr, err_chunks)):
        thread = threading.Thread(target=reader, args=(pipe, dest))
        thread.daemon = True
        thread.start()
        threads.append(thread)
    timed_out = False
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill_pg(proc)
        try:
            proc.wait(timeout=REAP_GRACE_SEC)
        except subprocess.TimeoutExpired:
            _kill_pg(proc)
    for thread in threads:
        thread.join(timeout=REAP_GRACE_SEC)
    stdout = b"".join(out_chunks).decode("utf-8", errors="replace")
    stderr = b"".join(err_chunks).decode("utf-8", errors="replace")
    if truncated[0]:
        stdout = stdout + TRUNC_MARK
    return {
        "exit_code": TIMEOUT_EXIT_CODE if timed_out else proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "timed_out": timed_out,
        "truncated": truncated[0],
        "duration_sec": round(time.time() - started, DURATION_DECIMALS),
    }


def run_command(command, cwd, timeout, cfg):
    """Run a command in the configured sandbox mode (ns or none).

    Args:
        command (str): Shell command for `bash -lc`.
        cwd (str): Host working directory (already resolved inside MCP_ROOT).
        timeout (float): Wall-clock timeout in seconds (already capped).
        cfg (Config): Runtime configuration, including cfg.sandbox.

    Returns:
        dict: exit_code, stdout, stderr, timed_out, truncated, duration_sec.
    """
    sandbox_mode = (getattr(cfg, "sandbox", "ns") or "ns").lower()
    if sandbox_mode in SANDBOX_DISABLED_VALUES:
        return _run_capped(["bash", "-lc", command], cwd, timeout)
    return run_sandboxed(command, cwd, timeout, cfg)


if __name__ == "__main__":
    argv = sys.argv[1:]
    if argv[:1] == ["--worker"] and len(argv) == 2:
        _worker_main(argv[1])
        sys.exit(SANDBOX_FAIL_EXIT)
    sys.stderr.write("Usage: python3 -m mcp.sandbox --worker <job.json>\n")
    sys.exit(SANDBOX_USAGE_EXIT)
