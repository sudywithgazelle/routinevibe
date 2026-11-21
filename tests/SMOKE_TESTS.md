# Study With Gazelle v2 — manual acceptance tests

1. On a new Supabase project, sign up with a unique username, email and password. Confirm signup email; sign in with email, sign out, sign in with username.
2. Attempt signup using an existing username and existing email. Neither should create a duplicate identity. Ensure non-admin cannot set plan or is_admin directly through the API.
3. Run a Solo timer for 6 minutes -> ~1 XP. Pause for 60 seconds -> no XP during pause. Run Together for 6 minutes as Premium with host room open -> ~2 XP. Break timer -> 0 XP.
4. Close the host room during Together. No new participant can join; ongoing server time accrual stops.
5. Check all four counts with two browsers/two accounts: registered users, online users, active Solo and active Together. End a tab without logout; online presence should time out.
6. With two distinct accounts, verify RLS: Account B cannot list, edit, or read A's To-Dos, shelf links, raw study sessions or private insights. The leaderboard should expose only username/avatar/level/XP/selected badges.
7. Free vs Premium: Together, graduation portraits, Burgundy/Navy palette and Premium-marked games must be server-enforced, not just visually locked.
8. Set Break Mode as admin. XP game thresholds should be waived, but Premium-only content should still require Premium. Deactivate Break Mode to restore normal thresholds.
9. On mobile and desktop, play Crossword, Sudoku, Memory Match, and 49-piece Jigsaw, including touch/tap interactions. Create a shared race code with one user and join from another; both should see the same seeded puzzle and friendly scores.
10. Record a completed focus round and test achievement unlock, selection of earned badges and persistent profile statistics; unearned badges must not be selectable.
11. Change theme, timer settings, avatar, notes and tasks; sign out and sign back in on another device. Confirm persistence and that it is tied to the authenticated user.
12. Test 320px, 390px, 768px, 1280px and 1920px browser widths, keyboard operation, and a11y labels; audit with a screen reader before public launch.
