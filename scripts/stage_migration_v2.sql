-- SPIRE Stage Migration v2
-- Run in Supabase SQL Editor BEFORE deploying the new app code.
-- Remaps all building stages from the old system to the new 13-stage system.
--
-- OLD STAGES:
--   NEW, ENROLLED, OUTREACH, GATEKEEPER, DM_FOUND, WARM, SIGNED, DECLINED
--   FLAGGED — NO CONTACTS, FLAGGED — WRONG OWNER, FLAGGED — WRONG COMPANY
--
-- NEW STAGES:
--   NO_CONTACTS, CONTACTS_IMPORTED, IN_SEQUENCE, NO_DM_RESPONSE,
--   GATEKEEPER, DM_IDENTIFIED, NOT_INTERESTED, WRONG_COMPANY,
--   PROPOSAL_SENT, NO_PROPOSAL_RESPONSE, MEETING_SCHEDULED, SIGNED, DECLINED

-- ── Step 1: Log what we're about to change (for audit) ──────────────────────

INSERT INTO stage_history (building_id, old_stage, new_stage, changed_by, notes)
SELECT
  building_id,
  stage AS old_stage,
  CASE
    -- Explicit flags → new equivalents
    WHEN stage = 'FLAGGED — NO CONTACTS'    THEN 'NO_CONTACTS'
    WHEN stage = 'FLAGGED — WRONG OWNER'    THEN 'WRONG_COMPANY'
    WHEN stage = 'FLAGGED — WRONG COMPANY'  THEN 'WRONG_COMPANY'

    -- Direct renames
    WHEN stage = 'ENROLLED'   THEN 'IN_SEQUENCE'
    WHEN stage = 'OUTREACH'   THEN 'IN_SEQUENCE'
    WHEN stage = 'DM_FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'DM-FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'WARM'       THEN 'DM_IDENTIFIED'
    WHEN stage = 'GATEKEEPER' THEN 'GATEKEEPER'
    WHEN stage = 'SIGNED'     THEN 'SIGNED'
    WHEN stage = 'DECLINED'   THEN 'DECLINED'

    -- NEW: split based on whether building has linked contacts
    WHEN stage = 'NEW' OR stage IS NULL THEN
      CASE
        WHEN EXISTS (
          SELECT 1 FROM building_contacts bc
          WHERE bc.building_name = buildings.building_name
          LIMIT 1
        ) THEN 'CONTACTS_IMPORTED'
        ELSE 'NO_CONTACTS'
      END

    -- Anything else → treat as NO_CONTACTS (safe fallback)
    ELSE 'NO_CONTACTS'
  END AS new_stage,
  'migration_v2' AS changed_by,
  'Automated stage migration: old system → new 13-stage system' AS notes
FROM buildings
WHERE stage IS DISTINCT FROM (
  -- Only log rows that will actually change
  CASE
    WHEN stage = 'FLAGGED — NO CONTACTS'    THEN 'NO_CONTACTS'
    WHEN stage = 'FLAGGED — WRONG OWNER'    THEN 'WRONG_COMPANY'
    WHEN stage = 'FLAGGED — WRONG COMPANY'  THEN 'WRONG_COMPANY'
    WHEN stage = 'ENROLLED'   THEN 'IN_SEQUENCE'
    WHEN stage = 'OUTREACH'   THEN 'IN_SEQUENCE'
    WHEN stage = 'DM_FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'DM-FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'WARM'       THEN 'DM_IDENTIFIED'
    WHEN stage = 'GATEKEEPER' THEN 'GATEKEEPER'
    WHEN stage = 'SIGNED'     THEN 'SIGNED'
    WHEN stage = 'DECLINED'   THEN 'DECLINED'
    WHEN stage = 'NEW' OR stage IS NULL THEN
      CASE
        WHEN EXISTS (SELECT 1 FROM building_contacts bc WHERE bc.building_name = buildings.building_name LIMIT 1)
        THEN 'CONTACTS_IMPORTED'
        ELSE 'NO_CONTACTS'
      END
    ELSE 'NO_CONTACTS'
  END
);

-- ── Step 2: Apply the stage remapping to buildings ───────────────────────────

UPDATE buildings SET stage =
  CASE
    WHEN stage = 'FLAGGED — NO CONTACTS'    THEN 'NO_CONTACTS'
    WHEN stage = 'FLAGGED — WRONG OWNER'    THEN 'WRONG_COMPANY'
    WHEN stage = 'FLAGGED — WRONG COMPANY'  THEN 'WRONG_COMPANY'
    WHEN stage = 'ENROLLED'   THEN 'IN_SEQUENCE'
    WHEN stage = 'OUTREACH'   THEN 'IN_SEQUENCE'
    WHEN stage = 'DM_FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'DM-FOUND'   THEN 'DM_IDENTIFIED'
    WHEN stage = 'WARM'       THEN 'DM_IDENTIFIED'
    WHEN stage = 'GATEKEEPER' THEN 'GATEKEEPER'
    WHEN stage = 'SIGNED'     THEN 'SIGNED'
    WHEN stage = 'DECLINED'   THEN 'DECLINED'
    WHEN stage = 'NEW' OR stage IS NULL THEN
      CASE
        WHEN EXISTS (
          SELECT 1 FROM building_contacts bc
          WHERE bc.building_name = buildings.building_name
          LIMIT 1
        ) THEN 'CONTACTS_IMPORTED'
        ELSE 'NO_CONTACTS'
      END
    ELSE 'NO_CONTACTS'
  END;

-- ── Step 3: Verify — show counts by new stage ────────────────────────────────

SELECT stage, COUNT(*) AS building_count
FROM buildings
GROUP BY stage
ORDER BY
  CASE stage
    WHEN 'NO_CONTACTS'          THEN 0
    WHEN 'CONTACTS_IMPORTED'    THEN 1
    WHEN 'IN_SEQUENCE'          THEN 2
    WHEN 'NO_DM_RESPONSE'       THEN 3
    WHEN 'GATEKEEPER'           THEN 4
    WHEN 'NOT_INTERESTED'       THEN 5
    WHEN 'WRONG_COMPANY'        THEN 6
    WHEN 'DM_IDENTIFIED'        THEN 7
    WHEN 'PROPOSAL_SENT'        THEN 8
    WHEN 'NO_PROPOSAL_RESPONSE' THEN 9
    WHEN 'MEETING_SCHEDULED'    THEN 10
    WHEN 'SIGNED'               THEN 11
    WHEN 'DECLINED'             THEN 12
    ELSE 99
  END;
