# `cad/` — local mirror of R2 CAD layout

This directory **documents and optionally holds** the same logical paths as Cloudflare R2. **R2 is the source of truth** for shipped artifacts; this tree is for local pipeline development, fixtures, and CI checkouts.

## R2 canonical prefix

```text
cad/creations/{tenant_id}/{workspace_id}/{workflow_run_id}/
  blueprint.json
  sketch.json
  model.scad
  model.stl
  model.glb
  preview.png
  metadata.json
```

## Repo vs bucket

| Location | Role |
|----------|------|
| `cad/creations/` (this repo) | README + optional tiny fixtures; large binaries stay out of git or use Git LFS per team policy. |
| R2 bucket (Worker binding TBD per env) | Production artifacts; keys match the prefix above. |

## Related

- Sync to Supabase analytics: `src/api/designstudio/sync.js` (`syncRunToSupabase`).
- Internal trigger (after D1 run + R2 keys): `POST /api/internal/designstudio/sync-run` with `INTERNAL_API_SECRET`.
