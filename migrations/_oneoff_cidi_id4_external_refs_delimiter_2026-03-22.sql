-- Delimit two URLs in cidi.external_references for id=4 (parse-friendly for UI).

UPDATE cidi SET
  external_references = 'https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard/tree/cursor/platform-ui-stability-1eca | https://inneranimal-dashboard.meauxbility.workers.dev/',
  updated_at = datetime('now')
WHERE id = 4 AND workflow_id = 'CIDI-IAM-AGENTSAM-20260322';
