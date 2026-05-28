-- Forensic audit log. Hidden table — never surfaced in UI. Edge functions
-- write a row here on every insert/update/delete/approve so we can answer
-- "who broke that rate?" or "when did this entry change?".
--
-- actor: the human name responsible for the change.
--   - subbie submits → submitted_by_name from the smartform
--   - approvals     → PM name from the approve page
--   - admin edits   → "anonymous (no auth)" today; once Richard wires
--                     Access Manager this becomes the logged-in user
-- actor_source: where the change came from (smartform / approve_ui /
--               admin_ui / system).
-- row_id: target row's uuid as text (string so we can extend to other tables).
-- changed_fields: jsonb of the request payload (or before/after diff for
--                 updates) so we have the raw evidence.

create table if not exists trakx_audit_log (
  id              bigserial primary key,
  table_name      text not null,
  row_id          text,
  action          text not null,
  changed_fields  jsonb,
  actor           text not null default 'anonymous',
  actor_source    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_table_row on trakx_audit_log(table_name, row_id);
create index if not exists idx_audit_created   on trakx_audit_log(created_at desc);
create index if not exists idx_audit_actor     on trakx_audit_log(actor);

alter table trakx_audit_log enable row level security;

-- Anonymous read for now (no auth). Once Richard adds Access Manager, this
-- policy should tighten to "admin only" — but the data is purely metadata,
-- not sensitive financial figures.
drop policy if exists "audit log anon read" on trakx_audit_log;
create policy "audit log anon read" on trakx_audit_log
  for select using (true);

-- Only the service role (edge functions) can write. Never expose service
-- role to client.
