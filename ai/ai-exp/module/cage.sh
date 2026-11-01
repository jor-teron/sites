# The offline BusyBox cage: a folder that becomes the whole filesystem.

# The cage has no timezone files. Pass the host's offset in POSIX form,
# where the sign is reversed (for example +0530 becomes UTC-05:30).
init_cage_tz() {
  local off sign psign
  off="$(date +%z)"
  sign="${off:0:1}"
  if [ "$sign" = "+" ]; then
    psign="-"
  else
    psign="+"
  fi
  CAGE_TZ="UTC${psign}${off:1:2}:${off:3:2}"
}

build_cage() {
  local applet
  mkdir -p "$CAGE/bin" "$CAGE/home" "$CAGE/tmp" "$CAGE/proc"
  cp "$BUSYBOX" "$CAGE/bin/busybox" && chmod +x "$CAGE/bin/busybox" \
    || fail "Could not install busybox into $CAGE/bin"
  for applet in $("$CAGE/bin/busybox" --list); do
    [ -e "$CAGE/bin/$applet" ] || ln -s busybox "$CAGE/bin/$applet"
  done
  [ -x "$CAGE/bin/sh" ] || fail "busybox did not provide a shell. Install busybox-static."
}

# Run one command in fresh namespaces: own user, no network, own processes,
# own mounts, own hostname. The cage folder is the whole filesystem.
# /proc is mounted at the cage's proc directory. Output is capped at MAX_OUTPUT.
run_in_cage() {
  local cmd="$1" limit="$2" out code
  local -a pre=()
  if [ -n "$TIMEOUT" ]; then
    pre=("$TIMEOUT" -k "$CMD_KILL_GRACE" "$limit")
  fi
  out="$(env -i PATH=/bin HOME=/home TERM=dumb TZ="$CAGE_TZ" \
        "${pre[@]}" "$UNSHARE" --user --map-root-user --net --pid --fork --mount --uts \
        --mount-proc="$CAGE/proc" \
        "$CHROOT" "$CAGE" /bin/sh -c "cd /home; $cmd" 2>&1)"
  code=$?
  [ -z "$out" ] && out="(no output)"
  if [ "${#out}" -gt "$MAX_OUTPUT" ]; then
    out="${out:0:$MAX_OUTPUT}"$'\n...(output cut)'
  fi
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    [ "$out" = "(no output)" ] && out=""
    printf '%s(command killed after %ss)' "${out:+$out$'\n'}" "$limit"
  else
    printf '%s\n[exit code %s]' "$out" "$code"
  fi
}

verify_cage() {
  local test_out
  test_out="$(run_in_cage 'echo cage-ok' 5)"
  case "$test_out" in
    *cage-ok*) ;;
    *) fail "The sandbox couldn't start. Unprivileged user namespaces may be off. Try:
  sudo sysctl -w kernel.unprivileged_userns_clone=1
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
Details: $test_out" ;;
  esac
}
