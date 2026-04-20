-- SPIRE Stage Normalization — Run AFTER migration.sql
-- Maps current stage values to the new 10-stage model

-- 1. Chicago: all empty → NEW
UPDATE buildings SET stage = 'NEW' WHERE (stage IS NULL OR stage = '') AND market = 'Chicago';

-- 2. Direct mappings
UPDATE buildings SET stage = 'ENROLLED' WHERE stage = 'ENROLLED';
UPDATE buildings SET stage = 'GATEKEEPER' WHERE stage = 'GATEKEEPER';
UPDATE buildings SET stage = 'DM_FOUND' WHERE stage = 'DM-FOUND';
UPDATE buildings SET stage = 'DECLINED' WHERE stage IN ('DNC', 'Declined');

-- 3. FLAGGED → split by notes content
UPDATE buildings SET stage = 'FLAGGED — WRONG OWNER'
  WHERE stage = 'FLAGGED' AND (
    notes ILIKE '%sold%' OR notes ILIKE '%stale%' OR notes ILIKE '%no longer own%'
    OR notes ILIKE '%wrong owner%' OR notes ILIKE '%changed owner%'
  );

UPDATE buildings SET stage = 'FLAGGED — NO CONTACTS'
  WHERE stage = 'FLAGGED' AND stage != 'FLAGGED — WRONG OWNER';

-- 4. Active engagement → mapped stages
UPDATE buildings SET stage = 'WARM' WHERE stage IN ('WAITING ON REFERRAL', 'Referral pending', 'MUST-RESPOND');
UPDATE buildings SET stage = 'OUTREACH' WHERE stage IN ('PHASE 2 SENT', 'ALREADY-CONTACTED');
UPDATE buildings SET stage = 'NEW' WHERE stage = 'APOLLO-READY';

-- 5. Auto-flag buildings with 0 contacts
UPDATE buildings SET stage = 'FLAGGED — NO CONTACTS'
  WHERE building_name NOT IN (SELECT DISTINCT building_name FROM building_contacts)
  AND stage = 'NEW';

-- 6. Log all normalizations to stage_history
INSERT INTO stage_history (building_id, old_stage, new_stage, changed_by, notes)
SELECT building_id, 'pre-normalization', stage, 'migration', 'Stage normalization on Spire launch'
FROM buildings
WHERE stage IS NOT NULL;

-- Summary check
SELECT stage, COUNT(*) as count FROM buildings GROUP BY stage ORDER BY count DESC;
