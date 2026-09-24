#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
# Never source backend .env values as shell commands or embed backend secrets.
exec node "$SCRIPT_DIR/generate-release-config.mjs" "$@"
