# Study With Gazelle / Routine Vibe

A lightweight study timer, task list, leaderboard, study shelf and four mini-games.

## Included in this upgrade

- Live-study indicator and period study-time display on the leaderboard.
- Optional study subject recorded with focus sessions.
- Minimal 7-day, 24-hour study-record timeline.
- Subject distribution donut and compact Day / Week / Month / Year study-time chart.
- Repeating To-Dos with a tap-to-advance progress bar.
- Infinite Focus mode that records each focus cycle and automatically starts the next.
- Twelve server-validated achievements with matching SVG badge artwork.
- Signup avatar choice between avatar 1 and avatar 5.
- Clear username-availability feedback and normalized exact username login lookup.
- Safer game initialization error handling.

## Deploy

Read `DEPLOYMENT_GUIDE_FA.md` first. Existing Routine Vibe users should run only:

`supabase/migrations/20261126_routinevibe_feature_upgrade.sql`

Then publish the site files from the repository root to GitHub Pages. Do not rerun `supabase/schema.sql` on an existing database.

## Security

`config.js` contains only the public Supabase project URL and publishable key. Never add `SUPABASE_SERVICE_ROLE_KEY` to frontend code, GitHub Pages, or this repository. The username-login Edge Function source is under `supabase/functions/username-login/` and must run server-side.

## Checks

Run:

```bash
bash tests/run_checks.sh
```

The checks validate HTML IDs, local assets, JavaScript syntax, granted RPCs, Sudoku solution, Crossword intersections, and game smoke tests. Supabase integration, browser interaction, and real multi-account behavior still require the deployment acceptance tests in the guide.
