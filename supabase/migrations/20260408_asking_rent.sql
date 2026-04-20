-- Add asking_rent_monthly to buildings table
-- Run this against Supabase project: gapfldixgqpmlzwijftm
--
-- After running, populate using ApartmentIQ data for Houston/Dallas:
--   UPDATE buildings SET asking_rent_monthly = <value> WHERE building_id = '<id>';
-- Or bulk-update via the update-asking-rent script in scripts/

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asking_rent_monthly NUMERIC;

COMMENT ON COLUMN buildings.asking_rent_monthly IS
  'Asking rent per month in USD (e.g. 4500 = $4,500/mo). Used for proposal revenue math. If NULL, generate-proposal uses city-based fallback estimates labeled (est.).';
