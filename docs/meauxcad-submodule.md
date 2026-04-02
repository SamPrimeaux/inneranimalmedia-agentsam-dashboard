# MeauxCAD in this monorepo

The [meauxcad](https://github.com/SamPrimeaux/meauxcad) app is included as a **git submodule** at `meauxcad/` (see `.gitmodules`).

## Clone with submodule

```bash
git clone --recurse-submodules https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard.git
cd inneranimalmedia-agentsam-dashboard
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Pull upstream MeauxCAD changes

```bash
cd meauxcad && git fetch origin && git checkout main && git pull
cd .. && git add meauxcad && git commit -m "chore: bump meauxcad submodule"
```

## CI / Workers Builds

Point build commands at `meauxcad/` when building the AITestSuite / lab worker (e.g. `cd meauxcad && npm ci && npm run build`). The standalone repo remains the canonical remote; this submodule tracks a pinned commit until you bump it.

## Related

- [`docs/AITESTSUITE_IAM_STACK_INTEGRATION.md`](AITESTSUITE_IAM_STACK_INTEGRATION.md) — lab worker vs sandbox vs prod
- Stub folder `aitestsuite/` (minimal wrangler placeholder) is **not** the full MeauxCAD tree; use **`meauxcad/`** for the real source.
