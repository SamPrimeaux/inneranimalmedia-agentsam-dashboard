#!/usr/bin/env bash
# Install terminal server under ~/.local so launchd can run it (macOS blocks running from Downloads).
# Run from repo root: ./server/install-terminal-server-service.sh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_SRC="$REPO_ROOT/server"
INSTALL_DIR="$HOME/.local/iam-terminal-server"
PLIST_SRC="$REPO_ROOT/docs/com.inneranimalmedia.terminal-server.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist"

echo "Installing terminal server to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
cp "$SERVER_SRC/terminal.js" "$SERVER_SRC/package.json" "$SERVER_SRC/run-terminal-server.sh" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/run-terminal-server.sh"
(cd "$INSTALL_DIR" && npm install --omit=dev)

echo "Installing LaunchAgent plist ..."
cp "$PLIST_SRC" "$PLIST_DEST"
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Done. Ensure ~/.terminal-server.env exists with TERMINAL_SECRET and PORT=3099."
echo "Check: launchctl list | grep terminal-server"
echo "Logs: tail -f $HOME/Library/Logs/terminal-server.out.log"
