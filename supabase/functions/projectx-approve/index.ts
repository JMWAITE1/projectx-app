// projectx-approve: mark a projectx_entries row as approved (or un-approve).
// Used by the PM approval page. verify_jwt=false for now; Richard will
// add auth at the page level. The function logs approved_by as
// whatever string the client sends.
//
// POST { entry_id: uuid, approved_by: string, approved: boolean }
// Response: { ok: true } or { ok: false, error: string }

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
  if (!p.entry_id) return err('missing entry_id');
  if (typeof p.approved !== 'boolean') return err('missing approved (boolean)');

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const patch: any = {
    approved:    p.approved,
    approved_by: p.approved ? (p.approved_by || 'unknown') : null,
    approved_at: p.approved ? new Date().toISOString() : null,
    modified_at: new Date().toISOString(),
  };

  const { error: e } = await db
    .from('projectx_entries')
    .update(patch)
    .eq('id', p.entry_id);

  if (e) {
    console.error('projectx-approve', e);
    return err(`update failed: ${e.message}`, 500);
  }

  // Forensic audit log — fire-and-forget.
  try {
    await db.from('projectx_audit_log').insert({
      table_name:    'projectx_entries',
      row_id:        p.entry_id,
      action:        p.approved ? 'approve' : 'unapprove',
      changed_fields:{ approved: p.approved },
      actor:         (p.approved_by || 'unknown').toString(),
      actor_source:  'approve_ui',
    });
  } catch (auditErr) { console.error('audit log write failed', auditErr); }

  return ok({ ok: true });
});
