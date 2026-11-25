# Study With Gazelle v2 — manual acceptance tests

## Authentication

1. On a new Supabase project, sign up with a unique username, email and password. Confirm signup email; sign in with email, sign out, then sign in with username.
2. Request a password reset, open the email link, set a new password in the app, then sign in with the new password.
3. Attempt signup using an existing username and existing email. Neither should create a duplicate identity. Ensure a non-admin cannot set `plan` or `is_admin` directly through the API.

## Timer and XP

4. Run a Solo timer for 6 minutes -> about 1 XP. Pause for 60 seconds -> no XP during pause. Run Together for 6 minutes as Premium with host room open -> about 2 XP. Break timer -> 0 XP.
5. Close the host room during Together. The next server heartbeat should end the Together run and the client timer should stop; no new participant should be able to start Together.
6. Downgrade a Premium participant while studying Together. The next heartbeat should end that run and the UI should stop counting it as an active Together session.

## Presence and privacy

7. Check all four counts with two browsers/two accounts: registered users, online users, active Solo and active Together. End a tab without logout; online presence should time out.
8. With two distinct accounts, verify RLS: Account B cannot list, edit, or read A's To-Dos, shelf links, raw study sessions or private insights. The leaderboard should expose only username/avatar/level/XP/selected badges.

## Premium and games

9. Free vs Premium: Together, graduation portraits, Burgundy/Navy palette and Premium-marked games must be server-enforced, not just visually locked.
10. Set Break Mode as admin. XP game thresholds should be waived, but Premium-only content should still require Premium. Deactivate Break Mode to restore normal thresholds.
11. On mobile and desktop, play Crossword (including the on-screen letter keyboard), Sudoku, Memory Match, and 49-piece Jigsaw, including touch/tap interactions. Create a shared race code with one user and join from another; both should see the same seeded puzzle and friendly scores.

## Persistence and responsive UI

12. Record a completed focus round and test achievement unlock, selection of earned badges and persistent profile statistics; unearned badges must not be selectable.
13. Change theme, timer settings, avatar, notes and tasks; sign out and sign back in on another device. Confirm persistence and that it is tied to the authenticated user.
14. Test 320px, 390px, 768px, 1280px and 1920px browser widths, keyboard operation, and accessibility labels; audit with a screen reader before public launch.

## Deployment checks

15. Confirm the GitHub Pages workflow publishes on the repository's default branch and that Supabase Auth Site URL/redirect URLs include the published HTTPS URL.
16. Verify the username-login Edge Function is protected by rate limiting/abuse controls before public launch. Never expose the service-role key in browser code or GitHub Pages.

## Routine Vibe feature upgrade (2026-11-26)

17. Apply `20261126_routinevibe_feature_upgrade.sql` on a staging project first. Verify the new RPCs `start_study_with_subject`, `get_my_study_records`, `get_my_study_analytics`, `get_my_subject_count`, and `is_username_available` are visible after schema reload.
18. Start a focus session with a subject, pause after several heartbeat writes, and confirm `study_blocks.subject` is populated. Confirm old blocks remain readable as `Unspecified` in analytics.
19. Verify leaderboard returns `period_seconds` and `is_studying`; run two accounts concurrently and confirm the green indicator clears after the active run stops or heartbeat expires.
20. Create a To-Do with repeat_count=4. Confirm taps progress 1/4 → 2/4 → 3/4 → 4/4 and a tap after completion resets it to 0/4. Reload and verify persistence.
21. Select each profile analytics period (day/week/month/year). Verify donut subjects and bars change to the selected period and no fabricated values appear for empty periods.
22. Enable Infinite Focus with a one-minute test duration. Confirm each cycle is recorded and a new focus run starts automatically without an intervening break. Confirm Pause and Stop still work.
23. Sign up in a test account with avatar 1, then another with avatar 5. Confirm the selected value is saved in `profiles.avatar`.
24. Select up to three earned badges and verify the server rejects unearned badge IDs. Verify all twelve achievement conditions with test data or a staging-only fixture.
