# Public homepage (index-v3)

Source for the live homepage at https://inneranimalmedia.com/ .

- **R2 bucket:** `inneranimalmedia-assets`
- **R2 key:** `index-v3.html`
- **Worker:** Serves this file for `/` and `/index.html` (see `worker.js` PUBLIC_ROUTES and root block).

## Download from R2 (production)

```bash
cd /path/to/march1st-inneranimalmedia
[[ -f .env.cloudflare ]] && set -a && source .env.cloudflare && set +a
./scripts/with-cloudflare-env.sh npx wrangler r2 object get inneranimalmedia-assets/index-v3.html --remote --file=public-homepage/index-v3.html -c wrangler.production.toml
```

## Upload to R2 (publish changes)

After editing `index-v3.html` locally:

```bash
cd /path/to/march1st-inneranimalmedia
[[ -f .env.cloudflare ]] && set -a && source .env.cloudflare && set +a
./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia-assets/index-v3.html --file=public-homepage/index-v3.html --content-type=text/html --remote -c wrangler.production.toml
```

No worker deploy needed for homepage-only changes; the worker already serves `index-v3.html` from ASSETS.

## Nav routing

Nav and footer links use path-based routes (not hash routes):

- Home: `/`
- Work: `/work` (serves `process.html` via PUBLIC_ROUTES)
- About: `/about` (serves `about.html`)
- Services: `/services` (serves `pricing.html`)
- Contact: `/contact` (serves `contact.html`)

Ensure those keys exist in the `inneranimalmedia-assets` bucket for the links to work.
