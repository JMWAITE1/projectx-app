-- Lunch break is now properly deducted from labour cost AND sell.
-- Day and night hours are scaled by (paid / gross) so the lunch
-- deduction is allocated proportionally across both windows. The
-- subbie is no longer paid for their unpaid lunch.
--
-- Also: surfaces work_description / comments / materials_description on
-- the AP and AR views so the PM-facing pages have context.
--
-- The view chain depends on v_trakx_lines so drop+recreate all five.

drop view if exists v_trakx_ar cascade;
drop view if exists v_trakx_ap cascade;
drop view if exists v_trakx_zone_rollup cascade;
drop view if exists v_trakx_line_totals cascade;
drop view if exists v_trakx_lines cascade;

create view v_trakx_lines as
with
hours_decimal as (
  select
    e.*,
    extract(hour from e.start_time)  + extract(minute from e.start_time)  / 60.0  as s_hr,
    extract(hour from e.finish_time) + extract(minute from e.finish_time) / 60.0
      + case when e.finish_next_day then 24 else 0 end as f_hr_adj
  from trakx_entries e
),
hours_split as (
  select
    h.*,
    pr.day_start_hour::numeric  as day_start,
    pr.day_end_hour::numeric    as day_end,
    greatest(0::numeric, least(h.f_hr_adj, pr.day_end_hour::numeric) - greatest(h.s_hr, pr.day_start_hour::numeric)) as day_hours_raw,
    greatest(0::numeric, least(h.f_hr_adj, 24::numeric) - greatest(h.s_hr, pr.day_end_hour::numeric))
      + greatest(0::numeric, least(h.f_hr_adj, pr.day_start_hour::numeric) - h.s_hr) as night_hours_raw,
    (h.f_hr_adj - h.s_hr) as gross_hours,
    case
      when (h.f_hr_adj - h.s_hr) > pr.lunch_break_threshold_hours and not pr.lunch_break_paid
        then pr.lunch_break_minutes / 60.0
      else 0::numeric
    end as lunch_deduction_hours,
    pr.bonus_pct,
    pr.materials_markup_pct,
    pr.equipment_markup_pct
  from hours_decimal h
  join trakx_project_rates pr on pr.project_id = h.project_id
),
hours_paid as (
  -- Allocate the lunch deduction proportionally across day and night portions.
  -- (e.g. a 10.5h shift with 0.5h lunch -> 10h paid; if all day, day_hours_paid = 10.)
  select
    s.*,
    case when s.gross_hours > 0
      then s.day_hours_raw   * (1 - s.lunch_deduction_hours / s.gross_hours)
      else 0::numeric
    end as day_hours_paid,
    case when s.gross_hours > 0
      then s.night_hours_raw * (1 - s.lunch_deduction_hours / s.gross_hours)
      else 0::numeric
    end as night_hours_paid
  from hours_split s
)
select
  e.id,
  e.type,
  e.project_id,
  e.zone_id,
  z.name        as zone_name,
  e.person_id,
  p.name        as person_name,
  c.name        as company_name,
  (c.is_internal or p.is_internal) as is_internal,
  e.date,
  e.start_time,
  e.finish_time,
  e.finish_next_day,
  e.work_description,
  e.comments,
  e.materials_description,
  e.po_number,
  e.approved,
  e.approved_by,
  e.approved_at,
  e.marked_paid,
  e.submitted_by_name,
  case when e.type = 'hours' then hp.day_hours_paid    else 0 end as day_hours,
  case when e.type = 'hours' then hp.night_hours_paid  else 0 end as night_hours,
  case when e.type = 'hours' then hp.gross_hours - hp.lunch_deduction_hours else 0 end as total_hours,
  case when e.type = 'hours' then hp.gross_hours       else 0 end as gross_hours,
  case when e.type = 'hours' then hp.lunch_deduction_hours else 0 end as lunch_deduction_hours,
  case when e.type = 'hours'
    then round(
      hp.day_hours_paid   * e.day_pay_rate_snapshot_cents
    + hp.night_hours_paid * e.night_pay_rate_snapshot_cents
    + ((hp.gross_hours - hp.lunch_deduction_hours) * e.day_pay_rate_snapshot_cents * hp.bonus_pct / 100)
    )::int
    else 0
  end as labour_cost_cents,
  case when e.type = 'hours'
    then round(
      hp.day_hours_paid   * e.day_sell_rate_snapshot_cents
    + hp.night_hours_paid * e.night_sell_rate_snapshot_cents
    )::int
    else 0
  end as labour_sell_cents,
  coalesce(round(e.travel_kms * e.travel_cost_per_km_snapshot)::int, 0) as travel_cost_cents,
  coalesce(round(e.travel_kms * e.travel_sell_per_km_snapshot)::int, 0) as travel_sell_cents,
  case when e.type = 'accom' then coalesce(e.accom_nights, 0) * e.accom_cost_snapshot_cents else 0 end as accom_cost_cents,
  case when e.type = 'accom' then coalesce(e.accom_nights, 0) * e.accom_sell_snapshot_cents else 0 end as accom_sell_cents,
  case when e.type = 'materials' then coalesce(e.materials_cost_cents, 0) else 0 end as materials_cost_cents,
  case when e.type = 'materials'
    then round(coalesce(e.materials_cost_cents, 0) * (1 + hp.materials_markup_pct / 100))::int
    else 0
  end as materials_sell_cents,
  coalesce(e.equipment_hire_cents, 0) as equipment_cost_cents,
  case when e.equipment_hire_cents is not null
    then round(e.equipment_hire_cents * (1 + hp.equipment_markup_pct / 100))::int
    else 0
  end as equipment_sell_cents,
  e.created_at,
  e.modified_at
from trakx_entries e
join trakx_zones    z on z.id = e.zone_id
join trakx_people   p on p.id = e.person_id
join trakx_companies c on c.id = p.company_id
left join hours_paid hp on hp.id = e.id;

create view v_trakx_line_totals as
select
  l.*,
  (labour_cost_cents + travel_cost_cents + accom_cost_cents + materials_cost_cents + equipment_cost_cents) as total_cost_cents,
  case when is_internal
    then labour_sell_cents
    else labour_sell_cents + travel_sell_cents + accom_sell_cents + materials_sell_cents + equipment_sell_cents
  end as sell_price_cents,
  case when is_internal
    then labour_sell_cents
    else (labour_sell_cents + travel_sell_cents + accom_sell_cents + materials_sell_cents + equipment_sell_cents)
       - (labour_cost_cents + travel_cost_cents + accom_cost_cents + materials_cost_cents + equipment_cost_cents)
  end as profit_cents
from v_trakx_lines l;

create view v_trakx_zone_rollup as
select
  z.project_id, z.id as zone_id, z.name as zone_name, z.revenue_target_cents,
  count(*) filter (where l.type = 'hours')                              as hours_entries,
  coalesce(sum(l.total_hours) filter (where l.type = 'hours'), 0)       as total_hours,
  coalesce(sum(l.total_cost_cents), 0)                                  as total_cost_cents,
  coalesce(sum(l.sell_price_cents), 0)                                  as revenue_actual_cents,
  coalesce(sum(l.profit_cents), 0)                                      as gp_cents,
  case when sum(l.sell_price_cents) > 0
    then round(100.0 * sum(l.profit_cents) / sum(l.sell_price_cents), 1)
    else 0
  end as gp_pct,
  case when z.revenue_target_cents > 0
    then round(100.0 * sum(l.sell_price_cents) / z.revenue_target_cents, 1)
    else 0
  end as pct_complete,
  z.revenue_target_cents - coalesce(sum(l.sell_price_cents), 0) as budget_remaining_cents
from trakx_zones z
left join v_trakx_line_totals l on l.zone_id = z.id and l.approved = true
group by z.id;

create view v_trakx_ap as
select
  l.id, l.project_id, l.company_name, l.person_name, l.zone_name, l.date, l.type,
  l.total_hours, l.work_description, l.comments,
  l.labour_cost_cents, l.travel_cost_cents, l.accom_cost_cents,
  l.materials_cost_cents, l.equipment_cost_cents, l.total_cost_cents,
  l.approved, l.marked_paid
from v_trakx_line_totals l
where not l.is_internal and l.total_cost_cents > 0
order by l.date, l.company_name, l.person_name;

create view v_trakx_ar as
select
  l.id, l.project_id, l.zone_name, l.person_name, l.company_name, l.date, l.type,
  l.materials_description, l.work_description,
  l.labour_sell_cents, l.travel_sell_cents, l.accom_sell_cents,
  l.materials_sell_cents, l.equipment_sell_cents, l.sell_price_cents,
  l.approved
from v_trakx_line_totals l
where l.approved = true and l.sell_price_cents > 0
order by l.date, l.zone_name, l.person_name;
