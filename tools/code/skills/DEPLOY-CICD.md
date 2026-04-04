# CI/CD deploy (canonical)

```bash
cd agent-dashboard && npm run build:vite-only && cd ..
./scripts/deploy-sandbox.sh
./scripts/benchmark-full.sh sandbox   # gate
# Sam: ./scripts/promote-to-prod.sh
./scripts/benchmark-full.sh prod
curl -s https://inneranimalmedia.com/dashboard/agent | grep -o 'v=[0-9]*' | head -1
```

Sandbox worker name: `inneranimal-dashboard` on `meauxbility.workers.dev`. Prod: `inneranimalmedia` via `wrangler.production.toml`. Cursor agents do not run `wrangler deploy` to prod without Sam’s **deploy approved** flow.
