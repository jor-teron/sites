"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/config/load.py
Purpose:      Config class and mcp.conf / MCP_* loading.
Version:      3.3
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
"""
from __future__ import annotations

import ipaddress
import os
from .constants import *
from .client_text import *

from .helpers import *
from .helpers import _truthy
from .client import *
def _strip_quotes(value):
    """Remove a matching pair of surrounding single or double quotes.

    Args:
        value (str): A raw config-file value.

    Returns:
        str: The unquoted value, or the original string if it is not quoted.
    """
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def parse_binds(values):
    """Parse BIND / MCP_BIND entries of the form src:dest[:ro|rw].

    Several entries may be passed, and a single entry may be a comma-
    separated list (as used by the MCP_BIND environment variable).

    Args:
        values: Iterable of raw strings, or None.

    Returns:
        list[tuple[str, str, bool]]: (realpath(src), dest, writable) triples.
        dest always starts with '/'. writable is True only for ':rw'.

    Raises:
        ConfigError: If an entry is malformed or the source is not a directory.
    """
    out = []
    items = []
    for value in values or []:
        if not value:
            continue
        # Comma-separated lists are allowed in a single env var.
        for part in value.split(","):
            part = part.strip()
            if part:
                items.append(part)
    for item in items:
        bits = item.split(":")
        # Paths may contain colons on unusual systems; require at least src:dest.
        if len(bits) < 2:
            raise ConfigError("BIND must be src:dest or src:dest:ro|rw (got %r)" % item)
        mode = BIND_MODE_RO
        if bits[-1].lower() in (BIND_MODE_RO, BIND_MODE_RW):
            mode = bits[-1].lower()
            dest = bits[-2]
            src = ":".join(bits[:-2])
        else:
            dest = bits[-1]
            src = ":".join(bits[:-1])
        if not src or not dest:
            raise ConfigError("BIND must be src:dest or src:dest:ro|rw (got %r)" % item)
        if not os.path.isdir(src):
            raise ConfigError("BIND source is not a directory: %s" % src)
        if not dest.startswith("/"):
            dest = "/" + dest
        out.append((os.path.realpath(src), dest, mode == BIND_MODE_RW))
    return out


def load_conf_file(path):
    """Read a KEY=value mcp.conf file.

    Blank lines and lines starting with # are ignored. BIND / MCP_BIND
    keys are collected separately so they can be repeated.

    Args:
        path (str | None): Path to the file. Missing or empty paths yield
            an empty result rather than an error.

    Returns:
        tuple[dict, list]: (data, binds) where data maps upper-case keys
        to unquoted string values, and binds is a list of raw BIND values.

    Raises:
        OSError: If the file exists but cannot be read.
    """
    data = {}
    binds = []
    if not path or not os.path.isfile(path):
        return data, binds
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip().upper()
            value = _strip_quotes(value.strip())
            if key in ("BIND", "MCP_BIND"):
                binds.append(value)
            else:
                data[key] = value
    return data, binds


def _conf_get(conf, *names, default=""):
    """Return the first non-empty value from the conf dict or the environment.

    Each name is tried first as a conf key, then as an environment variable.
    Environment values win only when the conf key is missing or empty; for
    the "environment always wins" rule used at startup, see _env_or_conf.

    Args:
        conf (dict): Parsed mcp.conf values (upper-case keys).
        *names: Candidate key names, tried in order.
        default: Returned when every name is missing or empty.

    Returns:
        The first matching string, or default.
    """
    for name in names:
        if name in conf and conf[name] != "":
            return conf[name]
        env = os.environ.get(name)
        if env is not None and env != "":
            return env
    return default


def _env_or_conf(conf, env_name, *conf_names, default=""):
    """Return an environment value if set, otherwise a conf value, else default.

    A variable that is present in the environment (even if empty) wins.
    This is the rule mcp.sh documents: a shell export overrides mcp.conf.

    Args:
        conf (dict): Parsed mcp.conf values (upper-case keys).
        env_name (str): Environment variable to look up first (for example
            MCP_PIN).
        *conf_names: mcp.conf keys to try, in order, if the env var is unset.
        default: Returned when neither the environment nor the file has a
            value.

    Returns:
        The resolved string (or default).
    """
    if env_name in os.environ:
        return os.environ.get(env_name, default)
    for name in conf_names:
        if name in conf and conf[name] != "":
            return conf[name]
    return default


def _load_pin(pin, pin_file):
    """Resolve the PIN from a file, an explicit value, or the default.

    Args:
        pin (str | None): PIN already taken from the environment or mcp.conf.
            None means "use DEFAULT_PIN" when no file is set.
        pin_file (str | None): If set, the PIN is read from this file
            (first line, stripped) and `pin` is ignored.

    Returns:
        str: The resolved, non-empty PIN (emptiness is checked by validate).

    Raises:
        ConfigError: If pin_file is set but missing or empty.
    """
    if pin_file:
        if not os.path.isfile(pin_file):
            raise ConfigError("MCP_PIN_FILE / MCP_PASSWORD_FILE missing: %s" % pin_file)
        with open(pin_file, "r", encoding="utf-8") as fh:
            pin = fh.read().strip()
        if not pin:
            raise ConfigError("MCP_PIN_FILE is empty: %s" % pin_file)
        return pin
    if pin is None:
        return DEFAULT_PIN
    return pin


class Config(object):
    """Runtime configuration assembled from defaults, mcp.conf, and the env.

    Construct with Config() (optionally passing conf_path), then call
    validate() before starting the HTTP server. Tests may build an
    instance with Config.__new__ and set attributes by hand before
    validate().

    Attributes after validate() include host, port, pin, password (v1
    alias of pin), log_file, root, sandbox, sandbox_net, binds, cors_origins,
    trust_proxy, trust_proxy_ips, public_url, memory_mb, max_procs, default_timeout,
    server_dir, default_cwd, workspace, workspace_size, workspace_reserve,
    workspace_limit_on, using_default_pin, bind_alternatives, audit_enabled,
    audit_files, audit_log, audit_max, audit_keep, and audit_command_len.
    """

    def __init__(self, conf_path=None):
        """Load defaults, then mcp.conf, then MCP_* environment overrides.

        Args:
            conf_path (str | None): Path to mcp.conf. If omitted, MCP_CONF
                is used when set, otherwise <install_dir>/mcp.conf. A
                missing file is not an error.

        Raises:
            ValueError: If a numeric field such as PORT is not an integer.
            ConfigError: If a BIND entry is malformed.
        """
        if conf_path is None:
            conf_path = os.environ.get("MCP_CONF", "").strip() or default_conf_path()
        conf, conf_binds = load_conf_file(conf_path if os.path.isfile(conf_path) else None)
        # Remember the path only when the file actually exists, so tests
        # and banners can tell a missing file from a loaded one.
        self.conf_path = conf_path if os.path.isfile(conf_path) else None

        self.host = _env_or_conf(conf, "MCP_HOST", "HOST", "MCP_HOST", default=DEFAULT_HOST)
        port_raw = _env_or_conf(conf, "MCP_PORT", "PORT", "MCP_PORT", default=str(DEFAULT_PORT))
        self.port = int(port_raw)
        self.pin = _env_or_conf(
            conf, "MCP_PIN", "PIN", "MCP_PIN", "PASSWORD", default=""
        )
        if not self.pin:
            # MCP_PASSWORD is the v1 alias; checked after MCP_PIN so PIN wins.
            self.pin = _env_or_conf(
                conf, "MCP_PASSWORD", "PASSWORD", "MCP_PASSWORD", default=DEFAULT_PIN
            )
        self.pin_file = (
            _env_or_conf(conf, "MCP_PIN_FILE", "PIN_FILE", "MCP_PIN_FILE", default="").strip()
            or _env_or_conf(
                conf, "MCP_PASSWORD_FILE", "PASSWORD_FILE", "MCP_PASSWORD_FILE", default=""
            ).strip()
            or None
        )
        # Keep the v1 attribute name so reused tests and call sites still work.
        self.password = self.pin
        self.password_file = self.pin_file
        self.log_file = _env_or_conf(conf, "MCP_LOG", "LOG", "MCP_LOG", default=DEFAULT_LOG)
        self.users_csv = _env_or_conf(
            conf, "MCP_USERS", "USERS", "MCP_USERS", default=DEFAULT_USERS_CSV
        ).strip() or DEFAULT_USERS_CSV
        self.using_default_password = False
        self.using_default_pin = False
        cors_raw = _env_or_conf(
            conf, "MCP_CORS_ORIGINS", "CORS_ORIGINS", "MCP_CORS_ORIGINS",
            default=DEFAULT_CORS_ORIGINS,
        )
        self.cors_origins = tuple(x.strip() for x in cors_raw.split(",") if x.strip())
        root = _env_or_conf(
            conf, "MCP_ROOT", "ROOT", "WORKSPACE", "MCP_ROOT", default=default_sandbox()
        ).strip()
        self.root = root or None
        self.trust_proxy = _truthy(
            _env_or_conf(
                conf, "MCP_TRUST_PROXY", "TRUST_PROXY", "MCP_TRUST_PROXY",
                default=DEFAULT_TRUST_PROXY,
            )
        )
        proxy_ips_raw = _env_or_conf(
            conf, "MCP_TRUST_PROXY_IPS", "TRUST_PROXY_IPS", "MCP_TRUST_PROXY_IPS",
            default=DEFAULT_TRUST_PROXY_IPS,
        )
        try:
            self.trust_proxy_ips = tuple(
                ipaddress.ip_network(item.strip(), strict=False)
                for item in proxy_ips_raw.split(",") if item.strip()
            )
        except ValueError as exc:
            raise ConfigError("invalid MCP_TRUST_PROXY_IPS entry: %s" % exc) from exc
        sandbox = _env_or_conf(
            conf, "MCP_SANDBOX", "SANDBOX", "MCP_SANDBOX", default=DEFAULT_SANDBOX_MODE
        ).strip().lower() or DEFAULT_SANDBOX_MODE
        self.sandbox = sandbox
        self.sandbox_net = _truthy(
            _env_or_conf(
                conf, "MCP_SANDBOX_NET", "SANDBOX_NET", "MCP_SANDBOX_NET",
                default=DEFAULT_SANDBOX_NET,
            )
        )
        self.auth_enabled = _truthy(
            _env_or_conf(
                conf, "MCP_AUTH", "AUTH", "MCP_AUTH",
                default=DEFAULT_AUTH,
            )
        )
        self.server_dir = os.path.realpath(os.path.dirname(os.path.abspath(__file__)))
        # default_cwd is the working directory for relative file-tool paths
        # and run_command; validate() points it at <root>/workspace when a
        # sandbox root is set.
        self.workspace = workspace_path(self.root) if self.root else None
        self.default_cwd = self.workspace or (os.path.expanduser("~") or os.getcwd())
        self.public_url = _env_or_conf(
            conf, "MCP_PUBLIC_URL", "PUBLIC_URL", "MCP_PUBLIC_URL", default=DEFAULT_PUBLIC_URL
        ).strip().rstrip("/")
        self.memory_mb = int(
            _env_or_conf(
                conf, "MCP_MEMORY_MB", "MEMORY_MB", "MCP_MEMORY_MB",
                default=str(DEFAULT_MEMORY_MB),
            )
        )
        self.max_procs = int(
            _env_or_conf(
                conf, "MCP_MAX_PROCS", "MAX_PROCS", "MCP_MAX_PROCS",
                default=str(DEFAULT_MAX_PROCS),
            )
        )
        self.default_timeout = int(
            _env_or_conf(
                conf, "MCP_TIMEOUT", "TIMEOUT", "MCP_TIMEOUT",
                default=str(DEFAULT_TIMEOUT),
            )
        )
        env_bind = os.environ.get("MCP_BIND", "").strip()
        bind_values = list(conf_binds)
        if env_bind:
            bind_values.append(env_bind)
        self.binds = parse_binds(bind_values)
        # Workspace image size and write reserve. Parsed to bytes here;
        # validate() then checks whether the mount is actually active.
        size_raw = _env_or_conf(
            conf, "MCP_WORKSPACE_SIZE", "WORKSPACE_SIZE", "MCP_WORKSPACE_SIZE",
            default=DEFAULT_WORKSPACE_SIZE,
        )
        reserve_raw = _env_or_conf(
            conf, "MCP_WORKSPACE_RESERVE", "WORKSPACE_RESERVE",
            "MCP_WORKSPACE_RESERVE", default=str(DEFAULT_WORKSPACE_RESERVE),
        )
        self.workspace_size = parse_size(size_raw)
        self.workspace_reserve = parse_size(reserve_raw)
        # Filled by validate() once the workspace path is known.
        self.workspace_limit_on = False
        # /etc/alternatives bind (v2.5). Default on; validate() keeps this
        # if the attribute was already set (Config.__new__ in tests).
        self.bind_alternatives = _truthy(
            _env_or_conf(
                conf, "MCP_ALTERNATIVES", "ALTERNATIVES", "MCP_ALTERNATIVES",
                "BIND_ALTERNATIVES", "MCP_BIND_ALTERNATIVES",
                default=DEFAULT_BIND_ALTERNATIVES,
            )
        )
        # Human-readable command audit log (v2.5).
        self.audit_enabled = _truthy(
            _env_or_conf(
                conf, "MCP_AUDIT", "AUDIT", "MCP_AUDIT",
                default=DEFAULT_AUDIT_ENABLED,
            )
        )
        self.audit_files = _truthy(
            _env_or_conf(
                conf, "MCP_AUDIT_FILES", "AUDIT_FILES", "MCP_AUDIT_FILES",
                default=DEFAULT_AUDIT_FILES,
            )
        )
        audit_log_raw = _env_or_conf(
            conf, "MCP_AUDIT_LOG", "AUDIT_LOG", "MCP_AUDIT_LOG", default=""
        ).strip()
        self.audit_log = audit_log_raw or default_audit_log(self.log_file)
        audit_max_raw = _env_or_conf(
            conf, "MCP_AUDIT_MAX", "AUDIT_MAX", "MCP_AUDIT_MAX",
            default=str(DEFAULT_AUDIT_MAX),
        )
        self.audit_max = parse_size(audit_max_raw)
        audit_keep_raw = _env_or_conf(
            conf, "MCP_AUDIT_KEEP", "AUDIT_KEEP", "MCP_AUDIT_KEEP",
            default=str(DEFAULT_AUDIT_KEEP),
        )
        self.audit_keep = int(audit_keep_raw)
        audit_cmd_raw = _env_or_conf(
            conf, "MCP_AUDIT_COMMAND_LEN", "AUDIT_COMMAND_LEN",
            "MCP_AUDIT_COMMAND_LEN", default=str(DEFAULT_AUDIT_COMMAND_LEN),
        )
        self.audit_command_len = int(audit_cmd_raw)

    def validate(self):
        """Check and normalise a loaded Config in place.

        Resolves the PIN (including PIN files), rejects an empty PIN or an
        unknown sandbox mode, requires MCP_ROOT and working user namespaces
        when sandbox=ns, and refuses to start if the audit log or PIN file
        would be visible inside the sandbox folder.

        Returns:
            Config: self, for call chaining (Config().validate()).

        Raises:
            ConfigError: On any of the conditions above.
        """
        if self.sandbox not in SANDBOX_MODES:
            raise ConfigError("MCP_SANDBOX must be 'ns' or 'none' (got %r)" % (self.sandbox,))
        self.server_dir = os.path.realpath(
            self.server_dir or os.path.dirname(os.path.abspath(__file__))
        )
        self.pin = _load_pin(self.pin, self.pin_file)
        self.password = self.pin
        if not self.pin:
            raise ConfigError("PIN is empty")
        self.using_default_pin = self.pin == DEFAULT_PIN
        self.using_default_password = self.using_default_pin
        if self.root:
            if not os.path.isdir(self.root):
                raise ConfigError("MCP_ROOT is not a directory: %s" % self.root)
            self.root = os.path.realpath(self.root)
            # Refuse a root that would expose the install directory or is
            # set too high (/, /home, /home/www, etc.).
            unsafe = root_is_unsafe(self.root)
            if unsafe:
                raise ConfigError(unsafe)
            # Create <root>/workspace and reserved mount-point dirs, and
            # git init the workspace if needed. Imported lazily to keep
            # config.py importable without pulling in subprocess helpers.
            from ..workspace import ensure_layout

            self.workspace = ensure_layout(self.root)
            self.default_cwd = self.workspace
        else:
            self.workspace = None
            self.default_cwd = os.path.expanduser("~") or os.getcwd()
        # Normalise size/reserve for Config objects built with __new__
        # (tests) that never ran __init__.
        if getattr(self, "workspace_size", None) is None:
            self.workspace_size = parse_size(DEFAULT_WORKSPACE_SIZE)
        else:
            self.workspace_size = parse_size(self.workspace_size)
        if getattr(self, "workspace_reserve", None) is None:
            self.workspace_reserve = DEFAULT_WORKSPACE_RESERVE
        else:
            self.workspace_reserve = parse_size(self.workspace_reserve)
        if self.workspace_reserve < 0:
            raise ConfigError("MCP_WORKSPACE_RESERVE must not be negative")
        if self.workspace_size < 0:
            raise ConfigError("MCP_WORKSPACE_SIZE must not be negative")
        # Detect the loop mount without creating it. A missing mount is
        # a warning, not a startup failure: the server still runs.
        if self.workspace and os.path.isdir(self.workspace):
            from ..workspace import is_workspace_mount

            self.workspace_limit_on = is_workspace_mount(self.workspace)
        else:
            self.workspace_limit_on = False
        # Fill v2.5 attributes for Config objects built with __new__
        # (tests) that never ran __init__.
        if getattr(self, "bind_alternatives", None) is None:
            self.bind_alternatives = True
        else:
            self.bind_alternatives = bool(self.bind_alternatives)
        if getattr(self, "audit_enabled", None) is None:
            self.audit_enabled = True
        else:
            self.audit_enabled = bool(self.audit_enabled)
        if getattr(self, "audit_files", None) is None:
            self.audit_files = True
        else:
            self.audit_files = bool(self.audit_files)
        if not getattr(self, "audit_log", None):
            self.audit_log = default_audit_log(getattr(self, "log_file", None))
        if getattr(self, "audit_max", None) is None:
            self.audit_max = DEFAULT_AUDIT_MAX
        else:
            self.audit_max = parse_size(self.audit_max)
        if getattr(self, "audit_keep", None) is None:
            self.audit_keep = DEFAULT_AUDIT_KEEP
        else:
            self.audit_keep = int(self.audit_keep)
        if self.audit_keep < 0:
            raise ConfigError("MCP_AUDIT_KEEP must not be negative")
        if getattr(self, "audit_command_len", None) is None:
            self.audit_command_len = DEFAULT_AUDIT_COMMAND_LEN
        else:
            self.audit_command_len = int(self.audit_command_len)
        if self.audit_command_len < 1:
            raise ConfigError("MCP_AUDIT_COMMAND_LEN must be at least 1")
        if self.audit_max < 0:
            raise ConfigError("MCP_AUDIT_MAX must not be negative")
        # v4.1: load the user catalog. Missing file is an empty catalog.
        # v4.4: ensure the shared directory exists.
        from ..users import load_users, UserError, ensure_share

        try:
            self.users = load_users(getattr(self, "users_csv", None) or DEFAULT_USERS_CSV)
        except UserError as exc:
            raise ConfigError(str(exc)) from exc
        if self.root:
            try:
                ensure_share(self.root)
            except OSError as exc:
                raise ConfigError("cannot create home/share: %s" % exc) from exc
        if self.sandbox == "ns":
            if not self.root:
                raise ConfigError(
                    "MCP_SANDBOX=ns requires MCP_ROOT (default %s)" % default_sandbox()
                )
            # Imported lazily so config.py can be imported by nscompat
            # (which defines USERNS helpers that we call here).
            from ..nscompat import userns_available

            ok, detail = userns_available()
            if not ok:
                raise ConfigError(detail)
        from ..tools import is_within

        secret_paths = [("log file", self.log_file)]
        if getattr(self, "audit_log", None):
            secret_paths.append(("audit log", self.audit_log))
        if self.pin_file:
            secret_paths.append(("PIN file", self.pin_file))
        for label, path in secret_paths:
            if self.root and is_within(path, self.root) and not is_within(path, self.server_dir):
                raise ConfigError(
                    "%s (%s) is inside MCP_ROOT (%s) and would be visible to the AI. "
                    "Keep it outside the sandbox or inside the hidden server directory (%s)"
                    % (label, path, self.root, self.server_dir)
                )
        return self
