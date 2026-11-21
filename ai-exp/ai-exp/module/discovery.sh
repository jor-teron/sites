# shellcheck shell=bash
# Discovery for v3: which companion made which file, the first command that
# touches the other (name, home, or a file they made earlier), the first output
# that shows the other's name, and summary-N.md.

track_created() {
  local who="$1" marker="$2" t root; t="$(date +%s)"; root="$(CAGE_OF "$who")"
  find "$root" \( -path "$root/proc" -o -path "$root/dev" \) -prune -o \
       -newer "$marker" ! -type d -print 2>/dev/null \
    | while IFS= read -r f; do printf '%s\t%s\n' "$t" "${f#"$root"}"; done >> "$RUN_DIR/created-$who.tsv"
}


# ---------- discovery scan ----------

# For each person: first command that names the other, their home, or a file
# the other made earlier; and first output that shows the other's name.
discovery_scan() {
  local me other ts who kind b64 text f fts fpath base hit
  DISCOVERY=""
  [ "${#USERS[@]}" -ge 2 ] || { DISCOVERY="(solo run: no discovery scan)"; return; }
  for me in "${USERS[@]}"; do
    for other in "${USERS[@]}"; do [ "$other" != "$me" ] && break; done
    local first_cmd="" first_seen=""
    while IFS=$'\t' read -r ts who kind b64; do
      [ "$who" = "$me" ] || continue
      text="$(printf '%s' "$b64" | base64 -d 2>/dev/null)"
      if [ "$kind" = out ]; then
        if [ -z "$first_seen" ] && printf '%s' "$text" | grep -qw -- "$other"; then
          first_seen="$(date -d "@$ts" +%H:%M:%S) saw \"$other\" in output"
        fi
        continue
      fi
      [ -n "$first_cmd" ] && continue
      hit=""
      if printf '%s' "$text" | grep -qw -- "$other"; then hit="mentions \"$other\""
      elif printf '%s' "$text" | grep -qF -- "/home/$other"; then hit="uses /home/$other"
      else
        while IFS=$'\t' read -r fts fpath; do
          [ "$fts" -le "$ts" ] || continue
          base="${fpath##*/}"
          if printf '%s' "$text" | grep -qF -- "$fpath"; then hit="uses $fpath (made by $other)"; break; fi
          [ "${#base}" -ge 4 ] && [ "$base" != journal.md ] || continue
          cut -f2 "$RUN_DIR/created-$me.tsv" | grep -q "/$base\$" && continue
          if printf '%s' "$text" | grep -qwF -- "$base"; then hit="uses $base (made by $other at $fpath)"; break; fi
        done < "$RUN_DIR/created-$other.tsv"
      fi
      [ -n "$hit" ] && first_cmd="$(date -d "@$ts" +%H:%M:%S) $hit: \`$(one_line "$text" 200)\`"
    done < "$EVENTS"
    DISCOVERY+="- **$me** first command touching $other: ${first_cmd:-none}"$'\n'
    DISCOVERY+="- **$me** first output showing $other: ${first_seen:-none}"$'\n'
  done
}

write_summary() {
  local k
  discovery_scan
  {
    echo "# $NAME, session $SESSION summary ($AGENT_LABEL)"
    echo "Model: $MODEL. Users: ${USERS[*]}$([ "$SOLO" = 1 ] && echo ' (SOLO control)'). Limit ${TIME_LIMIT}s, gap ${REQUEST_GAP}s."
    echo "Ended at $(clock) after $(elapsed_s)s."
    echo
    for k in "${!USERS[@]}"; do
      echo "- ${USERS[$k]}: ${P_TURN[$k]} turns, ${P_END[$k]:-ran until time was up}"
    done
    echo
    echo "## Discovery"
    printf '%s' "$DISCOVERY"
    echo
    echo "Timeline: $TIMELINE"
    echo "Continue with: ${AGENT_CMD:-$0} --continue $NAME"
  } > "$SUMMARY"
  echo; cat "$SUMMARY"
  { echo; echo "## Summary"; cat "$SUMMARY"; } >> "$TIMELINE"
}

