#!/usr/bin/env bash
# split-m3u.sh
# Read master M3Us in order, then write <csv-basename>.m3u in CSV row order.
# Block = #EXTINF plus following lines until the next #EXTINF.
# Same tvg-id may appear in more than one category file.
# Only skipped if that tvg-id is already in the same output file.
# Usage: ./split-m3u.sh

set -euo pipefail

############################################
# Preset paths — edit these if names change
############################################

# Master playlists as HTTP(S) links, scanned in this order.
# First block for a tvg-id wins. Replace the URLs.
MASTER_M3U_URLS=(
    "https://iptv-org.github.io/iptv/countries/in.m3u"
    "https://iptv-org.github.io/iptv/categories/kids.m3u"
    "https://iptv-org.github.io/iptv/index.m3u"
)

# CSV files to process, in this order.
CSV_FILES=(
    "home.csv"
    "home-more.csv"
    "kids.csv"
)

# Resolution / quality labels stripped from the channel name.
# Add or remove items here. Matched as "(label)" with optional spaces.
RES_TAGS=(
    "2160p"
    "1440p"
    "1080p"
    "1080i"
    "720p"
    "576p"
    "576i"
    "540p"
    "504p"
    "480p"
    "432p"
    "360p"
    "240p"
    "4K"
    "UHD"
    "QHD"
    "FHD"
    "nHD"
    "HD"
    "SD"
)

# Name junk in "[...]" — kept for reference. Stripping uses the safe sed below.
NAME_JUNK=(
    # Commenting these still strips them via the fixed sed in clean_extinf.
    # "Geo-blocked"
    # "Not 24/7"
)

############################################

# tvg-id already written to an output file.
declare -A USED_TVG_ID

# tvg-id -> full channel block from the master file.
declare -A BLOCK_BY_TVG

# Output filename already given an #EXTM3U header.
declare -A OUTPUT_HAS_HEADER

# Error lines collected during the run, printed at the end.
ERROR_LINES=()

# How many new tvg-id blocks were stored from the current master.
NEW_IDS_THIS_FILE=0

# Print a timestamped status line.
log_msg() {
    # Message text.
    local message="$1"
    # Status goes to stderr so command substitutions stay clean.
    printf '%s %s\n' "$(date '+%H:%M:%S')" "$message" >&2
}

# Strip surrounding double quotes from a CSV field.
strip_quotes() {
    # Field text to clean.
    local field="$1"
    field="${field#\"}"
    field="${field%\"}"
    printf '%s' "$field"
}

# Trim leading and trailing whitespace / CR.
trim_text() {
    # Text to trim.
    local text="$1"
    text="${text//[$'\t\r']/}"
    text="${text#"${text%%[![:space:]]*}"}"
    text="${text%"${text##*[![:space:]]}"}"
    printf '%s' "$text"
}

# Pull tvg-id from an #EXTINF line.
extract_tvg_id() {
    # Full #EXTINF line.
    local extinf_line="$1"
    # Matched tvg-id.
    local tvg_id=""

    if [[ "$extinf_line" =~ tvg-id=\"([^\"]*)\" ]]; then
        tvg_id="${BASH_REMATCH[1]}"
    elif [[ "$extinf_line" =~ tvg-id=([^[:space:],]+) ]]; then
        tvg_id="${BASH_REMATCH[1]}"
    fi

    printf '%s' "$tvg_id"
}

# Clean one #EXTINF line: drop http-user-agent, keep group-title, strip resolution from name.
clean_extinf() {
    # Original #EXTINF line.
    local extinf_line="$1"
    # Text before the last comma (attributes).
    local attrs
    # Display name after the last comma.
    local name

    # Remove http-user-agent="..." so commas inside the UA cannot break the name.
    extinf_line="$(printf '%s' "$extinf_line" | sed -E 's/[[:space:]]*http-user-agent="[^"]*"//g')"

    # Split attributes / name on the last comma.
    attrs="${extinf_line%,*}"
    name="${extinf_line##*,}"

    # One resolution label from RES_TAGS.
    local res_tag

    # Strip "(1080p)" style tags. Bash replace so / in labels cannot break sed.
    for res_tag in "${RES_TAGS[@]}"; do
        name="${name// ($res_tag)/}"
        name="${name//($res_tag)/}"
    done

    # Strip "[Geo-blocked]" / "[Not 24/7]" including brackets.
    # # delimiter so the / in "Not 24/7" does not wipe the name.
    name="$(printf '%s' "$name" | sed -E 's#[[:space:]]*\[Geo-blocked\]##g')"
    name="$(printf '%s' "$name" | sed -E 's#[[:space:]]*\[Not 24/7\]##g')"
    name="$(printf '%s' "$name" | sed -E 's#[[:space:]]*\[Geo-blocked, Not 24/7\]##g')"
    name="$(printf '%s' "$name" | sed -E 's#[[:space:]]*\[Not 24/7, Geo-blocked\]##g')"
    # Trim leftover spaces on the name.
    name="$(trim_text "$name")"

    printf '%s,%s' "$attrs" "$name"
}

# Replace group-title on an #EXTINF line when CSV group is filled.
set_group_title() {
    # Original #EXTINF line.
    local extinf_line="$1"
    # Group text from CSV.
    local group="$2"

    if [[ "$extinf_line" =~ group-title=\" ]]; then
        printf '%s' "$extinf_line" | sed -E "s#group-title=\"[^\"]*\"#group-title=\"${group}\"#"
    else
        printf '%s' "$extinf_line" | sed -E "s#,# group-title=\"${group}\",#"
    fi
}

# Apply optional CSV group to the first line of a cleaned block.
apply_group_to_block() {
    # Cleaned block text.
    local block="$1"
    # Optional group from CSV.
    local group="$2"
    # First line.
    local first
    # Rest of block.
    local rest

    [[ -z "$group" ]] && { printf '%s' "$block"; return 0; }

    first="${block%%$'\n'*}"
    if [[ "$first" == "$block" ]]; then
        rest=""
    else
        rest="${block#*$'\n'}"
    fi

    first="$(set_group_title "$first" "$group")"

    if [[ -n "$rest" ]]; then
        printf '%s\n%s' "$first" "$rest"
    else
        printf '%s' "$first"
    fi
}

# Clean EXTINF and drop #EXTVLCOPT user-agent lines from a block.
clean_block() {
    # Raw block from master.
    local block="$1"
    # First line of the block.
    local first
    # Remaining lines.
    local rest
    # One line from the rest of the block.
    local mid
    # Cleaned rest without UA option lines.
    local cleaned_rest=""

    first="${block%%$'\n'*}"
    if [[ "$first" == "$block" ]]; then
        rest=""
    else
        rest="${block#*$'\n'}"
    fi

    first="$(clean_extinf "$first")"

    if [[ -n "$rest" ]]; then
        while IFS= read -r mid || [[ -n "$mid" ]]; do
            # Drop VLC user-agent option lines.
            [[ "$mid" == \#EXTVLCOPT:http-user-agent=* ]] && continue
            if [[ -n "$cleaned_rest" ]]; then
                cleaned_rest+=$'\n'"$mid"
            else
                cleaned_rest="$mid"
            fi
        done <<< "$rest"
    fi

    if [[ -n "$cleaned_rest" ]]; then
        printf '%s\n%s' "$first" "$cleaned_rest"
    else
        printf '%s' "$first"
    fi
}

# Download one master URL to a temp file and return that path.
fetch_master() {
    # Remote playlist URL.
    local url="$1"
    # Temp file for the downloaded playlist.
    local tmp_file

    tmp_file="$(mktemp)"
    log_msg "Downloading $url"
    if ! curl -fsSL --retry 2 --retry-delay 1 -o "$tmp_file" "$url"; then
        ERROR_LINES+=("Download failed: $url")
        echo "Download failed: $url" >&2
        rm -f "$tmp_file"
        exit 1
    fi
    log_msg "Downloaded $url ($(wc -l < "$tmp_file") lines)"
    printf '%s' "$tmp_file"
}

# Index every channel block in one master M3U by tvg-id.
index_one_master() {
    # Path of the master playlist (local temp file).
    local master_path="$1"
    # Current line.
    local line
    # Buffered block text.
    local block=""
    # tvg-id of the buffered block.
    local current_id=""

    if [[ ! -f "$master_path" ]]; then
        ERROR_LINES+=("Master file missing: $master_path")
        echo "Master M3U not found: $master_path" >&2
        exit 1
    fi

    # Reset new-id counter for this file.
    NEW_IDS_THIS_FILE=0

    # Store the buffered block if it has a tvg-id not seen yet.
    store_block() {
        if [[ -n "$current_id" && -n "$block" ]]; then
            # Keep first block only if the master itself repeats an id.
            if [[ -z "${BLOCK_BY_TVG[$current_id]+x}" ]]; then
                BLOCK_BY_TVG["$current_id"]="$block"
                NEW_IDS_THIS_FILE=$((NEW_IDS_THIS_FILE + 1))
            fi
        fi
    }

    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" == \#EXTINF* ]]; then
            store_block
            current_id="$(extract_tvg_id "$line")"
            block="$line"
            continue
        fi

        # Skip playlist header.
        [[ "$line" == \#EXTM3U* ]] && continue
        [[ -z "$current_id" ]] && continue

        block+=$'\n'"$line"
    done < "$master_path"

    store_block
    log_msg "Indexed $master_path — new ids: $NEW_IDS_THIS_FILE (total: ${#BLOCK_BY_TVG[@]})"
}

# Append one block to <category>.m3u, creating the header once.
write_block() {
    # Category / output basename.
    local category="$1"
    # Full block text.
    local block="$2"
    # Output file name.
    local out_file="${category}.m3u"

    if [[ -z "${OUTPUT_HAS_HEADER[$out_file]+x}" ]]; then
        printf '%s\n' "#EXTM3U" > "$out_file"
        OUTPUT_HAS_HEADER["$out_file"]=1
    fi

    printf '%s\n\n' "$block" >> "$out_file"
}

# Walk one CSV in row order and emit matching blocks.
process_csv() {
    # CSV path.
    local csv_path="$1"
    # Current CSV line.
    local line
    # Raw first column (tvg-id).
    local raw_id
    # Clean tvg-id.
    local tvg_id
    # Optional group from second CSV column.
    local raw_group
    local group
    # Output basename from the CSV filename (home.csv -> home).
    local category
    # Cleaned channel block.
    local out_block
    # CSV filename without directory.
    local csv_base

    csv_base="$(basename "$csv_path")"
    category="${csv_base%.csv}"
    category="${category%.txt}"
    category="${category%.list}"

    if [[ ! -f "$csv_path" ]]; then
        ERROR_LINES+=("CSV not found: $csv_path")
        echo "CSV not found: $csv_path" >&2
        exit 1
    fi

    log_msg "Reading CSV $csv_path"

    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$(trim_text "$line")" ]] && continue
        # Skip header row if present.
        [[ "$line" =~ ^[\"\']?tvg-id[\"\']?([,].*)?$ ]] && continue

        # Column 1 = tvg-id. Column 2 = optional group-title.
        raw_id="${line%%,*}"
        if [[ "$line" == *,* ]]; then
            raw_group="${line#*,}"
            raw_group="${raw_group%%,*}"
        else
            raw_group=""
        fi
        tvg_id="$(trim_text "$(strip_quotes "$raw_id")")"
        group="$(trim_text "$(strip_quotes "$raw_group")")"

        [[ -z "$tvg_id" ]] && continue

        # Key is category + tvg-id so the same channel can go in several files.
        local used_key="${category}|${tvg_id}"

        # Skip only if this tvg-id is already in this category file.
        if [[ -n "${USED_TVG_ID[$used_key]+x}" ]]; then
            log_msg "SKIP same-file  $tvg_id  ($csv_path -> ${category}.m3u)"
            ERROR_LINES+=("Same-file duplicate: $tvg_id ($csv_path -> ${category}.m3u)")
            continue
        fi

        # Skip if master has no block for this id.
        if [[ -z "${BLOCK_BY_TVG[$tvg_id]+x}" ]]; then
            log_msg "MISS           $tvg_id  ($csv_path -> ${category}.m3u)"
            ERROR_LINES+=("Missing in masters: $tvg_id ($csv_path)")
            continue
        fi

        out_block="$(clean_block "${BLOCK_BY_TVG[$tvg_id]}")"
        out_block="$(apply_group_to_block "$out_block" "$group")"
        write_block "$category" "$out_block"
        USED_TVG_ID["$used_key"]=1
        if [[ -n "$group" ]]; then
            log_msg "OK             $tvg_id  -> ${category}.m3u  group=$group"
        else
            log_msg "OK             $tvg_id  -> ${category}.m3u  group=keep"
        fi
    done < "$csv_path"
}

# Main entry.
main() {
    # Single CSV path from the preset list.
    local csv_path

    # One master URL from the preset list.
    local master_url
    # Local temp copy of that playlist.
    local master_path
    # Temp files to delete after indexing.
    local -a tmp_masters=()

    for master_url in "${MASTER_M3U_URLS[@]}"; do
        master_path="$(fetch_master "$master_url")"
        tmp_masters+=("$master_path")
        index_one_master "$master_path"
    done

    # Remove downloaded copies.
    rm -f "${tmp_masters[@]}"

    for csv_path in "${CSV_FILES[@]}"; do
        process_csv "$csv_path"
    done

    log_msg "Done. Wrote ${#USED_TVG_ID[@]} channels. Outputs: home.m3u home-more.m3u kids.m3u"

    echo
    echo "===== ERRORS / SKIPS (${#ERROR_LINES[@]}) ====="
    if [[ ${#ERROR_LINES[@]} -eq 0 ]]; then
        echo "None."
    else
        # One collected error line.
        local err
        for err in "${ERROR_LINES[@]}"; do
            echo "$err"
        done
    fi
}

main
