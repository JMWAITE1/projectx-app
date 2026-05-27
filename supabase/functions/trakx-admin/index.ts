// trakx-admin: write endpoint for the admin UI. Dispatches on `op`.
// verify_jwt=false for now; Richard plugs in auth at the page level.
//
// POST { op, ...args }
// Operations:
//   update_project_rates(project_id, fields...) -> ok
//   upsert_zone(zone_id?, project_id, name, display_order, netsuite_project_id, po_number, revenue_target_cents, status) -> {id}
//   delete_zone(zone_id) -> ok
//   upsert_company(company_id?, name, is_internal) -> {id}
//   upsert_person(person_id?, company_id, name, email, is_internal, active) -> {id}
//   set_person_rate(person_id, effective_from, day_pay_rate_cents, night_pay_rate_cents) -> {id}
//   assign_person(project_id, person_id, assigned: boolean) -> ok

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const ok  = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });
const err = (m: string, s = 400)  => new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return err('POST only', 405);

  let p: any;
  try { p = await req.json(); } catch { return err('invalid JSON'); }
  if (!p.op) return err('missing op');

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    switch (p.op) {

      case 'update_project_rates': {
        if (!p.project_id) return err('project_id required');
        const fields: any = {};
        for (const k of [
          'day_sell_rate_cents', 'night_sell_rate_cents',
          'travel_cost_per_km_cents', 'travel_sell_per_km_cents',
          'accom_cost_per_night_cents', 'accom_sell_per_night_cents',
          'materials_markup_pct', 'equipment_markup_pct', 'bonus_pct',
          'lunch_break_minutes', 'lunch_break_threshold_hours', 'lunch_break_paid',
          'rest_break_minutes_per', 'rest_break_count', 'rest_break_paid',
          'day_start_hour', 'day_end_hour',
        ]) if (p[k] !== undefined) fields[k] = p[k];
        fields.updated_at = new Date().toISOString();
        const { error } = await db.from('trakx_project_rates').update(fields).eq('project_id', p.project_id);
        if (error) throw error;
        return ok({ ok: true });
      }

      case 'upsert_zone': {
        if (!p.project_id || !p.name) return err('project_id + name required');
        const row: any = {
          project_id: p.project_id,
          name: p.name,
          display_order: p.display_order ?? 0,
          netsuite_project_id: p.netsuite_project_id || null,
          po_number: p.po_number || null,
          revenue_target_cents: p.revenue_target_cents ?? 0,
          status: p.status || 'active',
        };
        if (p.zone_id) row.id = p.zone_id;
        const { data, error } = await db.from('trakx_zones').upsert(row).select('id').single();
        if (error) throw error;
        return ok({ ok: true, id: data.id });
      }

      case 'delete_zone': {
        if (!p.zone_id) return err('zone_id required');
        const { error } = await db.from('trakx_zones').delete().eq('id', p.zone_id);
        if (error) throw error;
        return ok({ ok: true });
      }

      case 'upsert_company': {
        if (!p.name) return err('name required');
        const row: any = { name: p.name, is_internal: !!p.is_internal };
        if (p.company_id) row.id = p.company_id;
        const { data, error } = await db.from('trakx_companies').upsert(row).select('id').single();
        if (error) throw error;
        return ok({ ok: true, id: data.id });
      }

      case 'upsert_person': {
        if (!p.company_id || !p.name) return err('company_id + name required');
        const row: any = {
          company_id: p.company_id,
          name: p.name,
          email: p.email || null,
          is_internal: !!p.is_internal,
          active: p.active !== false,
        };
        if (p.person_id) row.id = p.person_id;
        const { data, error } = await db.from('trakx_people').upsert(row).select('id').single();
        if (error) throw error;
        return ok({ ok: true, id: data.id });
      }

      case 'set_person_rate': {
        if (!p.person_id || !p.effective_from || p.day_pay_rate_cents == null || p.night_pay_rate_cents == null) {
          return err('person_id + effective_from + rates required');
        }
        const { data, error } = await db.from('trakx_person_rates').insert({
          person_id: p.person_id,
          effective_from: p.effective_from,
          day_pay_rate_cents: p.day_pay_rate_cents,
          night_pay_rate_cents: p.night_pay_rate_cents,
        }).select('id').single();
        if (error) throw error;
        return ok({ ok: true, id: data.id });
      }

      case 'assign_person': {
        if (!p.project_id || !p.person_id) return err('project_id + person_id required');
        if (p.assigned) {
          const { error } = await db.from('trakx_project_people').upsert({
            project_id: p.project_id, person_id: p.person_id,
          });
          if (error) throw error;
        } else {
          const { error } = await db.from('trakx_project_people').delete()
            .eq('project_id', p.project_id).eq('person_id', p.person_id);
          if (error) throw error;
        }
        return ok({ ok: true });
      }

      default:
        return err(`unknown op: ${p.op}`);
    }
  } catch (e: any) {
    console.error('trakx-admin', p.op, e);
    return err(e?.message || String(e), 500);
  }
});
