# Apply asking_rent_monthly Migration

## Step 1 — Add column via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/gapfldixgqpmlzwijftm/sql/new
2. Paste and run:

```sql
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS asking_rent_monthly NUMERIC;

COMMENT ON COLUMN buildings.asking_rent_monthly IS
  'Asking rent per month in USD. Used for proposal revenue math. If NULL, generate-proposal uses city-based fallback estimates labeled (est.).';
```

## Step 2 — Redeploy updated Edge Functions

```bash
cd ~/Desktop/spire
SUPABASE_ACCESS_TOKEN=<your_token> npx supabase functions deploy generate-proposal
SUPABASE_ACCESS_TOKEN=<your_token> npx supabase functions deploy generate-email
```

Get your access token: https://supabase.com/dashboard/account/tokens

## Step 3 — Populate asking_rent_monthly

Run this in the Supabase SQL editor after pulling the latest ApartmentIQ data.
Houston and Dallas buildings have rent data in their source Google Sheets.

Example format (get values from ApartmentIQ or source sheets):
```sql
UPDATE buildings SET asking_rent_monthly = 4200 WHERE building_id = 'HOU-001';
UPDATE buildings SET asking_rent_monthly = 3800 WHERE building_id = 'DAL-001';
-- ... etc
```

Or use the bulk update approach:
```sql
UPDATE buildings SET asking_rent_monthly = CASE building_id
  WHEN 'HOU-001' THEN 4200
  WHEN 'HOU-002' THEN 3950
  -- add all buildings
  ELSE NULL
END
WHERE asking_rent_monthly IS NULL;
```

## Step 4 — Run HubSpot Sync

```bash
cd ~/Desktop/spire
node scripts/hubspot-sync.mjs
```

This updates hs_enrolled, hs_opened, hs_replied flags for all contacts and logs to sync_log.
