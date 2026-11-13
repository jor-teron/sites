"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Logging and miscellaneous
# =============================================================================

# strftime format for audit-log timestamps (local time with numeric offset).
AUDIT_TIME_FORMAT = "%Y-%m-%dT%H:%M:%S%z"

# Values treated as true when parsing MCP_TRUST_PROXY / MCP_SANDBOX_NET and
# similar flags (compared case-insensitively after stripping).
TRUTHY_VALUES = ("1", "true", "yes", "on")

# Bind-mount mode names accepted in BIND / MCP_BIND entries.
BIND_MODE_RO = "ro"
BIND_MODE_RW = "rw"

# Sysctl-style files checked before the live user-namespace probe, as
# (path, expect_nonzero). A "0" on a path that should be non-zero is a
# hard failure; AppArmor's restrict knob is recorded only as a hint.
USERNS_SYSCTL_HINTS = (
    ("/proc/sys/kernel/unprivileged_userns_clone", True),
    ("/proc/sys/user/max_user_namespaces", True),
    ("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", False),
)

# Message appended when the unprivileged user-namespace probe fails. Tells
# the operator how to enable the feature or fall back to MCP_SANDBOX=none.
USERNS_HELP = (
    "Unprivileged user namespaces are disabled or blocked on this kernel, "
    "so the v2 jail cannot start without root.\n"
    "Check:\n"
    "  sysctl kernel.unprivileged_userns_clone    # should be 1 (Debian/Ubuntu)\n"
    "  sysctl kernel.apparmor_restrict_unprivileged_userns  # Ubuntu 24 may set this to 1\n"
    "  sysctl user.max_user_namespaces            # should be > 0\n"
    "On Debian you can enable them with:\n"
    "  sudo sysctl -w kernel.unprivileged_userns_clone=1\n"
    "Or start without a jail (weaker): MCP_SANDBOX=none\n"
)


# =============================================================================
# Path helpers (install layout)
# =============================================================================
