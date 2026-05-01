# `cad/creations/`

Matches R2: `cad/creations/{tenant_id}/{workspace_id}/{workflow_run_id}/`.

Per-run folder holds blueprint sidecars, OpenSCAD source, mesh exports, preview image, and `metadata.json`. Do not commit large `*.glb` / `*.stl` here unless using LFS; use `scripts/designstudio/` plus R2 upload for real outputs.
