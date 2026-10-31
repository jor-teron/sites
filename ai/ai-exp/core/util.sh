# Small helpers shared by the other modules.

clock() { date +%H:%M:%S; }

fail() { echo "Error: $*" >&2; exit 1; }

# Find a program even if it lives in /usr/sbin or /sbin.
# chroot often does, and a login PATH is not always in effect.
find_tool() {
  local name="$1" dir
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  for dir in /usr/sbin /sbin /usr/bin /bin /usr/local/bin /usr/local/sbin; do
    if [ -x "$dir/$name" ]; then
      printf '%s\n' "$dir/$name"
      return 0
    fi
  done
  return 1
}

require_host_tools() {
  CURL="$(find_tool curl)" || fail "curl not found. Install it: sudo apt install curl"
  JQ="$(find_tool jq)" || fail "jq not found. Install it: sudo apt install jq"
  UNSHARE="$(find_tool unshare)" || fail "unshare not found. Install it: sudo apt install util-linux"
  CHROOT="$(find_tool chroot)" || fail "chroot not found. Install it: sudo apt install coreutils"
  if [ -n "${BUSYBOX:-}" ]; then
    [ -x "$BUSYBOX" ] || fail "BUSYBOX=$BUSYBOX is not an executable file"
  else
    BUSYBOX="$(find_tool busybox)" || fail "busybox not found. Install it: sudo apt install busybox-static"
  fi
  TIMEOUT="$(find_tool timeout)" || TIMEOUT=""
}

# One physical line, trimmed, and capped. Used for log summaries.
one_line() {
  local s="$1" max="${2:-300}"
  if [ "${#s}" -gt 4000 ]; then
    s="${s:0:4000}"
  fi
  s="${s//$'\r'/ }"
  s="${s//$'\n'/ }"
  s="${s//$'\t'/ }"
  while [ "${s#*  }" != "$s" ]; do
    s="${s//  / }"
  done
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  if [ "${#s}" -gt "$max" ]; then
    s="${s:0:$max}..."
  fi
  printf '%s' "$s"
}
