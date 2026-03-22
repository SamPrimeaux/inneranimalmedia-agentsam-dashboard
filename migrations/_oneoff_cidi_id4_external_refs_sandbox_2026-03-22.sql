-- Patch cidi id=4: Git branch + Git Builds sandbox worker URL (applied manually in D1 2026-03-22; file for audit / replay on clones).

UPDATE cidi SET
  external_references = 'https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard/tree/cursor/platform-ui-stability-1eca https://inneranimal-dashboard.meauxbility.workers.dev/',
  updated_at = datetime('now')
WHERE id = 4 AND workflow_id = 'CIDI-IAM-AGENTSAM-20260322';
