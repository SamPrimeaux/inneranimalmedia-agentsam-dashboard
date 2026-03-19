#!/usr/bin/env bash
# Wrapper for terminal server: load env from file, then run node.
# Used by launchd so the secret isn't in the plist.
# Create ~/.terminal-server.env with:
#   TERMINAL_SECRET=your-secret
#   PORT=3099
set -e
cd "$(dirname "$0")"
if [[ -f "$HOME/.terminal-server.env" ]]; then
  set -a
  source "$HOME/.terminal-server.env"
  set +a
fi
exec node terminal.js
