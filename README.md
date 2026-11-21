# Study With Gazelle ♡ — Version 2

An upgraded, responsive study app **based on the original Study_With_Gazelle_full_template_fixed.html**, especially its signature **yellow bubble timer and bottom navigation**. The app also uses the original supplied character/badge artwork and the ideas in the Break Club HTML, but limits games to the four requested in the new product specification.

## Try it immediately

Open **`Study_With_Gazelle_V2_Preview.html`** (provided next to the source ZIP) in a browser. Choose **Explore local preview**. The preview intentionally does **not** require a Supabase server; it is explicitly a local demonstration, NOT a live multi-user deployment. Click **Try all games** in the preview banner to bypass *demo-only* game XP requirements so you can check all four games.

The bundled preview has inlined CSS, scripts, and artwork, so it does not require internet access. Browser localStorage is used only for sample preview data. You can reset it by clearing that site's browser storage.

## Features included

- **Focus-first layout**: yellow 3D bubble timer, focus/short/long modes, pause/resume, reset, configurable durations and automatic breaks; two selectable timer shapes beyond the original bubble.
- **Actual-time XP**: on the cloud-backed path, the server accrues server-measured elapsed wall time only while a focus run is active. Solo = 10 XP/60 min; Premium Together = 20 XP/60 min; no break XP or XP for paused intervals. A heartbeat caps each accrual to 45 seconds, preventing unbounded accrual after disconnects.
- **One profile per account** with unique username; email/password sign-in, secure username/password Edge Function, password-reset email initiation and persistent sessions; requires Supabase configuration.
- **Separate counts**: registered users, recent app presence, actively studying Solo, actively studying Together, per-game player presence; refresh roughly every 30 seconds.
- **Premium and admin**: new accounts are Free; the database restricts Premium/admin assignment and host controls to admin RPCs; graduation avatars and Burgundy/Navy theme are Premium. The graduation portrait also requires 300 XP.
- **Host Together sessions**: Premium only; participants individually time their study; the host opens/closes the global room, and closing the room prevents further accrual.
- **Only four games**: a real 11×11 interconnected crossword, 9×9 Sudoku (valid seeded transformations of a known solution), 16-card Memory Match, and a 49-piece draggable/tap-to-swap picture puzzle. No extra game currency.
- **XP game access**: provisional total XP thresholds: Crossword 0; Memory 5; Sudoku 10; Jigsaw 15. XP is NOT spent. The admin can mark individual games Premium-only; global host Break Mode waives XP requirements but does not waive Premium eligibility.
- **Lightweight multiplayer race rooms**: share a six-character room code to play the *same seeded puzzle* independently and compare friendly completion times; game presence is refreshed while the game is open. This is not live cooperative board editing; room score submissions are client-reported and are NOT verified enough for prizes or formal competition.
- **Focus-only leaderboards**: today/week/month, public username/avatar/level/study XP/selected badges only; personal task details and study histories are never included.
- **Private progress**: today/week/month/year/total study time, focus rounds, seven-day activity chart, streak and best streak, 12 private task metrics, achievements and selectable public badges.
- **Private To-Do**: add, rename, check, delete tasks; edit original-style subtitle and notes.
- **Study shelf**: save private HTTPS links to study videos/playlists.
- **16 color palettes** including 14 free/classic palettes and two Premium palettes.

## Project files

- `index.html`, `styles.css`, `app.js`, `games.js` — deployable static frontend.
- `config.js` — *public* Supabase URL / publishable anon key; **no service-role secrets**.
- `assets/` — supplied reference artwork and picture-puzzle reference.
- `supabase/schema.sql` — PostgreSQL tables, RLS and secure RPCs. Intended for a **new Supabase project**.
- `supabase/functions/username-login/index.ts` — account lookup and password authentication using a server-only secret.
- `build_standalone.py` — rebuilds the stand-alone demonstration.
- `tests/` — browser smoke-test instructions.

## Connect Supabase (production setup)

1. Create a new Supabase project. In Authentication, enable **Email** provider and recommended email confirmation. Configure your **Site URL** and redirect URLs to match the hosted web URL.
2. Open **SQL Editor** and run the full `supabase/schema.sql` file. This will create the required RLS-protected tables and server-side functions. **Use a new project** because the script replaces its own account trigger/policies and revokes public function execution permissions.
3. Install the Supabase CLI and run:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy username-login --no-verify-jwt
   ```

   The function obtains `SUPABASE_SERVICE_ROLE_KEY` from the **server-side Edge Function environment**. Never put it in frontend HTML, config.js, GitHub files, or browser-accessible variables. To protect the login endpoint in a public launch, enable rate limits/abuse protection at the platform or edge gateway and test email flows.
4. Copy the **Project URL** and **publishable/anon key** from Supabase Project Settings into `config.js`. The anon key is designed to be public; server-only secrets must never be put there.
5. Host the static project via HTTPS. For example, to preview locally from the project folder run `python -m http.server 8000` and open `http://localhost:8000`.
6. Sign up for an admin account **normally** using the hosted app. Then promote exactly that username manually in the Supabase SQL Editor (trusted admin operation):

   ```sql
   update public.profiles
   set is_admin = true, plan = 'premium'
   where username = 'YOUR_EXISTING_USERNAME';
   ```

   Do **not** expose this SQL as a client-executable operation.
7. Sign out/back in or refresh. The Profile page will show **Host & admin controls**. Admin can open/close Together, toggle Break Mode, view registered users, upgrade/downgrade other users and mark games Premium-only.

## GitHub deployment

Commit and push the `StudyWithGazelle_V2` folder to a new GitHub repo. If using GitHub Pages, keep the static files at the published root or configure Pages to publish your desired folder. **Never commit service-role keys**. Ensure Supabase Auth's allowed redirect URLs include your GitHub Pages HTTPS URL. Browser calls go directly to Supabase with the publishable key and are controlled by RLS/RPCs. GitHub is not otherwise required to run the app.

## Data privacy and accuracy notes

- RLS allows clients to read their own profile, preferences, To-Dos, shelf, runs and study blocks. Direct client writes to XP, membership level, global Break Mode, host settings and Premium status are denied. Server functions expose only the public fields needed for the leaderboards.
- Study data and leaderboard periods currently use **UTC** day/week/month boundaries; local time-zone preferences are not yet implemented.
- Leaderboard level thresholds are currently **50 total XP per level**, pending a final progression design.
- Browser presence is approximate. If a tab crashes, the user is removed from count after its heartbeat expires; it does not remain falsely online indefinitely.
- Server pulses prevent the browser from claiming arbitrary XP. They cannot verify real-world concentration, and temporarily missed pulses may undercount time. Do not treat this as an anti-cheat system suitable for prizes.
- The four game implementations are static JavaScript shipped to browsers. Supabase enforces online room/access APIs, but browser-delivered game code is not DRM-protected and could be inspected or copied.
- Actual Supabase live authentication, multi-user presence, RLS and admin workflows **cannot be verified until deployed to a Supabase project**. The bundled preview is tested locally, not a claim that the entire cloud system is deployed.
- Multiplayer is a common-seed friendly race. True synchronous cooperative jigsaw/Sudoku edits, formal competitive verification and production monitoring would be further work.
- If this project already has existing production Supabase tables, **do not run the setup SQL blindly**; create a proper migration and test on staging.

## Browser testing

The frontend preview was exercised in Chromium at desktop (1280 px) and phone (390 px) widths. We checked navigation, local task creation, all four game boards, and the timer including accelerated one-minute completion and proportional XP. Cloud deployment tests still need actual credentials and a live project.
