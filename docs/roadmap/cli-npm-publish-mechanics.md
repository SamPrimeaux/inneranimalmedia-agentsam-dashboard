---
title: "@inneranimal/cli npm publishing mechanics"
category: roadmap
updated: "2026-04-02"
importance: 7
---

# @inneranimal/cli — npm publishing mechanics

Canonical runbook for `plan_inner_cli_worker_api_v1` / step `step_inner_cli_npm_publish`. Keep this file in git; D1 stores only a short pointer to avoid bloating the database. **R2 mirror:** `autorag/plans/executed/cli-npm-publish-mechanics.md`.

## Option 1: Scoped public package (recommended)

The package name `@inneranimal/cli` is **scoped**. It is published to the **public** npm registry; only maintainers with publish rights can push updates.

### Setup

1. Create an npm account if needed: https://www.npmjs.com/signup
2. Login locally:

```bash
npm login
# Username, password, email — creates ~/.npmrc with auth token
```

3. In the CLI package folder, `package.json` should include at least:

```json
{
  "name": "@inneranimal/cli",
  "version": "1.0.0",
  "description": "CLI for Agent Sam",
  "type": "module",
  "bin": {
    "cli": "./bin/cli.mjs"
  },
  "files": ["bin", "src", "README.md"],
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard"
  },
  "engines": {
    "node": ">=18"
  }
}
```

4. Publish (from the package directory):

```bash
cd path/to/@inneranimal/cli
npm publish
```

Package URL: `https://www.npmjs.com/package/@inneranimal/cli`

Install for anyone:

```bash
npx @inneranimal/cli status
# or
npm install -g @inneranimal/cli
cli status
```

## Option 2: Private scoped package

- Requires npm Pro (or org) for private scoped packages.
- Set `"publishConfig": { "access": "restricted" }`.
- Consumers need an npm token in `~/.npmrc`; package is not listed in public search.

Prefer **public** if there is no secret in the package; distribution is simpler.

## Versioning and CI (GitHub Actions)

Avoid manual `npm publish` long-term. Typical pattern:

1. Workflow file (example): `.github/workflows/publish-cli.yml` triggered on tags like `cli@*`.
2. Repository secret `NPM_TOKEN` — automation token from https://www.npmjs.com/settings/~/tokens
3. Bump version, tag, push:

```bash
cd path/to/@inneranimal/cli
npm version patch   # or minor / major
git push origin main --follow-tags
```

Example workflow shape:

```yaml
name: Publish CLI
on:
  push:
    tags:
      - 'cli@*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: |
          cd ./packages/cli
          npm ci
          npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Adjust `cd` path to match the repo layout.

## PTY / Agent Sam terminal

No special wiring. After publish:

```bash
npx @inneranimal/cli status
```

The shell runs `npx`, npm resolves `@inneranimal/cli`, executes `bin/cli.mjs`, which reads `~/.inneranimal/config.json` and calls Worker `https://inneranimalmedia.com/api/...`. Output is normal stdout; xterm.js only displays the stream.

## Monorepo (optional)

Root `package.json` can use `workspaces` so `npm ci` installs dashboard + CLI together, and CI publishes only the CLI workspace when tagged.

## Checklist

- [ ] `npm login` on a maintainer machine
- [ ] `package.json` with `bin`, `publishConfig.access`, `engines`
- [ ] Local test: `npm link` then `cli` / `node bin/cli.mjs`
- [ ] GitHub secret `NPM_TOKEN`
- [ ] Workflow on tag `cli@*`
- [ ] `npm version` + `git push --follow-tags`
- [ ] Confirm Action success
- [ ] Verify https://www.npmjs.com/package/@inneranimal/cli
- [ ] Smoke: `npx @inneranimal/cli status` (and from dashboard PTY)
