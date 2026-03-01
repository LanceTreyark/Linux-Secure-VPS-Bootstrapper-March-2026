#!/bin/bash
#
# Platform Installer — Bootstrap Script
#
# This is a wrapper that launches the Node.js interactive installer.
# Run with: sudo platforms (alias set up by start.sh)
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "Please run this installer as root (use sudo)."
  exit 1
fi

# Launch the Node.js interactive installer
node "$SCRIPT_DIR/installer.mjs"