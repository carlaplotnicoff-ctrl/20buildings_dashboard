CREATE TABLE IF NOT EXISTS email_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_email TEXT NOT NULL,
  building_name TEXT,
  subject TEXT,
  body_preview TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  hs_engagement_id TEXT UNIQUE,
  received_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_replies_contact ON email_replies(contact_email);
CREATE INDEX IF NOT EXISTS idx_email_replies_received ON email_replies(received_at DESC);
