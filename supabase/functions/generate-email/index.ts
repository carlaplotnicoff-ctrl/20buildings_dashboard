import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are writing a sales email for Cloud9, a RevShare program for Class-A multifamily buildings. The recipient is an asset manager, property owner, or C-suite executive who controls leasing decisions.

VOICE (from ICP research — Jeffrey Hreben, Sr Development Manager, Tandem):
- Asset managers are data-driven underwriters. They speak in pro formas, not feelings.
- They are protective of their residents and wary of operators who bring in transient guests.
- The word "Airbnb" or "short-term rental" triggers immediate rejection. Never use these.
- They want to see: the math, the guarantee structure, the exit clause, and proof (Linea).
- They distrust vague promises. Every claim needs a number or a named reference.
- Be direct. Short paragraphs. No fluff. No exclamation points.
- They've heard pitches before. Don't sound like a pitch. Sound like a peer.
- Never begin the email with "I". Open with the building name, a data point, or the prospect's situation. Starting with "I" signals the email is about you, not them.

FORBIDDEN — will disqualify the email instantly:
- "Airbnb", "short-term rental", "STR", "vacation rental", "furnished rental"
- "excited to", "thrilled to", "I'd love to"
- "innovative", "disrupting", "game-changing", "revolutionary"
- "owner gets 70%" — always frame as "Cloud9 takes 30%"
- Em dashes (—) — use commas or colons instead
- Exclamation marks

REQUIRED FRAMING:
- Cloud9 takes 30% of revenue generated — only after the guaranteed floor is met
- The floor = market rent on enrolled units, guaranteed for Year 1 annually
- Proof: Linea 2025 — $61,000 to $111,000 per unit per year, 82% more income
- Exit: 30 days written notice, no penalties, keeps all revenue earned
- Pilot: 3 units, subject to lender and policy review

SUBJECT LINE FORMULAS by phase:
- cold:      "[Building Name] — large unit revenue" or "3 units at [Building Name]"
- follow-up: "Re: [Building Name]" or "[First Name] — following up on [Building Name]"
- warm:      Keep it conversational, reply-thread style. No subject tricks.

EMAIL LENGTH by phase:
- cold:       5 to 7 sentences. Prove the concept exists. Earn a response. Do not over-explain.
- follow-up:  3 to 4 sentences. One new data point or hook. One clear ask. Nothing else.
- warm:       Match the energy of their reply. Answer their question directly. No padding.

OUTPUT FORMAT:
Return a valid JSON object with exactly two fields: "subject" and "body".
The body must be plain text. No markdown, no bold, no bullets. Use line breaks between paragraphs.
Example format: {"subject": "...", "body": "...\n\n..."}`;

function buildPrompt(
  contact: Record<string, unknown>,
  building: Record<string, unknown> | null,
  phase: string,
  latestReply: Record<string, unknown> | null,
  context?: string
): string {
  const lines = [
    `Contact: ${contact.first_name} ${contact.last_name}`,
    `Title: ${contact.job_title || 'unknown'}`,
    `Company: ${contact.company || 'unknown'}`,
    `Priority tier: ${contact.tier || 'unknown'}`,
    `Market: ${contact.market || 'unknown'}`,
    '',
    `Building: ${building?.building_name || 'unknown'}`,
    `Total units: ${building?.total_units || 'unknown'}`,
    `Pain point: ${building?.pain_point || 'unknown'}`,
    `Concessions: ${building?.concessions || 'none on record'}`,
    `Pipeline stage: ${building?.stage || 'unknown'}`,
    '',
    `Email phase: ${phase}`,
    `HubSpot enrolled: ${contact.hs_enrolled ? 'yes' : 'no'}`,
    `Opened a previous email: ${contact.hs_opened ? 'yes' : 'no'}`,
    `Has replied previously: ${contact.hs_replied ? 'yes' : 'no'}`,
  ];

  if (latestReply) {
    lines.push('');
    lines.push(`Most recent reply from this contact (${latestReply.received_at}):`);
    if (latestReply.subject) lines.push(`  Subject: ${latestReply.subject}`);
    if (latestReply.body_preview) lines.push(`  Message preview: ${latestReply.body_preview}`);
  }

  if (context) {
    lines.push('');
    lines.push(`Additional context: ${context}`);
  }

  lines.push('');
  lines.push(`Write the ${phase} email for this contact. Return only the JSON object with "subject" and "body" fields. Plain text body only.`);

  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contact_id, phase, context } = await req.json();

    if (!contact_id || !phase) {
      return Response.json(
        { success: false, error: 'contact_id and phase are required', code: 'MISSING_DATA' },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: contact, error: cErr } = await supabase
      .from('contacts')
      .select('contact_id, first_name, last_name, job_title, company, email, tier, market, hs_enrolled, hs_opened, hs_replied, hs_last_replied')
      .eq('contact_id', contact_id)
      .single();

    if (cErr || !contact) {
      return Response.json(
        { success: false, error: 'Contact not found', code: 'CONTACT_NOT_FOUND' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get linked building via building_contacts junction
    let building = null;
    if (contact.email) {
      const { data: bc } = await supabase
        .from('building_contacts')
        .select('building_name')
        .eq('contact_email', contact.email)
        .limit(1)
        .single();

      if (bc?.building_name) {
        const { data: b } = await supabase
          .from('buildings')
          .select('building_name, market, total_units, pain_point, concessions, stage')
          .eq('building_name', bc.building_name)
          .single();
        building = b;
      }
    }

    // Get latest reply for warm/follow-up context (graceful if table missing)
    let latestReply = null;
    if (contact.email && (phase === 'warm' || phase === 'follow-up')) {
      try {
        const { data: reply } = await supabase
          .from('email_replies')
          .select('subject, body_preview, received_at')
          .eq('contact_email', contact.email)
          .order('received_at', { ascending: false })
          .limit(1)
          .single();
        latestReply = reply;
      } catch {
        // email_replies table may not exist yet — proceed without it
      }
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return Response.json(
        { success: false, error: 'AI service not configured. Ask your admin to set the ANTHROPIC_API_KEY secret.', code: 'AI_ERROR' },
        { status: 503, headers: corsHeaders }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(contact, building, phase, latestReply, context) }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return Response.json(
        { success: false, error: 'AI generation failed. Try again in a moment.', code: 'AI_ERROR' },
        { status: 502, headers: corsHeaders }
      );
    }

    const aiData = await response.json();
    const rawText = aiData.content?.[0]?.text ?? '{}';

    // Parse the JSON the model returned
    let parsed: { subject?: string; body?: string } = {};
    try {
      // Strip any markdown code fences the model might wrap around the JSON
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, '')   // leading ```json or ``` with optional whitespace
        .replace(/\s*```\s*$/, '')           // trailing ``` with optional whitespace
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parsing still fails, try extracting subject/body with regex
      const subjectMatch = rawText.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = rawText.match(/"body"\s*:\s*"([\s\S]+?)(?:"\s*[}\n]|",\s*")/);
      if (subjectMatch || bodyMatch) {
        parsed = {
          subject: subjectMatch?.[1] ?? `Cloud9 — ${building?.building_name || contact.company}`,
          body: bodyMatch?.[1]?.replace(/\\n/g, '\n').replace(/\\"/g, '"') ?? rawText,
        };
      } else {
        // Last resort: treat whole text as the body
        parsed = { subject: `Cloud9 — ${building?.building_name || contact.company}`, body: rawText };
      }
    }

    return Response.json({
      success: true,
      subject: parsed.subject ?? '',
      body: parsed.body ?? '',
      contact_name: `${contact.first_name} ${contact.last_name}`,
      building_name: building?.building_name ?? '',
      generated_at: new Date().toISOString(),
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('generate-email unhandled error:', err);
    return Response.json(
      { success: false, error: 'Unexpected error. Try again.', code: 'AI_ERROR' },
      { status: 500, headers: corsHeaders }
    );
  }
});
