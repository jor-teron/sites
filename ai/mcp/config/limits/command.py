"""Domain-specific operational constants for the MCP server."""
from __future__ import annotations

from ..constants import *  # noqa: F401,F403

# Command timeouts and output caps
# =============================================================================

# Default run_command timeout, in seconds, when the caller omits timeout.
DEFAULT_TIMEOUT = 60

# Hard cap, in seconds, on a run_command timeout. Stops a caller asking for
# an hour-long sleep from holding a worker that long.
MAX_TIMEOUT = 600

# Combined stdout+stderr cap, in bytes, for one command (200 KiB). Extra
# output is discarded and truncated is set.
MAX_OUTPUT = 200 * 1024

# Marker appended to stdout when the combined output cap is hit.
TRUNC_MARK = "\n[truncated]\n"

# Bytes read per os.read / pipe.read in the output cap reader loops.
PIPE_READ_SIZE = 4096

# Shortest poll interval, in seconds, while waiting for a sandboxed child.
PIPE_POLL_MIN = 0.01

# Longest poll interval, in seconds, while waiting for a sandboxed child.
PIPE_POLL_MAX = 0.05

# Seconds to wait for a SIGKILL'd process group to be reaped, and for
# reader threads to finish after the child has exited.
REAP_GRACE_SEC = 5

# Decimal places used when reporting duration_sec in a command result.
DURATION_DECIMALS = 3


# =============================================================================
# Resource limits (applied inside the jail, per command)
# =============================================================================

# Default address-space rlimit for each command, in MiB (RLIMIT_AS).
DEFAULT_MEMORY_MB = 512

# Floor, in MiB, applied when setting RLIMIT_AS so a tiny MCP_MEMORY_MB
# cannot make the interpreter unable to start.
MIN_MEMORY_MB = 64

# Default process-count rlimit (RLIMIT_NPROC) for each command.
DEFAULT_MAX_PROCS = 64

# Floor on RLIMIT_NPROC so bash plus a short pipeline can still fork.
MIN_MAX_PROCS = 8

# Default file-size rlimit, in bytes (64 MiB). Stops a command filling the
# sandbox tmpfs or the host disk.
DEFAULT_FSIZE = 64 * 1024 * 1024

# Default open-file rlimit (RLIMIT_NOFILE) for each command.
DEFAULT_NOFILE = 256

# Seconds added to the command timeout when setting RLIMIT_CPU, so the
# wall-clock timeout (which sends SIGKILL) usually fires first.
CPU_TIMEOUT_PAD = 1

# Floor, in seconds, for RLIMIT_CPU.
MIN_CPU_SECONDS = 1

# Core dumps are disabled (RLIMIT_CORE = 0) so a crash cannot write a core
# file into the sandbox.
RLIMIT_CORE_VALUE = 0

# Bytes in one kibibyte, used when formatting sizes for client descriptions.
BYTES_PER_KIB = 1024

# Bytes in one mebibyte, used to convert MEMORY_MB into RLIMIT_AS.
BYTES_PER_MIB = 1024 * 1024

# Bytes in one gibibyte, used for the default 2 GiB workspace image.
BYTES_PER_GIB = 1024 * 1024 * 1024

# Bytes in one tebibyte, accepted by parse_size() for completeness.
BYTES_PER_TIB = 1024 * 1024 * 1024 * 1024


# =============================================================================
