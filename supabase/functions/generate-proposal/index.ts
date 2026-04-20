import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are generating a Cloud9 revenue analysis one-pager for a Class-A multifamily building. This document will be sent to an asset manager or property owner to propose a RevShare pilot.

HARD RULES — violating any of these is a failure:
1. NEVER say "owner gets 70%" or "owner receives 70%". Always frame as "Cloud9 takes 30%".
2. The ONLY external proof numbers are: $61,000 → $111,000 per unit annually, +82% (from Linea, 2025 actuals). Never use internal NER numbers.
3. Other buildings (Parkline, Aurelien, K2) are casual name-drops only — no revenue figures for them.
4. Revenue remittance is ANNUAL. Never say "monthly payments".
5. Projections use market rent as baseline (never NER/net effective rent).
6. Projection range: market rent × 1.5x (conservative) to × 2.0x (Chicago-comparable). Cloud9 takes 30% of gross.
7. The guarantee is Year 1 annual. Never say "90-day pilot" or "12-month pilot".
8. No em dashes (—). Use commas, periods, or colons.
9. No exclamation marks.
10. Building name must appear in every section.
11. NEVER say "Airbnb", "short-term rental", "STR", or "vacation rental". The program is a "corporate residence program" or "furnished corporate rental". Asset managers reject anything that sounds like short-term hospitality.

REVENUE MATH:
  Market rent annual = asking_rent_monthly × 12
  Conservative gross = market rent annual × 1.5
  Aggressive gross   = market rent annual × 2.0
  Cloud9 fee         = gross × 0.30  (Cloud9 takes 30%, always frame this way)
  Owner distribution = gross × 0.70
  Upside             = owner distribution − market rent annual

If exact rent data is not provided, use reasonable Class-A market estimates based on the city:
  Chicago 2BR: $4,500/month  |  Houston 2BR: $3,800/month  |  Dallas 2BR: $3,500/month
  Chicago 3BR: $7,500/month  |  Houston 3BR: $6,200/month  |  Dallas 3BR: $5,800/month
Always label estimated numbers as "(est.)" when rent data is missing.

DOCUMENT STRUCTURE — output exactly these 5 sections with these exact headers:
## PAGE 1 — EXECUTIVE SUMMARY
## PAGE 2 — ABOUT CLOUD9 + LINEA EXAMPLE
## PAGE 3 — BUILDING ANALYSIS
## PAGE 4 — PILOT STRUCTURE AND GUARANTEE
## PAGE 5 — NEXT STEPS

Cloud9 credentials: 9 years in business, Chicago since 2017, 13 buildings, 58 units, zero removal incidents, 13% screened out in 2024, 8% in 2025. Other buildings: Parkline, Linea, Aurelien, K2.
Footer on every page: Cloud9 | 9 Years. 13 Buildings. 58 Units. | Chicago Class-A
Signature block (Page 5): Marcus Halawi, CEO — marcushalawi@thecloud9team.com
P.S. on Page 5 is mandatory. Lead with: "$61,000 to $111,000 per unit annually. 82% more income."
Pilot scope: 3 units, owner selects, subject to lender and policy review. Exit: 30 days written notice, no penalties, keeps all revenue earned.
Guarantee: Cloud9 guarantees market rent on enrolled units for Year 1. If Cloud9 misses it, we work for free until you reach 100%. Cloud9 takes 30% only after the guaranteed floor is met.`;

function buildPrompt(building: Record<string, unknown>, contact: Record<string, unknown> | null): string {
  const rentLine = building.asking_rent_monthly
    ? `Asking rent: $${building.asking_rent_monthly}/month (use this for all revenue calculations — do NOT mark as estimated)`
    : `Asking rent: not on file — use city-based estimate from the fallback table and label all revenue figures as (est.)`;

  const lines = [
    `Building: ${building.building_name}`,
    `Market: ${building.market}`,
    `Address: ${building.address || 'not provided'}`,
    `Total units: ${building.total_units || 'unknown'}`,
    `Owner: ${building.owner_1 || 'unknown'}`,
    `Management company: ${building.management_company || 'unknown'}`,
    `Pain point score: ${building.pain_point || 'unknown'}`,
    `Concessions: ${building.concessions || 'none listed — assume standard market terms'}`,
    `Pipeline stage: ${building.stage || 'unknown'}`,
    rentLine,
  ];

  if (contact) {
    lines.push(`Prepared for: ${contact.first_name} ${contact.last_name}, ${contact.job_title} at ${contact.company}`);
  }

  lines.push('');
  lines.push('Generate the full 5-section revenue analysis one-pager for this building. Use the actual data above. Where data is missing, use city-based estimates and label them as (est.). Keep the tone IC-grade professional — factual, no hype, no fluff.');

  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { building_id, contact_id } = await req.json();

    if (!building_id) {
      return Response.json(
        { success: false, error: 'building_id is required', code: 'MISSING_DATA' },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: building, error: bErr } = await supabase
      .from('buildings')
      .select('building_id, building_name, address, market, total_units, owner_1, management_company, pain_point, concessions, stage, asking_rent_monthly')
      .eq('building_id', building_id)
      .single();

    if (bErr || !building) {
      return Response.json(
        { success: false, error: 'Building not found', code: 'BUILDING_NOT_FOUND' },
        { status: 404, headers: corsHeaders }
      );
    }

    let contact = null;
    if (contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('first_name, last_name, job_title, company')
        .eq('contact_id', contact_id)
        .single();
      contact = data;
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
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(building, contact) }],
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
    const output = aiData.content?.[0]?.text ?? '';

    return Response.json({
      success: true,
      output,
      building_name: building.building_name,
      generated_at: new Date().toISOString(),
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('generate-proposal unhandled error:', err);
    return Response.json(
      { success: false, error: 'Unexpected error. Try again.', code: 'AI_ERROR' },
      { status: 500, headers: corsHeaders }
    );
  }
});
