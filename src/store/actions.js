import { supabase } from './supabase';
import { buildings, contacts, touchLog, stageHistory } from './data';

/**
 * Change a building's stage and log it in stage_history.
 */
export async function changeStage(buildingId, newStage, changedBy = 'Carla') {
  const building = buildings.value.find(b => b.building_id === buildingId);
  if (!building) throw new Error('Building not found');

  const oldStage = building.stage;

  const { error: updateError } = await supabase
    .from('buildings')
    .update({ stage: newStage })
    .eq('building_id', buildingId);
  if (updateError) throw updateError;

  // Log to stage_history
  try {
    const { error: histError } = await supabase
      .from('stage_history')
      .insert({ building_id: buildingId, old_stage: oldStage, new_stage: newStage, changed_by: changedBy });
    if (!histError) {
      stageHistory.value = [{ building_id: buildingId, old_stage: oldStage, new_stage: newStage, changed_by: changedBy, created_at: new Date().toISOString() }, ...stageHistory.value];
    }
  } catch (e) {
    console.warn('stage_history table may not exist:', e.message);
  }

  // Update local state
  buildings.value = buildings.value.map(b =>
    b.building_id === buildingId ? { ...b, stage: newStage } : b
  );
}

/**
 * Update building notes.
 */
export async function updateBuildingNotes(buildingId, notes) {
  const { error } = await supabase
    .from('buildings')
    .update({ notes })
    .eq('building_id', buildingId);
  if (error) throw error;

  buildings.value = buildings.value.map(b =>
    b.building_id === buildingId ? { ...b, notes } : b
  );
}

/**
 * Log a touch for a contact.
 */
export async function logTouch({ contactId, buildingId, channel, outcome, notes, objections, nextStep, nextStepDate, loggedBy = 'Carla' }) {
  const { data, error } = await supabase
    .from('touch_log')
    .insert({
      contact_id: contactId,
      building_id: buildingId,
      channel,
      outcome,
      notes,
      objections,
      next_step: nextStep,
      next_step_date: nextStepDate,
      logged_by: loggedBy,
    })
    .select()
    .single();
  if (error) throw error;

  touchLog.value = [data, ...touchLog.value];

  // Update contact fields
  try {
    const now = new Date().toISOString().split('T')[0];
    const contact = contacts.value.find(c => c.contact_id === contactId);
    const newTouches = (contact?.total_touches || 0) + 1;

    await supabase
      .from('contacts')
      .update({
        total_touches: newTouches,
        last_touch_date: now,
        last_touch_channel: channel,
        next_step: nextStep,
        next_step_date: nextStepDate,
        contact_status: outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('contact_id', contactId);

    contacts.value = contacts.value.map(c =>
      c.contact_id === contactId
        ? { ...c, total_touches: newTouches, last_touch_date: now, last_touch_channel: channel, next_step: nextStep, next_step_date: nextStepDate, contact_status: outcome, updated_at: new Date().toISOString() }
        : c
    );
  } catch (e) {
    console.warn('Could not update contact fields:', e.message);
  }

  return data;
}

/**
 * Import contacts from Apollo CSV.
 */
export async function importContacts(rows, market, filename) {
  const existingEmails = new Set(contacts.value.map(c => c.email?.toLowerCase()));
  const newRows = rows.filter(r => r.email && !existingEmails.has(r.email.toLowerCase()));

  if (newRows.length === 0) return { imported: 0, skipped: rows.length };

  // Generate contact IDs
  const maxId = Math.max(0, ...contacts.value.map(c => parseInt(c.contact_id?.replace('C', '') || '0')));
  const toInsert = newRows.map((r, i) => ({
    contact_id: `C${String(maxId + i + 1).padStart(5, '0')}`,
    email: r.email,
    first_name: r.first_name || r['First Name'] || '',
    last_name: r.last_name || r['Last Name'] || '',
    job_title: r.job_title || r['Title'] || '',
    company: r.company || r['Company'] || '',
    phone: r.phone || r['Phone'] || '',
    linkedin: r.linkedin || r['LinkedIn Url'] || '',
    tier: r.tier || 'P3',
    market,
    source: `Apollo CSV: ${filename}`,
    batch: filename,
  }));

  // Batch insert in groups of 100
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error } = await supabase.from('contacts').insert(batch);
    if (error) throw error;
  }

  // Log import
  try {
    await supabase.from('import_log').insert({
      filename, row_count: toInsert.length, import_type: 'apollo_csv', market, imported_by: 'Carla',
    });
  } catch (e) {
    console.warn('import_log table may not exist:', e.message);
  }

  // Update local state
  contacts.value = [...contacts.value, ...toInsert];

  return { imported: toInsert.length, skipped: rows.length - newRows.length };
}
