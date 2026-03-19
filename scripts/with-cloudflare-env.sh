#!/usr/bin/env bash
# Load Cloudflare env from a gitignored file and run a command.
# Usage: ./scripts/with-cloudflare-env.sh <command...>
# Example: ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=./dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml
#
# Create .env.cloudflare from .env.cloudflare.example and add:
#   CLOUDFLARE_ACCOUNT_ID=...
#   CLOUDFLARE_API_TOKEN=...
# .env.cloudflare is in .gitignore — never commit it.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
  else
    # Fallback: use ~/.zshrc (where many people put CLOUDFLARE_* for wrangler)
    if [[ -f "$HOME/.zshrc" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$HOME/.zshrc"
      set +a
    fi
  fi
}

load_env

if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  echo "CLOUDFLARE_API_TOKEN not set." >&2
  echo "  Set it in ~/.zshrc (export CLOUDFLARE_API_TOKEN=...) or create .env.cloudflare from .env.cloudflare.example" >&2
  exit 1
fi

exec "$@"
