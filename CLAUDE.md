# Notes for Claude

Solo repo for Johnny Waite. NGL ProjectX rebuild — Fonterra Maungaturoto '26 first.

## Workflow rules

**Auto-pull at session start. Push without asking when work is ready.**
- At session start, run `git pull --ff-only` automatically. No prompt needed.
- When a logical chunk of work is done and tested, commit + push immediately. Don't prompt "want me to push?".
- Every push report leads with the version number (e.g. "Shipped V0.07"), so Johnny can match what he's testing.

A Windows scheduled task also auto-pulls all repos at 6:00 AM daily as a safety net (logs to `C:\Users\johnn\Claude Projects\auto-pull.log`).

**Commit triggers** — treat any of these as "save to GitHub" → commit + push:
"commit that", "push it", "save to github", "ship it", "yep go", "make a release"

**Push process:**
1. `git pull --ff-only` first
2. Write a real commit message in plain English
3. `git push`
4. Report new commit SHA, version, and GitHub link

## Project-specific notes

- **Supabase project:** `uhodycdbkwocvptiffks` (same as IMR/PPR/TCDC/portal)
- **Calculations live in SQL views** — `supabase/migrations/*.sql`. NEVER hide a calculation inside an HTML page or edge function if it can live in a view. Transparency is the load-bearing requirement.
- **All money in cents** (integer) — never floats. Display divides by 100.
- **Rate snapshots** — every entry freezes its day/night pay/sell rates at insert time so historical lines don't change when an admin edits rates today.
- **Spec lives outside the repo** at `../fonterra-snapshot/TRAKX_SPEC.md` and `../fonterra-snapshot/ANSWERS.md`. Don't duplicate that content here; reference it.

## Version bumping (per-commit)

This project has a `.version-badge` element near the top of each main HTML page showing version like `V0.07`.

**Rule:** before EVERY push, bump the version on the patch number:
- Find the current value in the `<div class="version-badge">VX.YZ</div>` near the top of the body
- Increment by 0.01: V0.01 → V0.02 → V0.03 ... V0.99 → V1.00
- Bump the version in ALL pages that have a version badge (keep them in sync)
- Edit, then commit + push (the version bump is part of the same commit as the actual change)

If asked to push without making other changes ("ship a version bump alone"), the bump itself counts as the change.

## File layout

```
/
├── index.html                                # Project dashboard
├── submit.html                               # Public subbie smartform
├── admin.html                                # Admin: projects/zones/people/rates
├── approve.html                              # PM approval queue
├── ap.html                                   # Accounts payable
├── ar.html                                   # Accounts receivable
├── login.html                                # Access Manager login
├── assets/                                   # CSS, JS, images
├── supabase/
│   └── migrations/
│       └── 20260527120000_trakx_schema.sql   # All schema lives here (historical name preserved)
├── .github/workflows/
│   └── deploy.yml                            # (TBD) GitHub Pages or similar
├── CLAUDE.md                                 # this file
├── README.md
└── .gitignore
```

## Things to be careful of

- **RLS on projectx_entries** — the subbie smartform is anonymous (no auth). Inserts must go via an edge function that validates project/zone/person are real and active, then writes with service-role. Never expose service-role to client.
- **Snapshot rates on insert** — the edge function must read the current `projectx_project_rates` and current `projectx_person_rates` for the person and freeze them onto the entry row. This is non-negotiable for audit.
- **Approved → editable?** — currently no. Once approved, only an admin should be able to un-approve. (Confirm with Johnny if exceptions needed.)
- **Auth = NOT my problem.** Richard handles authentication for PM/office/admin pages. Don't wire up Access Manager / am-* edge functions / login flows in this repo. Stub the protected pages with a "login required" placeholder; Richard will plug auth in.
