# Spire — AI Agent Instructions

**Spire** is Cloud9's internal pipeline CRM for the 20 Buildings campaign. Built with Preact + Vite + Supabase.

**Last updated:** April 8, 2026
**Status:** Phases 0–6 complete. Phase 7 (Polish + Deploy) is next.

---

## Run Locally

```bash
cd ~/Desktop/spire
npm run dev
# http://localhost:5173 (or 5174 if port in use)
```

---

## Project Structure

```
spire/
  src/
    views/          # Buildings, Contacts, Companies, Overview, Import, Outreach
    components/     # AiModal, StageBadge, MarketChips, Toast, TopBar, TabNav
    store/          # supabase.js, data.js (signals), actions.js
    lib/            # derive.js, format.js
    styles/         # global.css (glassmorphism design system)
  supabase/
    functions/
      generate-proposal/index.ts   # Claude claude-opus-4-6 — 5-section revenue one-pager
      generate-email/index.ts      # Claude claude-sonnet-4-6 — cold/follow-up/warm email
      hubspot-sync/                # Placeholder — HubSpot daily sync (Phase 5, not deployed)
    migrations/
      20260408_email_replies.sql   # email_replies table
```

---

## Supabase

**Project:** `gapfldixgqpmlzwijftm`
**URL:** `https://gapfldixgqpmlzwijftm.supabase.co`
**Anon key** (in `.env` as `VITE_SUPABASE_ANON_KEY`): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Tables:**
| Table | Rows | Notes |
|---|---|---|
| `buildings` | 248 | CHI-001, HOU-001, DAL-001 format IDs |
| `contacts` | 3,973 | C00001 format IDs |
| `building_contacts` | 4,930 | Junction table (building_name + contact_email) |
| `touch_log` | 0 | Written by Log Touch modal |
| `stage_history` | 0 | Written by stage changes |
| `email_replies` | 0 | Populated by HubSpot sync |
| `import_log` | 0 | Apollo CSV import records |
| `sync_log` | 0 | HubSpot sync run records |

**Edge Functions deployed:**
- `generate-proposal` — POST `{building_id, contact_id?}` → `{success, output, building_name}`
- `generate-email` — POST `{contact_id, phase, context?}` → `{success, subject, body, contact_name, building_name}`

**Secrets set (do not add to .env):**
- `ANTHROPIC_API_KEY`
- `HUBSPOT_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

**To redeploy Edge Functions:**
```bash
SUPABASE_ACCESS_TOKEN=sbp_30c98175443b735ca723372c6eb1d2c113506796 npx supabase functions deploy generate-proposal
SUPABASE_ACCESS_TOKEN=sbp_30c98175443b735ca723372c6eb1d2c113506796 npx supabase functions deploy generate-email
```

---

## AI Features (Phase 6)

Three buttons wire to Edge Functions via `supabase.functions.invoke()`:

| Button | File | Condition | Calls |
|---|---|---|---|
| Generate Proposal | Buildings.jsx:detail panel | Blocked for FLAGGED/DECLINED | `generate-proposal` |
| Draft Email | Contacts.jsx:detail panel | Blocked for Hard No/Unsub/Wrong Contact | `generate-email` |
| Draft Outreach | Companies.jsx:accordion | Always available | `generate-email` (best contact by tier) |

**AiModal** (`src/components/AiModal.jsx`) handles all three:
- Loading: spinner, backdrop locked
- Error: human-readable message + Retry button
- Success: editable textarea (subject field for emails) + Copy to clipboard + Regenerate

---

## Design System

- Background: `linear-gradient(135deg, #f0f4ff 0%, #fafbff 50%, #f4f0ff 100%)`
- Glass card: `background: rgba(255,255,255,0.65)` + `backdrop-filter: blur(20px)`
- Font: Inter (400/500/600/700)
- `--accent: #4f7cff` | `--success: #10b981` | `--warning: #f59e0b` | `--danger: #ef4444`

---

## Campaign Context

**Goal:** Sign 20 Class-A multifamily buildings into Cloud9 RevShare by end of 2026.
**Markets:** Chicago · Houston · Dallas
**ICP source of truth:** Jeffrey Hreben interview (Feb 26, 2026)
  `2_AREAS/creative-production/COPY-FULL-SYSTEM/research/Interview_Jeffrey/jeffrey-hreben-interview-transcript-feb26.md`

**Canonical project docs:** `1_PROJECTS/SPIRE/` on Google Drive (CLAUDE.md, SPIRE-BUILD-PLAN.md, SPIRE-DATA-CONTEXT.md)

---

## What's Next (Phase 7 — Polish + Deploy)

- Loading states + empty states audit
- Keyboard shortcuts (Ctrl+K search, Escape close panel)
- Deploy to Netlify (add `netlify.toml`, push to GitHub)
- HubSpot sync Edge Function (currently empty placeholder)
