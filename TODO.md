# ProjectX TODO

## What's live (as of V0.03)

- ✅ Schema deployed (8 tables, 5 views, RLS, all calcs in `v_projectx_lines`)
- ✅ Fonterra M26 seeded (4 zones with PO targets, 3 companies, 10 people, rates)
- ✅ `projectx-submit` edge function — anonymous, validates, snapshots rates, inserts
- ✅ `submit.html` — public smartform, mobile, 3 tabs (Hours / Materials / Accom & Travel)
- ✅ `index.html` — landing + live zone list
- ✅ `admin.html` — placeholder
- ✅ GitHub Pages deploy: https://jmwaite1.github.io/projectx-app/

## Next milestone (V0.04)

1. **Approve page** — PM ticks pending rows. Auth-agnostic shell (Richard plugs in his auth).
2. **AP page** — reads `v_projectx_ap`, group by contractor + week, export CSV.
3. **AR page** — reads `v_projectx_ar`, group by zone + date, export CSV.
4. **Project dashboard** (`/p/fonterra-m26`) — 6 KPI tiles + GP-by-zone chart + zone-vs-target table, all from `v_projectx_zone_rollup`. Like IMR.

## UI / polish backlog (Johnny said "the ui is horrible")

Everything below is fair game once functionality is broader:

- [ ] **Visual design** — current is raw Tailwind defaults. Pick a brand-ish look (colours, type, spacing). Look at how IMR / portal apps feel.
- [ ] **Submit form mobile UX** — bigger tap targets, sticky submit, better tab affordance, success animation, last-entry-summary chip
- [ ] **Empty / error states** — submit form shows nothing if project not found beyond a one-liner; could be friendlier
- [ ] **Form section copy** — "Hours / Materials / Accom & Travel" labels could be punchier ("Today's hours", "What you bought", "Where you stayed / drove")
- [ ] **PWA / installable** — manifest + service worker + icon, matches `qa-trial` pattern, lets subbies add it to home screen
- [ ] **Offline support** for submit (per Q49 answer: yes) — queue locally, flush when online
- [ ] **Photo upload** for materials receipts (per Q28 answer: yes) — needs Supabase Storage bucket + signed upload URL in edge function
- [ ] **Landing page** should look like more than a placeholder list of links
- [ ] **Drill-down from dashboard charts** (per Q58 answer: yes) — IMR-style modal showing underlying line items
- [ ] **"$2k left" over-PO alert** (per Q40 answer)
- [ ] **Date filtering on reports** (per Q53 answer: yes)
- [ ] **Export buttons** on reports — CSV / Excel / PDF (per Q52 answer)

## Calc / data backlog

- [ ] **Lunch deduction in cost calc** (per Q1) — currently `v_projectx_lines` uses gross day/night hours in the labour_cost formula, so the subbie is effectively paid for their lunch. Johnny wants NZ-law-compliant: 30min unpaid lunch + 2×10min paid rest. Fix in a follow-up migration that drops + recreates the view chain.
- [ ] **NZ break law double-check** — Johnny asked me to verify online. Confirm: 30min unpaid meal after 4-6h, 10min paid rest at 2-4h and again at 6-8h.
- [ ] **Admin UI** — currently just a placeholder. Need to be able to edit projects/zones/PO targets, people, person rates, project rates from the web app. Until then, edit via Supabase dashboard.

## Auth (not my problem)

Richard handles auth for approve / AP / AR / admin pages. Build those as auth-agnostic shells. Don't wire up Access Manager or any am-* edge function.

## Notes from V0.01–V0.03

- Edge function deployed: `projectx-submit` at `https://uhodycdbkwocvptiffks.supabase.co/functions/v1/projectx-submit`
- Anon publishable key (safe for client): `sb_publishable_TKWfAttrdywsm1BOMUMNlw_FjMolZO5`
- End-to-end tested with a real submission — calc view returned correct day/night/cost/sell
- Pages deploy is `main` branch root, no Action needed; pushes go live in ~30s
