"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Jail process environment
# =============================================================================

# PATH seen by sandboxed commands. Only the read-only /usr and usrmerge links.
JAIL_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"

# Fallback locale when the server process has no LANG set.
DEFAULT_LANG = "C.UTF-8"

# TERM set inside the jail so tools that inspect it do not complain.
JAIL_TERM = "xterm"


# =============================================================================
# Sandbox mode
# =============================================================================

# Default isolation mode: "ns" (namespaces + pivot_root) or "none".
DEFAULT_SANDBOX_MODE = "ns"

# Default for MCP_SANDBOX_NET. "0" means the command gets a fresh, empty
# network namespace (no connectivity).
DEFAULT_SANDBOX_NET = "0"

# Accepted values of MCP_SANDBOX after lowercasing and stripping.
SANDBOX_MODES = ("ns", "none")

# Values of cfg.sandbox that disable the namespace jail (file tools still
# stay inside MCP_ROOT). "off" and "0" are informal aliases of "none".
SANDBOX_DISABLED_VALUES = ("none", "off", "0")


# =============================================================================
