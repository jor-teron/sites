# shellcheck shell=bash
# Separate cages for v4: each companion gets its OWN BusyBox machine (own
# rootfs, mount, PID and UTS namespaces, hostname = its name), joined by two
# quiet links that are never mentioned to them:
#   1. a shared folder: <experiment>/shared is bind-mounted read-write at /srv
#      in every cage;
#   2. a shared localhost: all cages join ONE network namespace (lo only, no
#      outside network), so `nc -l -p PORT` in one cage is reachable from the
#      other at 127.0.0.1:PORT.
#
# Same INTERFACE as shared-cage.sh (see its header) so v4 just sources this
# file instead: MAX_PROCS, setup_users, start_shared_cage, run_as_in_cage,
# enforce_proc_limit, stop_shared_cage, CAGE_OF, build_cages, repair_cages,
# CAGE_ROOT_NAME. Thin aliases start_cages / stop_cages have clearer names.
# Extra for v4 discovery: SHARED_DIR (host folder behind /srv).
#
# How it works (all unprivileged): a holder process owns a user namespace +
# network namespace and brings `lo` up. Each cage is started by entering the
# holder's user+net namespaces with nsenter and unshare'ing new mount/pid/uts
# namespaces there; it bind-mounts SHARED_DIR on <cage>/srv, mounts /proc and
# chroots into its rootfs to run /sbin/init. Commands enter that cage's init
# with nsenter exactly as in v3. Killing a cage's init kills that cage.

# shellcheck source=shared-cage.sh
source "$(dirname "${BASH_SOURCE[0]}")/shared-cage.sh"   # reused: setup_users, run_as_in_cage, cage_pids

# shellcheck disable=SC2034  # read by companion.sh
CAGE_ROOT_NAME="cages"          # <experiment>/cages/<name>/ is each rootfs
declare -A INIT_OF=() NS_OF=() STARTER_OF=()
NET_HOLDER_PID=""

CAGE_OF() { printf '%s/%s\n' "$CAGE" "$1"; }
shared_dir() { printf '%s/shared\n' "$EXP_DIR"; }

# Keep the v3 bodies under new names, then wrap them per cage.
eval "$(declare -f setup_users | sed '1s/^setup_users/setup_users_one/')"
eval "$(declare -f enforce_proc_limit | sed '1s/^enforce_proc_limit/enforce_proc_limit_one/')"
eval "$(declare -f run_as_in_cage | sed '1s/^run_as_in_cage/run_as_in_one_cage/')"

build_cages() {
  local who CAGE_ROOT="$CAGE"
  for who in "${USERS[@]}"; do CAGE="$CAGE_ROOT/$who" build_cage; done
  CAGE="$CAGE_ROOT"; mkdir -p "$(shared_dir)"
}
repair_cages() {
  local who
  for who in "${USERS[@]}"; do mkdir -p "$CAGE/$who/proc" "$CAGE/$who/home" "$CAGE/$who/tmp"; done
  mkdir -p "$(shared_dir)"
}

setup_users_for() {
  local CAGE="$CAGE/$1"; local -a USERS=("$1")
  setup_users_one
}

# Each cage only knows its own user; hostname is the companion's name.
setup_users() {
  local who
  for who in "${USERS[@]}"; do
    mkdir -p "$CAGE/$who/etc" "$CAGE/$who/srv"
    [ -f "$CAGE/$who/etc/hostname" ] || echo "$who" > "$CAGE/$who/etc/hostname"
    setup_users_for "$who"
  done
  SHARED_DIR="$(shared_dir)"; mkdir -p "$SHARED_DIR"; chmod 777 "$SHARED_DIR" 2>/dev/null
}

start_shared_cage() {
  local who p hostns
  hostns="$(readlink /proc/self/ns/pid)"
  trap stop_shared_cage EXIT
  # 1. user+net namespace holder with loopback up.
  setsid "$UNSHARE" --user --map-root-user --net "$CAGE/${USERS[0]}/bin/busybox" sh -c \
    'ip link set lo up 2>/dev/null || ifconfig lo 127.0.0.1 up; exec sleep 2147483647' \
    </dev/null >/dev/null 2>&1 &
  NET_HOLDER_PID=$!
  for _ in $(seq 1 50); do
    [ "$(readlink "/proc/$NET_HOLDER_PID/ns/net" 2>/dev/null)" != "$(readlink /proc/self/ns/net)" ] \
      && grep -q sleep "/proc/$NET_HOLDER_PID/cmdline" 2>/dev/null && break
    sleep 0.1
  done
  grep -q sleep "/proc/$NET_HOLDER_PID/cmdline" 2>/dev/null \
    || fail "The shared network namespace didn't start (unshare --user --net?)."
  # 2. one cage per companion inside that user+net namespace.
  for who in "${USERS[@]}"; do
    local root="$CAGE/$who"
    setsid "$NSENTER" -t "$NET_HOLDER_PID" -U -n --preserve-credentials \
      "$UNSHARE" --mount --pid --uts --fork "$root/bin/busybox" sh -c \
      'mount -o bind "$1" "$2/srv" && mount -t proc proc "$2/proc" && exec "$3" "$2" /bin/sh /sbin/init' \
      sh "$SHARED_DIR" "$root" "$CHROOT" </dev/null >/dev/null 2>&1 &
    STARTER_OF[$who]=$!
    p=""
    for _ in $(seq 1 50); do
      p="$(pgrep -P "${STARTER_OF[$who]}" | head -n1)"
      [ -n "$p" ] && [ "$(readlink "/proc/$p/ns/pid")" != "$hostns" ] \
        && grep -q /sbin/init "/proc/$p/cmdline" 2>/dev/null && break
      p=""; sleep 0.1
    done
    [ -n "$p" ] || fail "The cage for $who didn't start (mount/pid namespaces?)."
    INIT_OF[$who]="$p"; NS_OF[$who]="$(readlink "/proc/$p/ns/pid")"
    echo "$p" > "$RUN_DIR/init-$who.pid"
  done
  echo "$NET_HOLDER_PID" > "$RUN_DIR/net.pid"
}

stop_shared_cage() {
  local who
  for who in "${!INIT_OF[@]}"; do kill -KILL "${INIT_OF[$who]}" 2>/dev/null; done
  for who in "${!STARTER_OF[@]}"; do kill "${STARTER_OF[$who]}" 2>/dev/null; wait "${STARTER_OF[$who]}" 2>/dev/null; done
  [ -n "$NET_HOLDER_PID" ] && { kill -KILL "$NET_HOLDER_PID" 2>/dev/null; wait "$NET_HOLDER_PID" 2>/dev/null; }
  INIT_OF=(); NS_OF=(); STARTER_OF=(); NET_HOLDER_PID=""
  rm -f "$RUN_DIR"/init-*.pid "$RUN_DIR/net.pid" 2>/dev/null
  return 0
}

# MAX_PROCS applies to each cage separately.
enforce_proc_limit() {
  local who INIT_PID CAGE_NS
  for who in "${!INIT_OF[@]}"; do
    # shellcheck disable=SC2034  # read by enforce_proc_limit_one/cage_pids
    INIT_PID="${INIT_OF[$who]}" CAGE_NS="${NS_OF[$who]}"
    enforce_proc_limit_one
  done
}

run_as_in_cage() {
  local INIT_PID="${INIT_OF[$1]:-}"
  [ -n "$INIT_PID" ] || { echo "(could not run the command)"; return; }
  run_as_in_one_cage "$@"
}

start_cages() { start_shared_cage "$@"; }
stop_cages() { stop_shared_cage "$@"; }
