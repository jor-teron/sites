#!/bin/sh
# Convenience entry point; the Python module is the canonical CLI.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"
exec python3 -m rag "$@"
