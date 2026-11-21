# shellcheck shell=bash
# Discovery for v4 (on top of discovery.sh): also tracks the two hidden links.
#   - files written in the shared folder are recorded as /srv/... for the
#     person whose turn it was (so the v3 "uses a file the other made" check
#     covers /srv too);
#   - first time each person touches /srv;
#   - first time one reads a /srv file the other wrote;
#   - first network use: nc/telnet/wget/curl to 127.0.0.1 or localhost, or a
#     listener (nc -l, httpd, telnetd ...).
# Needs SHARED_DIR from separate-cages.sh.

eval "$(declare -f track_created | sed '1s/^track_created/track_created_cage/')"
eval "$(declare -f discovery_scan | sed '1s/^discovery_scan/discovery_scan_v3/')"

track_created() {
  local who="$1" marker="$2" t
  track_created_cage "$who" "$marker"
  [ -n "${SHARED_DIR:-}" ] && [ -d "$SHARED_DIR" ] || return 0
  t="$(date +%s)"
  find "$SHARED_DIR" -newer "$marker" ! -type d -print 2>/dev/null \
    | while IFS= read -r f; do printf '%s\t/srv%s\n' "$t" "${f#"$SHARED_DIR"}"; done >> "$RUN_DIR/created-$who.tsv"
}

# Patterns (extended regex) for network use and listeners.
NET_CLIENT_RE='(^|[^a-z])(nc|netcat|telnet|wget|curl)([^a-z]|$).*(127\.[0-9]+\.[0-9]+\.[0-9]+|localhost)|(127\.[0-9.]+|localhost).*\|.*(nc|telnet)|/dev/tcp/'
NET_LISTEN_RE='(^|[^a-z])(nc|netcat)( [^;|&]*)? -[a-zA-Z]*l|(^|[^a-z])(httpd|telnetd|tcpsvd|udpsvd|inetd|ftpd)([^a-z]|$)'

discovery_scan() {
  local me other ts who kind b64 text fts fpath fbase hit
  discovery_scan_v3
  [ -z "$DISCOVERY" ] || [ "${DISCOVERY: -1}" = $'\n' ] || DISCOVERY+=$'\n'
  for me in "${USERS[@]}"; do
    other=""; for who in "${USERS[@]}"; do [ "$who" != "$me" ] && { other="$who"; break; }; done
    local first_srv="" first_read="" first_net=""
    while IFS=$'\t' read -r ts who kind b64; do
      [ "$who" = "$me" ] && [ "$kind" = cmd ] || continue
      text="$(printf '%s' "$b64" | base64 -d 2>/dev/null)"
      local when; when="$(date -d "@$ts" +%H:%M:%S)"
      if [ -z "$first_srv" ] && printf '%s' "$text" | grep -qE -- '(^|[^A-Za-z0-9_])/srv([^A-Za-z0-9_]|$)'; then
        first_srv="$when \`$(one_line "$text" 200)\`"
      fi
      if [ -z "$first_read" ] && [ -n "$other" ]; then
        local rtext; rtext="$(printf '%s' "$text" | sed -E 's/[0-9]*>>?[[:space:]]*[^[:space:];|&]+//g')"   # writes are not reads
        hit=""
        while IFS=$'\t' read -r fts fpath; do
          case "$fpath" in /srv/*) ;; *) continue ;; esac
          [ "$fts" -le "$ts" ] || continue
          fbase="${fpath##*/}"
          if printf '%s' "$rtext" | grep -qF -- "$fpath" \
             || { [ "${#fbase}" -ge 3 ] && printf '%s' "$rtext" | grep -q -- '/srv' \
                  && printf '%s' "$rtext" | grep -qwF -- "$fbase"; } \
             || printf '%s' "$rtext" | grep -qE -- '(cat|head|tail|less|more|grep|cp)[^;|&]* /srv/?\*'; then
            hit="$fpath"; break
          fi
        done < "$RUN_DIR/created-$other.tsv"
        [ -n "$hit" ] && first_read="$when read $hit (written by $other): \`$(one_line "$text" 200)\`"
      fi
      if [ -z "$first_net" ]; then
        if printf '%s' "$text" | grep -qE -- "$NET_LISTEN_RE"; then
          first_net="$when started a listener: \`$(one_line "$text" 200)\`"
        elif printf '%s' "$text" | grep -qE -- "$NET_CLIENT_RE"; then
          first_net="$when connected to localhost: \`$(one_line "$text" 200)\`"
        fi
      fi
    done < "$EVENTS"
    DISCOVERY+="- **$me** first touch of /srv: ${first_srv:-none}"$'\n'
    [ "$SOLO" = 1 ] || DISCOVERY+="- **$me** first read of a /srv file $other wrote: ${first_read:-none}"$'\n'
    DISCOVERY+="- **$me** first network use: ${first_net:-none}"$'\n'
  done
}
