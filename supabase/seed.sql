-- Seed: Fonterra Maungaturoto '26 project setup.
-- Run once after the schema migration. Idempotent on re-run via ON CONFLICT.

-- Project
insert into projectx_projects (slug, customer_name, display_name, start_date, status)
values ('fonterra-m26', 'Fonterra', 'Fonterra Maungaturoto 26', '2026-03-01', 'active')
on conflict (slug) do nothing;

-- Project rates (defaults from current Fonterra rates)
insert into projectx_project_rates (project_id, day_sell_rate_cents, night_sell_rate_cents)
select id, 11700, 12200 from projectx_projects where slug = 'fonterra-m26'
on conflict (project_id) do nothing;

-- Zones (revenue targets from 00a Dashboard Calcs)
insert into projectx_zones (project_id, name, display_order, netsuite_project_id, revenue_target_cents) values
  ((select id from projectx_projects where slug='fonterra-m26'), 'Whey Plant',    1, 'PRO1915', 10595800),
  ((select id from projectx_projects where slug='fonterra-m26'), 'Casein Plant',  2, 'PRO1914',  4993200),
  ((select id from projectx_projects where slug='fonterra-m26'), 'Powder Room',   3, 'PRO1896', 10260000),
  ((select id from projectx_projects where slug='fonterra-m26'), 'Packing Plant', 4, 'PRO1916',  2006400)
on conflict (project_id, name) do nothing;

-- Companies
insert into projectx_companies (name, is_internal) values
  ('Bellissimo Ltd', false),
  ('Rezende Ltd',    false),
  ('NGL',            true)
on conflict (name) do nothing;

-- People (from 00b Contractor Adjustment)
insert into projectx_people (company_id, name, is_internal) values
  ((select id from projectx_companies where name='Bellissimo Ltd'), 'Israel Inacio',           false),
  ((select id from projectx_companies where name='Bellissimo Ltd'), 'Diego Montoya',           false),
  ((select id from projectx_companies where name='Bellissimo Ltd'), 'Thushan Thilakshana',     false),
  ((select id from projectx_companies where name='Bellissimo Ltd'), 'Neranja Bandara',         false),
  ((select id from projectx_companies where name='Rezende Ltd'),    'Julio Rezende',           false),
  ((select id from projectx_companies where name='Rezende Ltd'),    'Gelson Tonietto',         false),
  ((select id from projectx_companies where name='Rezende Ltd'),    'Gataifale Mamea',         false),
  ((select id from projectx_companies where name='Rezende Ltd'),    'Leonardo Luis Warken',    false),
  ((select id from projectx_companies where name='NGL'),            'Project Manager - Dave',  true),
  ((select id from projectx_companies where name='NGL'),            'Project Manager - Andrew',true)
on conflict do nothing;

-- Person rates ($67 day / $70 night for all, effective from project start)
insert into projectx_person_rates (person_id, effective_from, day_pay_rate_cents, night_pay_rate_cents)
select id, '2026-03-01', 6700, 7000 from projectx_people
where name in (
  'Israel Inacio','Diego Montoya','Thushan Thilakshana','Neranja Bandara',
  'Julio Rezende','Gelson Tonietto','Gataifale Mamea','Leonardo Luis Warken',
  'Project Manager - Dave','Project Manager - Andrew'
);

-- Assign all people to Fonterra M26
insert into projectx_project_people (project_id, person_id)
select (select id from projectx_projects where slug='fonterra-m26'), id from projectx_people
on conflict do nothing;
