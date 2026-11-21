# shellcheck shell=bash
# Shared cage for v3: ONE persistent BusyBox machine that every companion uses.
#
# INTERFACE (v4 swaps this file for separate-cages.sh, which keeps these names):
#   MAX_PROCS                     process limit per cage (env, default 40)
#   setup_users                   make /etc/passwd, /etc/group, /home/<name>, /dev/null,
#                                 /etc/hostname and /sbin/init for every name in USERS[@]
#   start_shared_cage             start the long-lived namespaces; sets INIT_PID, CAGE_NS;
#                                 installs an EXIT trap that calls stop_shared_cage
#   run_as_in_cage WHO CMD SECS   run CMD as WHO (HOME/USER/cwd) and print its output
#                                 plus "[exit code N]" or "(command stopped after Ns)"
#   enforce_proc_limit            kill the newest processes over MAX_PROCS; print a note if any
#   stop_shared_cage              kill everything in the cage (safe to call twice)
#   CAGE_OF WHO                   print the host folder holding WHO's filesystem
#                                 (used by discovery to find files they made)
#   build_cages / repair_cages    new run: build the rootfs(es); --continue: recreate mount points
#   CAGE_ROOT_NAME                folder under the experiment holding the cage(s) (default "cage")
# Uses from other modules: CAGE, RUN_DIR, USERS, UNSHARE, CHROOT, NSENTER,
# TIMEOUT, CAGE_TZ, CMD_KILL_GRACE, MAX_OUTPUT (module/config.sh, cage.sh, companion.sh).
#
# How it works: one unshare'd namespace set (user/net/pid/mount/uts) holds a tiny
# init; each command enters it with nsenter, so files, /tmp, the process list and
# background processes are shared and persist between turns.

MAX_PROCS="${MAX_PROCS:-40}"  # processes allowed in the cage (init excluded)

# All companions share one machine.
CAGE_OF() { printf '%s\n' "$CAGE"; }
# New run: build the rootfs. Continue: make sure the mount points exist.
build_cages() { build_cage; }
repair_cages() { mkdir -p "$CAGE/proc" "$CAGE/home" "$CAGE/tmp"; }

# /etc/passwd, /etc/group, homes, /dev/null for the shared cage.
setup_users() {
  local n uid=1001
  mkdir -p "$CAGE/etc" "$CAGE/dev" "$CAGE/root"
  [ -e "$CAGE/dev/null" ] || : > "$CAGE/dev/null"
  chmod 666 "$CAGE/dev/null" 2>/dev/null
  if [ ! -f "$CAGE/etc/passwd" ]; then
    echo 'root:x:0:0:root:/root:/bin/sh' > "$CAGE/etc/passwd"
    echo 'root:x:0:' > "$CAGE/etc/group"
  fi
  for n in "${USERS[@]}"; do
    mkdir -p "$CAGE/home/$n"
    if ! grep -q "^$n:" "$CAGE/etc/passwd"; then
      while grep -q ":x:$uid:" "$CAGE/etc/passwd"; do uid=$(( uid + 1 )); done
      echo "$n:x:$uid:$uid:$n:/home/$n:/bin/sh" >> "$CAGE/etc/passwd"
      echo "$n:x:$uid:" >> "$CAGE/etc/group"
    fi
  done
  [ -f "$CAGE/etc/hostname" ] || echo "pc" > "$CAGE/etc/hostname"
  # Tiny pid 1: sets the hostname and reaps orphans. Shows as "/bin/sh /sbin/init".
  mkdir -p "$CAGE/sbin"
  printf '%s\n' 'hostname "$(cat /etc/hostname)" 2>/dev/null' 'trap "exit 0" TERM' 'while :; do sleep 1 & wait; done' > "$CAGE/sbin/init"
}


start_shared_cage() {
  local i
  setsid "$UNSHARE" --user --map-root-user --net --pid --fork --mount --uts \
    --mount-proc="$CAGE/proc" "$CHROOT" "$CAGE" \
    /bin/sh /sbin/init \
    </dev/null >/dev/null 2>&1 &
  UNSHARE_PID=$!
  trap stop_shared_cage EXIT
  INIT_PID=""
  for i in $(seq 1 50); do
    INIT_PID="$(pgrep -P "$UNSHARE_PID" | head -n1)"
    [ -n "$INIT_PID" ] && [ "$(readlink "/proc/$INIT_PID/ns/pid")" != "$(readlink /proc/self/ns/pid)" ] && break
    INIT_PID=""; sleep 0.1
  done
  [ -n "$INIT_PID" ] || fail "The shared cage didn't start (unshare/user namespaces?)."
  CAGE_NS="$(readlink "/proc/$INIT_PID/ns/pid")"
  echo "$INIT_PID" > "$RUN_DIR/init.pid"
}

stop_shared_cage() {
  [ -n "${INIT_PID:-}" ] && kill -KILL "$INIT_PID" 2>/dev/null   # pid 1 dies -> kernel kills the whole namespace
  [ -n "${UNSHARE_PID:-}" ] && { kill "$UNSHARE_PID" 2>/dev/null; wait "$UNSHARE_PID" 2>/dev/null; }
  INIT_PID=""; UNSHARE_PID=""
  rm -f "$RUN_DIR/init.pid" 2>/dev/null
  return 0
}

# Host pids of processes in the cage (init excluded), oldest first.
cage_pids() {
  local d p
  for d in /proc/[0-9]*; do
    p="${d#/proc/}"
    [ "$p" = "$INIT_PID" ] && continue
    [ "$(readlink "$d/ns/pid" 2>/dev/null)" = "$CAGE_NS" ] && echo "$p"
  done | sort -n
}

# Keep at most MAX_PROCS processes; newest extras are killed. Prints a note if any were.
enforce_proc_limit() {
  local -a pids; local extra
  mapfile -t pids < <(cage_pids)
  extra=$(( ${#pids[@]} - MAX_PROCS ))
  [ "$extra" -gt 0 ] || return 0
  kill -KILL "${pids[@]: -$extra}" 2>/dev/null
  echo "(process limit $MAX_PROCS reached: $extra newest processes were stopped)"
}

# $1 user, $2 command, $3 seconds. Runs as that user (HOME/USER/cwd) inside the shared cage.
run_as_in_cage() {
  local who="$1" cmd="$2" limit="$3" out code
  local -a pre=()
  [ -n "$TIMEOUT" ] && pre=("$TIMEOUT" -k "$CMD_KILL_GRACE" "$(( limit + 2 ))")
  local tmp="$RUN_DIR/out.tmp" reader i
  # Output goes through a pipe that is closed right after the command returns,
  # so a background process holding stdout can't hang the turn (it gets
  # SIGPIPE if it keeps writing, like a closed terminal; redirected ones live on).
  local fifo="$RUN_DIR/out.fifo"
  : > "$tmp"; rm -f "$fifo"; mkfifo "$fifo" || { echo "(could not run the command)"; return; }
  head -c "$(( MAX_OUTPUT + 1 ))" < "$fifo" > "$tmp" &
  reader=$!
  env -i "${pre[@]}" "$NSENTER" -t "$INIT_PID" -U -n -p -m -u --preserve-credentials -r -w \
        /bin/env -i PATH=/bin HOME="/home/$who" USER="$who" LOGNAME="$who" TERM=dumb TZ="$CAGE_TZ" \
        /bin/timeout -s KILL "$limit" /bin/sh -c "cd /home/$who 2>/dev/null; $cmd" \
        </dev/null > "$fifo" 2>&1
  code=$?
  for i in 1 2 3 4 5; do kill -0 "$reader" 2>/dev/null || break; sleep 0.1; done
  kill "$reader" 2>/dev/null; wait "$reader" 2>/dev/null
  rm -f "$fifo"
  out="$(cat "$tmp")"
  [ -z "$out" ] && out="(no output)"
  [ "${#out}" -gt "$MAX_OUTPUT" ] && out="${out:0:$MAX_OUTPUT}"$'\n...(output cut)'
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    [ "$out" = "(no output)" ] && out=""
    printf '%s(command stopped after %ss)' "${out:+$out$'\n'}" "$limit"
  else
    printf '%s\n[exit code %s]' "$out" "$code"
  fi
}

# Files changed in the cage since marker $1 -> created-<user>.tsv (epoch, path).
