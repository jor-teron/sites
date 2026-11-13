"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Self-test (mcp.sh --selftest)
# =============================================================================

# Status labels printed at the start of each self-test result line.
SELFTEST_PASS = "PASS"
SELFTEST_FAIL = "FAIL"
SELFTEST_SKIP = "SKIP"

# Minimum Python version the server and the self-test require.
PYTHON_MIN_MAJOR = 3
PYTHON_MIN_MINOR = 8

# HTTP timeout, in seconds, for the local initialize and tools/call probes.
SELFTEST_HTTP_TIMEOUT = 8

# Timeout, in seconds, for self-test run_command probes inside the jail.
SELFTEST_COMMAND_TIMEOUT = 20

# Timeout, in seconds, of the network-connectivity probe (a TCP connect).
SELFTEST_NET_TIMEOUT = 2

# Address used to test whether the jail has network access. A raw IP is
# used so a blocked network is not confused with a DNS failure.
SELFTEST_NET_HOST = "1.1.1.1"
SELFTEST_NET_PORT = 443

# clientInfo.name sent by the self-test initialize request.
SELFTEST_CLIENT_NAME = "mcp-selftest"

# Marker printed by the jail probe when the working directory is /workspace.
SELFTEST_MARK_CWD = "CWD_OK"

# Marker printed by the jail probe when the process uid is not 0.
SELFTEST_MARK_UID = "UID_OK"

# Marker printed by the jail probe when /workspace/selftest.marker is readable
# (proves '/' is the sandbox, because that file was written on the host
# under sandbox/workspace).
SELFTEST_MARK_ROOT = "ROOT_OK"

# Marker printed by the jail probe when a host-only path is not reachable.
SELFTEST_MARK_ISOLATED = "ISOLATED_OK"

# Basename of the temporary marker file written into /workspace for the
# jail probe (created and removed by the self-test, not left behind).
SELFTEST_MARKER_NAME = "selftest.marker"

# Basename of a temporary file written *outside* the sandbox to confirm
# host paths are unreachable; never created inside MCP_ROOT.
SELFTEST_OUTSIDE_NAME = "selftest-outside.marker"


# =============================================================================
