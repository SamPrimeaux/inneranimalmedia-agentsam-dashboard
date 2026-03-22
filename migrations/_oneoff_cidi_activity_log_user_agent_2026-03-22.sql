-- Patch: set user_agent on IAM CIDI activity row (Composer 2 / Agent Sam).
-- Row id 11 from _oneoff_cidi_activity_log_iam_2026-03-22.sql (cidi_id=4).

UPDATE cidi_activity_log
SET user_agent = 'composer2_agentsam'
WHERE id = 11 AND cidi_id = 4;
