// projectx-submit: anonymous public endpoint for the subbie smartform.
// Accepts a single timesheet/materials/accom entry, validates that the
// project/zone/person are real and active, snapshots current rates onto
// the row, and inserts.
//
// CORS open; no JWT required (verify_jwt=false). Service role is used
// server-side for the actual insert so RLS doesn't block.
//
// Payload (JSON):
//   {
//     project_id: uuid,
//     type: 'hours' | 'materials' | 'accom',
//     zone_id: uuid,
//     person_id: uuid,
//     date: 'YYYY-MM-DD',
//
//     // hours-only:
//     start_time?: 'HH:MM',
//     finish_time?: 'HH:MM',
//     finish_next_day?: boolean,
//     work_description?: string,
//
//     // materials-only:
//     materials_description?: string,
//     materials_cost?: number,   // DOLLARS (will convert to cents)
//     po_number?: string,
//
//     // accom-only (travel_kms can also accompany any type):
//     accom_nights?: number,
//     travel_kms?: number,
//
//     comments?: string,
//   }
//
// Response: { ok: true, id: uuid } or { ok: false, error: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const ok  = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return err('POST only', 405);

  let p: any;
  try {
    p = await req.json();
  } catch {
    return err('invalid JSON body');
  }

  // ── Required fields ──────────────────────────────────────────────
  for (const k of ['project_id', 'type', 'zone_id', 'person_id', 'date']) {
    if (!p[k]) return err(`missing field: ${k}`);
  }
  if (!['hours', 'materials', 'accom'].includes(p.type)) {
    return err(`bad type: ${p.type}`);
  }
  if (p.type === 'hours' && (!p.start_time || !p.finish_time)) {
    return err('hours entry requires start_time and finish_time');
  }
  if (p.type === 'materials' && (!p.materials_description || p.materials_cost == null)) {
    return err('materials entry requires materials_description and materials_cost');
  }
  if (p.type === 'accom' && (!p.accom_nights || p.accom_nights < 1)) {
    return err('accom entry requires accom_nights >= 1');
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const srv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db  = createClient(url, srv, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Validate project ─────────────────────────────────────────────
  const { data: project } = await db
    .from('projectx_projects')
    .select('id, status')
    .eq('id', p.project_id)
    .single();
  if (!project || project.status !== 'active') return err('project not found or inactive', 404);

  // ── Validate zone belongs to project + active ────────────────────
  const { data: zone } = await db
    .from('projectx_zones')
    .select('id, project_id, status')
    .eq('id', p.zone_id)
    .single();
  if (!zone || zone.project_id !== p.project_id || zone.status !== 'active') {
    return err('zone not found or inactive for this project', 404);
  }

  // ── Validate person is on this project + active ──────────────────
  const { data: link } = await db
    .from('projectx_project_people')
    .select('person_id, projectx_people!inner(id, active)')
    .eq('project_id', p.project_id)
    .eq('person_id', p.person_id)
    .single();
  if (!link || !(link as any).projectx_people?.active) {
    return err('person not assigned to this project, or inactive', 404);
  }

  // ── Snapshot project rates ───────────────────────────────────────
  const { data: pr, error: prErr } = await db
    .from('projectx_project_rates')
    .select('*')
    .eq('project_id', p.project_id)
    .single();
  if (prErr || !pr) return err('project rates not configured', 500);

  // ── Snapshot person pay rates (latest effective_from <= date) ────
  const { data: payRates } = await db
    .from('projectx_person_rates')
    .select('day_pay_rate_cents, night_pay_rate_cents, effective_from')
    .eq('person_id', p.person_id)
    .lte('effective_from', p.date)
    .order('effective_from', { ascending: false })
    .limit(1);
  const pay = payRates?.[0];
  if (!pay && p.type === 'hours') return err('no pay rate found for person on this date', 500);

  // ── Build insert payload with all snapshots ──────────────────────
  const insert: any = {
    type:                 p.type,
    project_id:           p.project_id,
    zone_id:              p.zone_id,
    person_id:            p.person_id,
    date:                 p.date,
    comments:             p.comments || null,
    travel_kms:           p.travel_kms ?? null,

    // Snapshots — always populate (even for non-hours types) so future
    // edits / queries always have the full context.
    day_pay_rate_snapshot_cents:   pay?.day_pay_rate_cents   ?? null,
    night_pay_rate_snapshot_cents: pay?.night_pay_rate_cents ?? null,
    day_sell_rate_snapshot_cents:  pr.day_sell_rate_cents,
    night_sell_rate_snapshot_cents:pr.night_sell_rate_cents,
    travel_cost_per_km_snapshot:   pr.travel_cost_per_km_cents,
    travel_sell_per_km_snapshot:   pr.travel_sell_per_km_cents,
    accom_cost_snapshot_cents:     pr.accom_cost_per_night_cents,
    accom_sell_snapshot_cents:     pr.accom_sell_per_night_cents,
    bonus_pct_snapshot:            pr.bonus_pct,

    submitted_by_name: p.submitted_by_name || null,
  };

  if (p.type === 'hours') {
    insert.start_time       = p.start_time;
    insert.finish_time      = p.finish_time;
    insert.finish_next_day  = !!p.finish_next_day;
    insert.work_description = p.work_description || null;
  } else if (p.type === 'materials') {
    insert.materials_description = p.materials_description;
    insert.materials_cost_cents  = Math.round(Number(p.materials_cost) * 100);
    insert.po_number             = p.po_number || null;
    // receipt_url — file upload comes in a later milestone
  } else if (p.type === 'accom') {
    insert.accom_nights = Math.round(Number(p.accom_nights));
  }

  // ── Insert ───────────────────────────────────────────────────────
  const { data: row, error: insErr } = await db
    .from('projectx_entries')
    .insert(insert)
    .select('id')
    .single();
  if (insErr) {
    console.error('projectx-submit insert error', insErr);
    return err(`insert failed: ${insErr.message}`, 500);
  }

  // Forensic audit log — fire-and-forget. Captures who/when even though
  // the submit form is anonymous (no auth).
  try {
    await db.from('projectx_audit_log').insert({
      table_name:    'projectx_entries',
      row_id:        row.id,
      action:        'insert',
      changed_fields:insert,
      actor:         p.submitted_by_name || 'anonymous (smartform)',
      actor_source:  'smartform',
    });
  } catch (e) { console.error('audit log write failed', e); }

  return ok({ ok: true, id: row.id });
});
