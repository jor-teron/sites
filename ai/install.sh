#!/bin/sh
# =============================================================================
# ai-mcp — MCP server for a sandboxed workspace
#
# File:         install.sh
# Purpose:      Fresh install (or idempotent re-run) of the v3.29 server on
#               Debian, x86_64 or arm64. Checks Python, git and user
#               namespaces; copies the server; writes mcp.conf once; adds a boot cron line
#               and optional Tailscale Funnel; then starts the server.
# Place:        /www/ai/install.sh (next to mcp.sh, mcp/ and README.md).
# Version:      3.3
# Project:      ai-mcp
# Author:       Jor Teron
# Licence:      All rights reserved.
# Dependencies: POSIX sh (also works under bash), python3 3.8+, git,
#               and for the workspace image: truncate or dd, mkfs.ext4
#               (e2fsprogs), plus sudo for the loop mount and fstab.
# =============================================================================
# --- help start ---
# Install the MCP server (POSIX sh; also works under bash).
#   ./install.sh                     install to /home/www/ai
#   ./install.sh --dir DIR           install to DIR (or $MCP_INSTALL_DIR)
#   ./install.sh --port PORT         listen port for a new mcp.conf (default 10001)
#   (workspace image feature is disabled in this release)
#   ./install.sh --yes               no prompts: generate a random PIN if needed
#   ./install.sh --no-cron           do not add the @reboot crontab line
#   ./install.sh --no-funnel         do not configure Tailscale Funnel
#   ./install.sh --no-mount          create workspace.img if possible, but do
#                                    not mount it or edit fstab
#   ./install.sh --no-image          skip the workspace disk image entirely
#   ./install.sh --no-start          do not start the server at the end
#   ./install.sh --fstab PATH        fstab file to edit (default /etc/fstab)
#   ./install.sh --version           print version and exit
#   ./install.sh --help              this help
#
# Safe to re-run. An existing mcp.conf is never overwritten (your PIN stays).
# Existing workspace files are copied into the image and backed up, never
# deleted. sudo is used only for the loop mount, fstab, and creating a
# directory you cannot write; the script says why first.
# --- help end ---
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERSION=$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || printf unknown)

# mkfs.ext4 and blkid live in /usr/sbin or /sbin, which are often missing
# from a non-root user's PATH. Put them first so has_cmd can find them.
PATH="/usr/sbin:/sbin:$PATH"
export PATH

# -----------------------------------------------------------------------------
# Constants
# All default paths, sizes, port, PIN rules and labels live in this block.
# Flags and environment variables may override the ones that are exported
# or assigned in parse_args; the names and fallbacks themselves are here.
# -----------------------------------------------------------------------------

# Default install directory when --dir / MCP_INSTALL_DIR is unset.
DEFAULT_DIR="/home/www/ai"

# Default listen port written into a new mcp.conf.
DEFAULT_PORT="10001"

# Default size of the /workspace disk image (1024-based, passed to truncate).
DEFAULT_WORKSPACE_SIZE="2G"

# Folder name of the chroot / file-tool root, next to mcp.sh.
SANDBOX_DIR_NAME="sandbox"

# Folder name of the AI's /workspace, created under the sandbox.
WORKSPACE_DIR_NAME="workspace"

# Filename of the optional config file written next to mcp.sh.
CONF_FILENAME="mcp.conf"

# Filename of the /workspace disk image, kept next to mcp.sh (not in sandbox/).
WORKSPACE_IMAGE_NAME="workspace.img"

# Filesystem type used when formatting the workspace image.
WORKSPACE_IMAGE_FS="ext4"

# Label passed to mkfs.ext4 -L so the volume is easy to recognise.
WORKSPACE_IMAGE_LABEL="mcp-workspace"

# fstab options for the loop image. nofail so a missing image does not
# block boot.
WORKSPACE_FSTAB_OPTIONS="loop,nofail"

# Seconds the @reboot cron line waits before starting the server, so the
# network and Tailscale have a chance to come up first.
CRON_SLEEP=20

# Shortest PIN install.sh will accept when writing a new mcp.conf.
# The running server still accepts shorter PINs (PIN hardening is not
# part of this release); this rule applies only to a fresh conf file.
MIN_PIN_LEN=12

# Demo / obviously weak PIN that must not be written to a new mcp.conf.
# Compared case-insensitively.
WEAK_PIN="password"

# Number of random bytes drawn from /dev/urandom when generating a PIN.
# Written as hex, so the PIN is twice this many characters (24 >= 12).
PIN_RANDOM_BYTES=12

# Mode of a newly written mcp.conf (owner read/write only; it holds the PIN).
CONF_MODE=600

# Minimum Python version required to run the server.
PYTHON_MIN_MAJOR=3
PYTHON_MIN_MINOR=8

# Default fstab path. Tests may pass --fstab or set MCP_FSTAB.
DEFAULT_FSTAB="/etc/fstab"

# Default log path used in a new mcp.conf when /home/ai is writable.
DEFAULT_LOG="/home/ai/mcp.log"

# Default state directory used by mcp.sh when /home/ai is writable.
DEFAULT_STATE_DIR="/home/ai"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

say() {
  # Print one tagged status line to stdout.
  # Arguments: the message words (joined by "$*").
  printf '%s\n' "[install] $*"
}

die() {
  # Print an error and exit 1.
  # Arguments: the message words.
  printf '%s\n' "[install] error: $*" >&2
  exit 1
}

print_help() {
  # Print the usage block between the help markers at the top of this file.
  sed -n '/^# --- help start ---$/,/^# --- help end ---$/p' "$0" \
    | sed '1d;$d;s/^# \{0,1\}//'
}

has_cmd() {
  # Return 0 if the named command is on PATH.
  # Arguments: command name.
  command -v "$1" >/dev/null 2>&1
}

is_abs() {
  # Return 0 if $1 starts with a slash.
  # Arguments: a path.
  case "$1" in
    /*) return 0 ;;
    *)  return 1 ;;
  esac
}

path_has_space() {
  # Return 0 if $1 contains whitespace or a newline (unsafe in fstab).
  # Arguments: a path.
  case "$1" in
    *[[:space:]]*) return 0 ;;
    *)             return 1 ;;
  esac
}

restore_echo() {
  # Turn terminal echo back on (used by the PIN prompt trap).
  stty echo 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Checks
# -----------------------------------------------------------------------------

check_python() {
  # Require python3 >= 3.8. Print an apt hint and return 1 if not.
  if ! has_cmd python3; then
    say "python3 is not installed. On Debian: sudo apt install python3"
    return 1
  fi
  if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)'; then
    # ver is only for the message; the comparison already failed.
    ver=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || printf '%s\n' "unknown")
    say "python3 is $ver; this server needs 3.8 or newer. On Debian: sudo apt install python3"
    return 1
  fi
  say "python3: $(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
  return 0
}

check_git() {
  # Require git on PATH. Print an apt hint and return 1 if not.
  if ! has_cmd git; then
    say "git is not installed. On Debian: sudo apt install git"
    return 1
  fi
  say "git: $(git --version 2>/dev/null | awk '{print $3; exit}')"
  return 0
}

read_sysctl() {
  # Print the contents of a sysctl-style /proc file, or "missing".
  # Arguments: the file path.
  if [ -r "$1" ]; then
    tr -d ' \t\n' < "$1"
  else
    printf '%s\n' "missing"
  fi
}

check_userns() {
  # Check that unprivileged user namespaces can be created. Warns with
  # the one-line sysctl fix if not, but does not fail the install (the
  # server can still run with MCP_SANDBOX=none).
  # clone is kernel.unprivileged_userns_clone (Debian/Ubuntu; may be absent).
  clone=$(read_sysctl /proc/sys/kernel/unprivileged_userns_clone)
  # maxns is user.max_user_namespaces; should be greater than 0.
  maxns=$(read_sysctl /proc/sys/user/max_user_namespaces)
  ok=1
  if [ "$clone" = "0" ]; then
    ok=0
    say "Unprivileged user namespaces are off (kernel.unprivileged_userns_clone=0)."
    say "Enable them with: sudo sysctl -w kernel.unprivileged_userns_clone=1"
  fi
  if [ "$maxns" = "0" ]; then
    ok=0
    say "User namespaces are capped at 0 (user.max_user_namespaces=0)."
    say "Enable them with: sudo sysctl -w user.max_user_namespaces=10000"
  fi
  if [ "$ok" -eq 1 ] && has_cmd unshare; then
    if unshare --user --map-root-user true 2>/dev/null; then
      say "unprivileged user namespaces: available"
      return 0
    fi
    say "unshare --user failed. If this kernel blocks the feature, enable it with:"
    say "  sudo sysctl -w kernel.unprivileged_userns_clone=1"
    ok=0
  fi
  if [ "$ok" -eq 1 ]; then
    say "unprivileged user namespaces: looks enabled (clone=$clone max=$maxns)"
  else
    say "The server can still be installed; start it with MCP_SANDBOX=none if the jail cannot start."
  fi
  return 0
}

# -----------------------------------------------------------------------------
# PIN helpers (used only when writing a new mcp.conf)
# -----------------------------------------------------------------------------

pin_is_weak() {
  # Return 0 if the PIN is obviously weak (the word "password", or shorter
  # than MIN_PIN_LEN) or contains characters that would break mcp.conf
  # (whitespace, quotes, or shell-like $ ` \). The running server does
  # not apply this rule.
  # Arguments: the candidate PIN.
  pin=$1
  # lower is the PIN folded to lowercase for the "password" check.
  lower=$(printf '%s' "$pin" | tr '[:upper:]' '[:lower:]')
  if [ "$lower" = "$WEAK_PIN" ]; then
    return 0
  fi
  # len is the character count; printf %s does not add a newline.
  len=$(printf '%s' "$pin" | wc -c)
  if [ "$len" -lt "$MIN_PIN_LEN" ]; then
    return 0
  fi
  # Reject anything outside a conservative unquoted conf charset so the
  # value can be written unquoted in mcp.conf.
  case "$pin" in
    *[!A-Za-z0-9._+=-]*) return 0 ;;
  esac
  return 1
}

generate_pin() {
  # Print a random hex PIN of PIN_RANDOM_BYTES*2 characters to stdout.
  # Never log this value; the caller writes it only to mcp.conf.
  if [ -r /dev/urandom ]; then
    # hex is od output with spaces and newlines stripped.
    hex=$(dd if=/dev/urandom bs="$PIN_RANDOM_BYTES" count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
    if [ -n "$hex" ]; then
      printf '%s' "$hex"
      return 0
    fi
  fi
  # Fallback if /dev/urandom is missing; still do not print to logs.
  awk 'BEGIN { srand(); for (i = 0; i < 24; i++) printf "%x", int(rand()*16) }'
}

prompt_pin() {
  # Read a PIN twice with echo off, confirm they match, and refuse weak
  # values. Prints the PIN on stdout (the caller captures it). Prompts
  # go to stderr so they are not captured.
  # Uses stty; restores echo on exit from this function via the trap.
  trap restore_echo INT TERM EXIT
  while true; do
    printf '%s' "PIN (min $MIN_PIN_LEN characters, not 'password'; empty generates one): " >&2
    stty -echo 2>/dev/null || true
    IFS= read -r pin || pin=""
    stty echo 2>/dev/null || true
    printf '\n' >&2
    printf '%s' "Confirm PIN: " >&2
    stty -echo 2>/dev/null || true
    IFS= read -r pin2 || pin2=""
    stty echo 2>/dev/null || true
    printf '\n' >&2
    if [ -z "$pin" ] && [ -z "$pin2" ]; then
      trap - INT TERM EXIT
      generate_pin
      return 0
    fi
    if [ "$pin" != "$pin2" ]; then
      say "PINs did not match; try again." >&2
      continue
    fi
    if pin_is_weak "$pin"; then
      say "That PIN is too weak (must be at least $MIN_PIN_LEN characters and not 'password'). Try again, or leave both prompts empty to generate one." >&2
      continue
    fi
    trap - INT TERM EXIT
    printf '%s' "$pin"
    return 0
  done
}

# -----------------------------------------------------------------------------
# mcp.conf
# -----------------------------------------------------------------------------

write_new_conf() {
  # Write a new mcp.conf to $1 with HOST, PORT, PIN, SANDBOX and paths.
  # The PIN is written to the file only; it is never printed.
  # Arguments: dest path, pin, port, log path, state dir, workspace size.
  dest=$1
  pin=$2
  port=$3
  log_path=$4
  state_dir=$5
  ws_size=$6
  # umask 077 so the PIN file is not group/world readable even if chmod fails.
  umask 077
  cat > "$dest" <<EOF
# =============================================================================
# ai-mcp — MCP server for a sandboxed workspace
#
# File:         mcp.conf
# Purpose:      KEY=value overrides written by install.sh. Environment
#               variables already set in the shell win over these values.
# Place:        next to mcp.sh, mcp/ and sandbox/.
# Version:      3.3
# Project:      ai-mcp
# Author:       Jor Teron
# Licence:      All rights reserved.
# =============================================================================
# Lines starting with # are comments. KEY=value, optional quotes.

# PIN is set by install.sh. Open this file to view or change it.
# Do not commit or share this file.
PIN=$pin

HOST=127.0.0.1
PORT=$port

# sandbox/ is the chroot / file-tool root (the AI's /).
# The working directory is sandbox/workspace/ (the AI's /workspace).
# ROOT=$DEST/$SANDBOX_DIR_NAME

# ns = namespaces + chroot (default). none = no jail (file tools still confined).
SANDBOX=ns
# 1 to give sandboxed commands network access
SANDBOX_NET=0

LOG=$log_path
STATE_DIR=$state_dir

# Per-command limits inside the jail
TIMEOUT=60
MEMORY_MB=512
MAX_PROCS=64

# Size of the /workspace disk image (created by install.sh). The cap is
# only active when sandbox/workspace is a mounted filesystem.
WORKSPACE_SIZE=$ws_size

# Only enable this if a trusted reverse proxy sets X-Forwarded-For.
TRUST_PROXY=0
EOF
  chmod "$CONF_MODE" "$dest" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Layout and copy
# -----------------------------------------------------------------------------

copy_server_files() {
  # Copy the server and its optional API, storage and RAG modules.
  # Does not copy mcp.conf or sandbox/ (those are created separately).
  # Arguments: source dir, destination dir.
  src=$1
  dest=$2
  if [ "$src" = "$dest" ]; then
    say "install directory is the source tree; files are already in place."
    return 0
  fi
  # srcfile is each required path that must exist in the unpacked tree.
  for srcfile in "$src/VERSION" "$src/mcp.sh" "$src/README.md" "$src/CHANGELOG.md" "$src/RELEASE.md" "$src/docs" "$src/mcp" "$src/api" "$src/storage" "$src/rag" "$src/rag.sh"; do
    [ -e "$srcfile" ] || die "source tree is incomplete: missing $srcfile"
  done
  cp -a "$src/VERSION" "$dest/VERSION"
  cp -a "$src/mcp.sh" "$dest/mcp.sh"
  chmod +x "$dest/mcp.sh" 2>/dev/null || true
  cp -a "$src/mcp" "$dest/"
  cp -a "$src/api" "$dest/"
  cp -a "$src/storage" "$dest/"
  cp -a "$src/rag" "$dest/"
  cp -a "$src/rag.sh" "$dest/rag.sh"
  chmod +x "$dest/rag.sh" 2>/dev/null || true
  cp -a "$src/README.md" "$dest/README.md"
  cp -a "$src/CHANGELOG.md" "$dest/CHANGELOG.md"
  cp -a "$src/RELEASE.md" "$dest/RELEASE.md"
  cp -a "$src/docs" "$dest/docs"
  if [ -f "$src/install.sh" ]; then
    cp -a "$src/install.sh" "$dest/install.sh"
    chmod +x "$dest/install.sh" 2>/dev/null || true
  fi
  say "copied VERSION, MCP/API/RAG modules, scripts, README and docs into $dest"
}

ensure_sandbox() {
  # Create sandbox/ and sandbox/workspace/ under DEST, then git init the
  # workspace if it is not already a repo.
  # Arguments: destination dir.
  dest=$1
  # sandbox is the AI's / on the host.
  sandbox="$dest/$SANDBOX_DIR_NAME"
  # ws is the AI's /workspace on the host.
  ws="$sandbox/$WORKSPACE_DIR_NAME"
  mkdir -p "$ws" || die "cannot create $ws"
  if [ -e "$ws/.git" ]; then
    say "git repo already present in $ws"
    return 0
  fi
  if has_cmd git; then
    if git init "$ws" >/dev/null 2>&1; then
      say "git init in $ws"
    else
      say "git init failed in $ws (continuing)"
    fi
  fi
}

dir_is_nonempty() {
  # Return 0 if directory $1 exists and contains any entry (including hidden).
  # Arguments: a directory path.
  dir=$1
  [ -d "$dir" ] || return 1
  # entry is the first name returned by a hidden-inclusive glob.
  entry=$(ls -A "$dir" 2>/dev/null | head -n 1)
  [ -n "$entry" ]
}

# -----------------------------------------------------------------------------
# Workspace image
# -----------------------------------------------------------------------------

image_has_filesystem() {
  # Return 0 if $1 already contains a filesystem, so we must not mkfs it.
  # Prefers blkid; otherwise looks for the ext2/3/4 superblock magic
  # (0xEF53 little-endian) at offset 1080, which a fresh sparse file
  # of zeros will not have.
  # Arguments: image path.
  img=$1
  [ -e "$img" ] || return 1
  if has_cmd blkid; then
    typ=$(blkid -o value -s TYPE "$img" 2>/dev/null || true)
    if [ -n "$typ" ]; then
      return 0
    fi
  fi
  # magic is the two-byte ext superblock signature as lowercase hex.
  magic=$(dd if="$img" bs=1 skip=1080 count=2 2>/dev/null | od -An -tx1 | tr -d ' 
')
  [ "$magic" = "53ef" ]
}

create_workspace_image() {
  # Create a sparse image file of the requested size and format it as
  # ext4 if it does not already exist. Never reformats an image that
  # already has a filesystem. If an earlier run left an unformatted
  # sparse file (mkfs.ext4 was missing), a later run will format it.
  # Arguments: image path, size string (for example 2G).
  # Returns 0 on success (image ready or already present), 1 on failure.
  img=$1
  size=$2
  if [ -e "$img" ] && image_has_filesystem "$img"; then
    say "workspace image already exists: $img (leaving it unchanged)"
    return 0
  fi
  if [ -e "$img" ]; then
    say "workspace image $img exists but has no filesystem yet; will format it"
  fi
  if has_cmd truncate; then
    if ! truncate -s "$size" "$img"; then
      say "could not create sparse image $img with truncate"
      return 1
    fi
  elif has_cmd dd; then
    if ! dd if=/dev/zero of="$img" bs=1 count=0 seek="$size" 2>/dev/null; then
      say "could not create sparse image $img with dd"
      return 1
    fi
  else
    say "neither truncate nor dd is available; cannot create $img"
    return 1
  fi
  say "created sparse $size image $img"
  if ! has_cmd mkfs.ext4; then
    say "mkfs.ext4 is not installed; the image is unformatted."
    say "On Debian: sudo apt install e2fsprogs"
    return 1
  fi
  # -F forces a file (not a block device). -m 0 disables the 5% root
  # reserve so the non-root server user can use the full size.
  if ! mkfs.ext4 -F -m 0 -L "$WORKSPACE_IMAGE_LABEL" "$img" >/dev/null 2>&1; then
    say "mkfs.ext4 failed on $img"
    return 1
  fi
  say "formatted $img as $WORKSPACE_IMAGE_FS"
  return 0
}

fstab_has_workspace() {
  # Return 0 if the fstab file already mentions this image or mount point.
  # Arguments: fstab path, image path, mount point.
  fstab=$1
  img=$2
  mnt=$3
  [ -f "$fstab" ] || return 1
  # Match either path as a whole field so we do not add a duplicate.
  grep -E -q "^[^#]*(^|[[:space:]])$img([[:space:]]|$)" "$fstab" 2>/dev/null && return 0
  grep -E -q "^[^#]*(^|[[:space:]])$mnt([[:space:]]|$)" "$fstab" 2>/dev/null && return 0
  return 1
}

add_fstab_line() {
  # Append a loop,nofail fstab line if it is not already present.
  # Uses sudo only when the fstab file is not writable.
  # Arguments: fstab path, image path, mount point.
  # Returns 0 on success or if the line is already there, 1 on failure.
  fstab=$1
  img=$2
  mnt=$3
  # line is the exact fstab entry we want.
  line="$img  $mnt  $WORKSPACE_IMAGE_FS  $WORKSPACE_FSTAB_OPTIONS  0  0"
  if fstab_has_workspace "$fstab" "$img" "$mnt"; then
    say "fstab already has a line for the workspace image or mount ($fstab)"
    return 0
  fi
  if [ -f "$fstab" ] && [ -w "$fstab" ]; then
    printf '%s\n' "$line" >> "$fstab" || return 1
    say "added fstab line in $fstab"
    return 0
  fi
  if [ ! -e "$fstab" ] && [ -w "$(dirname -- "$fstab")" ]; then
    # Start a private/test fstab with a comment rather than a bare line.
    printf '%s\n' "# fstab written by ai-mcp install.sh" > "$fstab" || return 1
    printf '%s\n' "$line" >> "$fstab" || return 1
    say "added fstab line in $fstab"
    return 0
  fi
  say "Adding a loop mount for $img at $mnt to $fstab needs root"
  say "(so the 2G /workspace disk limit survives a reboot). About to run sudo."
  if ! has_cmd sudo && [ "$(id -u)" -ne 0 ]; then
    say "sudo is not available; add this line to $fstab by hand:"
    say "  $line"
    return 1
  fi
  # Use a root shell so we can create the file if needed and then append.
  if ! run_priv sh -c 'if [ ! -e "$1" ]; then printf "%s\n" "# fstab" > "$1"; fi; printf "%s\n" "$2" >> "$1"' sh "$fstab" "$line"; then
    say "could not update $fstab; add this line by hand:"
    say "  $line"
    return 1
  fi
  say "added fstab line in $fstab"
  return 0
}

run_priv() {
  # Run a command, prefixing sudo when we are not already root.
  # Arguments: the command and its args.
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

can_mount() {
  # Return 0 if we can create a loop mount (root, or sudo that works).
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi
  if has_cmd sudo && sudo -n true 2>/dev/null; then
    return 0
  fi
  return 1
}

setup_workspace_image() {
  # Create the 2G (or configured) workspace image, migrate any existing
  # workspace contents, add an fstab line, mount it, and chown it to the
  # installing user. Skips the mount when --no-mount is set or when sudo
  # is not available. Never deletes user data; a non-empty workspace is
  # copied into the image and the original is renamed to a timestamped
  # backup.
  # Uses global: DEST, WORKSPACE_SIZE, FSTAB, NO_MOUNT, NO_IMAGE.
  if [ "$NO_IMAGE" -eq 1 ]; then
    say "skipping workspace image (--no-image)"
    return 0
  fi
  # img is the host path of the sparse disk image (outside the sandbox).
  img="$DEST/$WORKSPACE_IMAGE_NAME"
  # sandbox is the AI's / on the host.
  sandbox="$DEST/$SANDBOX_DIR_NAME"
  # ws is the intended mount point (the AI's /workspace).
  ws="$sandbox/$WORKSPACE_DIR_NAME"
  mkdir -p "$sandbox" || die "cannot create $sandbox"

  if ! create_workspace_image "$img" "$WORKSPACE_SIZE"; then
    say "workspace image is not ready; the server will run without a disk cap."
    return 0
  fi

  if [ "$NO_MOUNT" -eq 1 ]; then
    say "skipping mount and fstab (--no-mount). To finish later (needs root):"
    say "  sudo mkdir -p $ws"
    say "  echo '$img  $ws  $WORKSPACE_IMAGE_FS  $WORKSPACE_FSTAB_OPTIONS  0  0' | sudo tee -a ${FSTAB}"
    say "  sudo mount $ws"
    say "  sudo chown $(id -un):$(id -gn) $ws"
    return 0
  fi

  if mountpoint -q "$ws" 2>/dev/null; then
    say "$ws is already a mount point; leaving it as is."
    add_fstab_line "$FSTAB" "$img" "$ws" || true
    return 0
  fi

  if ! can_mount; then
    say "Mounting $img at $ws needs root (loop mount). sudo is not available here."
    say "The image is ready. To finish later, run this script again as a user who can sudo,"
    say "or mount it by hand:"
    say "  sudo mkdir -p $ws"
    say "  echo '$img  $ws  $WORKSPACE_IMAGE_FS  $WORKSPACE_FSTAB_OPTIONS  0  0' | sudo tee -a ${FSTAB}"
    say "  sudo mount $ws"
    say "  sudo chown $(id -un):$(id -gn) $ws"
    return 0
  fi

  # tmpmnt is a temporary mount point used to copy existing files in
  # before we replace $ws itself.
  tmpmnt="$DEST/.mcp-workspace-mnt"
  mkdir -p "$tmpmnt" || die "cannot create $tmpmnt"
  say "Mounting $img to copy any existing workspace files needs root (loop mount). About to run sudo."
  if ! run_priv mount -o loop "$img" "$tmpmnt"; then
    say "loop mount of $img failed; the server will run without a disk cap."
    rmdir "$tmpmnt" 2>/dev/null || true
    return 0
  fi

  if [ -d "$ws" ] && dir_is_nonempty "$ws"; then
    say "copying existing files from $ws into the new image"
    if ! run_priv cp -a "$ws"/. "$tmpmnt"/; then
      say "copy into the image failed; unmounting and leaving $ws unchanged."
      run_priv umount "$tmpmnt" 2>/dev/null || true
      rmdir "$tmpmnt" 2>/dev/null || true
      return 1
    fi
  fi
  run_priv umount "$tmpmnt" || true
  rmdir "$tmpmnt" 2>/dev/null || true

  if [ -e "$ws" ]; then
    if dir_is_nonempty "$ws"; then
      # bak is a timestamped backup of the original workspace directory.
      bak="$sandbox/${WORKSPACE_DIR_NAME}.bak-$(date +%Y%m%d-%H%M%S)"
      say "renaming $ws to $bak (backup; nothing is deleted)"
      mv "$ws" "$bak" || die "cannot rename $ws to $bak"
    else
      rmdir "$ws" 2>/dev/null || mv "$ws" "$ws.empty-$$"
    fi
  fi
  mkdir -p "$ws" || die "cannot create mount point $ws"

  add_fstab_line "$FSTAB" "$img" "$ws" || true

  say "Mounting $img at $ws needs root (loop mount). About to run sudo."
  if ! run_priv mount -o loop "$img" "$ws"; then
    # Try mount by fstab if the line was added.
    if ! run_priv mount "$ws"; then
      say "mount of $ws failed. Your files are safe"
      if [ -d "${bak:-}" ]; then
        say "(backup at $bak)."
      else
        say "."
      fi
      return 1
    fi
  fi

  # owner and group are the installing user, who will run the server.
  owner=$(id -un)
  group=$(id -gn)
  say "Changing ownership of $ws to $owner:$group needs root after a loop mount. About to run sudo."
  run_priv chown -R "$owner:$group" "$ws" || say "chown of $ws failed; the server user may not be able to write."

  if [ ! -e "$ws/.git" ] && has_cmd git; then
    git init "$ws" >/dev/null 2>&1 && say "git init in mounted $ws" || true
  fi
  say "workspace size limit is on: $ws is a $WORKSPACE_SIZE loop mount"
  return 0
}

# -----------------------------------------------------------------------------
# Cron, Funnel, start
# -----------------------------------------------------------------------------

cron_command() {
  # Print the @reboot line for this install directory.
  # Arguments: destination dir.
  dest=$1
  printf '%s\n' "@reboot sleep $CRON_SLEEP && $dest/mcp.sh --bg >> $dest/mcp-boot.log 2>&1"
}

add_cron() {
  # Add an idempotent @reboot crontab line for DEST. No sudo (user crontab).
  # Arguments: destination dir.
  dest=$1
  if [ "$NO_CRON" -eq 1 ]; then
    say "skipping crontab (--no-cron)"
    return 0
  fi
  if ! has_cmd crontab; then
    say "crontab is not installed; skip autostart, or add this line by hand:"
    say "  $(cron_command "$dest")"
    return 0
  fi
  # existing is the current crontab, empty if the user has none.
  existing=$(crontab -l 2>/dev/null || true)
  if printf '%s\n' "$existing" | grep -F "$dest/mcp.sh --bg" >/dev/null 2>&1; then
    say "crontab already starts $dest/mcp.sh on boot"
    return 0
  fi
  # combined is the old crontab plus the new line, with a trailing newline.
  combined=$(printf '%s\n%s\n' "$existing" "$(cron_command "$dest")")
  if printf '%s' "$combined" | crontab -; then
    say "added @reboot crontab line for $dest/mcp.sh"
  else
    say "could not update crontab; add this line by hand:"
    say "  $(cron_command "$dest")"
    return 1
  fi
  return 0
}

setup_funnel() {
  # Point Tailscale Funnel at the local server if tailscale is installed.
  # Arguments: destination dir, port.
  dest=$1
  port=$2
  if [ "$NO_FUNNEL" -eq 1 ]; then
    say "skipping Funnel (--no-funnel)"
    return 0
  fi
  if ! has_cmd tailscale; then
    say "tailscale is not installed. To publish the server later:"
    say "  $dest/mcp.sh --funnel"
    say "or: tailscale funnel --bg --set-path /ai/mcp http://127.0.0.1:$port/mcp"
    return 0
  fi
  say "configuring Tailscale Funnel path /ai/mcp -> http://127.0.0.1:$port/mcp"
  if "$dest/mcp.sh" --funnel; then
    return 0
  fi
  say "Funnel setup failed; you can retry with: $dest/mcp.sh --funnel"
  return 0
}

choose_state_and_log() {
  # Set STATE_DIR and LOG_PATH to writable locations. Prefer /home/ai
  # when it can be created and written; otherwise use DEST (outside sandbox/).
  if mkdir -p "$DEFAULT_STATE_DIR" 2>/dev/null && [ -w "$DEFAULT_STATE_DIR" ]; then
    STATE_DIR="$DEFAULT_STATE_DIR"
    LOG_PATH="$DEFAULT_LOG"
  else
    STATE_DIR="$DEST"
    LOG_PATH="$DEST/mcp.log"
    say "/home/ai is not writable; using $STATE_DIR for mcp.pid / mcp.out and $LOG_PATH for the audit log."
  fi
}

start_server() {
  # Start the installed server in the background and print --status.
  # Arguments: destination dir.
  dest=$1
  if [ "$NO_START" -eq 1 ]; then
    say "skipping server start (--no-start). Start later with: $dest/mcp.sh --bg"
    return 0
  fi
  # mcp.sh reads STATE_DIR from mcp.conf when we wrote it; export as a backup.
  export MCP_STATE_DIR="${MCP_STATE_DIR:-$STATE_DIR}"
  say "starting the server"
  if ! "$dest/mcp.sh" --bg; then
    say "server did not start. Check: $dest/mcp.sh --logs"
    return 1
  fi
  "$dest/mcp.sh" --status || true
  # selftest is informative: a FAIL (for example a weak existing PIN or
  # a missing cron line) does not fail the install. Re-run it later with
  # $dest/mcp.sh --selftest.
  say "running self-test"
  if "$dest/mcp.sh" --selftest; then
    say "self-test passed"
  else
    say "self-test reported failures (the server is still running). Re-run: $dest/mcp.sh --selftest"
  fi
}

# -----------------------------------------------------------------------------
# Arguments
# -----------------------------------------------------------------------------

# Flag defaults (overwritten by parse_args). 0 = do the step, 1 = skip.
NO_CRON=0
NO_FUNNEL=0
NO_MOUNT=0
NO_IMAGE=1
NO_START=0
YES=0
# DEST, PORT, WORKSPACE_SIZE, FSTAB are set in parse_args.
DEST=""
PORT=""
WORKSPACE_SIZE=""
FSTAB=""

parse_args() {
  # Parse flags into the globals above.
  # Arguments: the script's "$@".
  DEST="${MCP_INSTALL_DIR:-${INSTALL_DIR:-$DEFAULT_DIR}}"
  PORT="${MCP_PORT:-$DEFAULT_PORT}"
  WORKSPACE_SIZE="${MCP_WORKSPACE_SIZE:-$DEFAULT_WORKSPACE_SIZE}"
  FSTAB="${MCP_FSTAB:-$DEFAULT_FSTAB}"
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help)
        print_help
        exit 0
        ;;
      --version)
        printf '%s
' "ai-mcp install.sh $VERSION"
        exit 0
        ;;
      --dir)
        [ $# -ge 2 ] || die "--dir needs a path"
        DEST=$2
        shift 2
        ;;
      --dir=*)
        DEST=${1#--dir=}
        shift
        ;;
      --port)
        [ $# -ge 2 ] || die "--port needs a value"
        PORT=$2
        shift 2
        ;;
      --port=*)
        PORT=${1#--port=}
        shift
        ;;
      --workspace-size)
        [ $# -ge 2 ] || die "--workspace-size needs a value"
        WORKSPACE_SIZE=$2
        shift 2
        ;;
      --workspace-size=*)
        WORKSPACE_SIZE=${1#--workspace-size=}
        shift
        ;;
      --fstab)
        [ $# -ge 2 ] || die "--fstab needs a path"
        FSTAB=$2
        shift 2
        ;;
      --fstab=*)
        FSTAB=${1#--fstab=}
        shift
        ;;
      --yes|-y)
        YES=1
        shift
        ;;
      --no-cron)
        NO_CRON=1
        shift
        ;;
      --no-funnel)
        NO_FUNNEL=1
        shift
        ;;
      --no-mount)
        NO_MOUNT=1
        shift
        ;;
      --no-image)
        NO_IMAGE=1
        shift
        ;;
      --no-start)
        NO_START=1
        shift
        ;;
      --)
        shift
        break
        ;;
      -*)
        die "unknown option: $1 (try --help)"
        ;;
      *)
        die "unexpected argument: $1 (try --help)"
        ;;
    esac
  done
  case "$PORT" in
    *[!0-9]*|"") die "port must be a positive integer (got $PORT)" ;;
  esac
  if path_has_space "$DEST"; then
    die "install directory must not contain spaces (got $DEST)"
  fi
}

ensure_dest() {
  # Create DEST, using sudo only if the parent is not writable, and say why.
  if [ -d "$DEST" ] && [ -w "$DEST" ]; then
    return 0
  fi
  if mkdir -p "$DEST" 2>/dev/null && [ -w "$DEST" ]; then
    return 0
  fi
  parent=$(dirname -- "$DEST")
  say "Creating $DEST needs root because $parent is not writable by $(id -un). About to run sudo."
  if ! can_mount && [ "$(id -u)" -ne 0 ]; then
    die "cannot create $DEST; pick a writable --dir or re-run with sudo available"
  fi
  run_priv mkdir -p "$DEST" || die "cannot create $DEST"
  run_priv chown "$(id -un):$(id -gn)" "$DEST" || die "cannot chown $DEST"
}

choose_pin() {
  # Print a PIN to stdout for a new mcp.conf. Uses --yes or a prompt.
  if [ "$YES" -eq 1 ]; then
    generate_pin
    return 0
  fi
  if [ -t 0 ]; then
    prompt_pin
    return 0
  fi
  die "stdin is not a terminal; re-run with --yes to generate a random PIN (it is written only to mcp.conf)"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

install_main() {
  # Run the full install with the parsed flags.
  # Arguments: the script's "$@".
  # SRC is the directory that contains this script and the server files.
  SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  parse_args "$@"
  # Resolve DEST to an absolute path once it exists (ensure_dest creates it).
  case "$DEST" in
    /*) ;;
    *) DEST=$(pwd)/$DEST ;;
  esac

  say "ai-mcp $VERSION install"
  say "source: $SRC"
  say "target: $DEST  port: $PORT  workspace image: $WORKSPACE_SIZE"

  check_python || die "python3 >= 3.8 is required"
  check_git || die "git is required"
  check_userns

  ensure_dest
  DEST=$(CDPATH= cd -- "$DEST" && pwd)
  if path_has_space "$DEST"; then
    die "install directory must not contain spaces (got $DEST)"
  fi

  copy_server_files "$SRC" "$DEST"
  ensure_sandbox "$DEST"
  choose_state_and_log

  # conf is the path of mcp.conf in the install directory.
  conf="$DEST/$CONF_FILENAME"
  if [ -f "$conf" ]; then
    say "keeping existing $conf (PIN and settings are unchanged)"
  else
    # pin is captured here and passed to write_new_conf only; not logged.
    pin=$(choose_pin) || exit 1
    if pin_is_weak "$pin"; then
      die "internal error: would have written a weak PIN"
    fi
    write_new_conf "$conf" "$pin" "$PORT" "$LOG_PATH" "$STATE_DIR" "$WORKSPACE_SIZE"
    # Forget the PIN in this shell as soon as the file is written.
    pin=""
    say "wrote $conf (mode $CONF_MODE). Open that file to view or change the PIN; it is not printed here."
  fi

  setup_workspace_image
  add_cron "$DEST"
  setup_funnel "$DEST" "$PORT"
  start_server "$DEST"
  say "done. Control the server with: $DEST/mcp.sh --status"
}

# If this file is executed (not sourced for tests), run main.
if [ "${MCP_INSTALL_LIB:-0}" != 1 ]; then
  install_main "$@"
fi
