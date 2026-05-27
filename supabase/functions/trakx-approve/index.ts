// trakx-approve: mark a trakx_entries row as approved (or un-approve).
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
    .from('trakx_entries')
    .update(patch)
    .eq('id', p.entry_id);

  if (e) {
    console.error('trakx-approve', e);
    return err(`update failed: ${e.message}`, 500);
  }
  return ok({ ok: true });
});
