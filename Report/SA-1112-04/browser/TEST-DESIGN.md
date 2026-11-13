# Upgrade browser acceptance

`run_fixture.py` launches the supplied binary in a new `/tmp/sa-upgrade-*` working directory. It writes absolute official gamedata/assets paths and an isolated SQLite path. The first stage disables GM accounts so registration and character creation exercise the normal client UI; restarting with `--gm` enables the same two accounts. Database, passwords, recovery secrets, browser profiles, tokens and raw server log stay in the temporary runtime. Reports never contain login frames or Session tokens.

`gameplay_acceptance.py` uses existing Playwright/Chromium with SwiftShader WebGL2. UI actions are real DOM touch or native canvas touch, with the debug interface used only to read client state and map hit coordinates. The test never overwrites application state, calls app.net.send, or invents experience/rewards. Independent SQLite reads observe server saves while the controlling browser is closed or frozen. An old-token rejection is the one deliberate direct transport probe, using the real browser WebSocket implementation and an old opaque token kept in memory only.

Planned stages:

1. Normal mobile registration and character creation for two accounts. Reentrant seeding handles an already registered account with no character. Never edits account hashes or production DB.
2. Actual embedded client at desktop1280×900, portrait390×844, landscape844×390. Check uploaded cover, two original inputs, logical alignment, no horizontal overflow. Portrait password focus/composition plus viewport shrink checks keyboard layout; this simulates Chromium visual space, not a physical device keyboard.
3. GM routes through the real chat UI configure independent char200/pet180 and rebirth12/pet8 world caps. Character progression reaches200, excessive `/lv` rejects; pet GM growth reaches180, excessive level rejects. Character GM rebirth actually crosses legacy6 to12 and rejects beyond12. Pet rebirth8 is configured here; its eight-round NPC workflow is covered by world-level tests, not claimed as a browser pass.
4. Select one primary battle pet and four standby pets through the actual pet window. Capture a real battle with five friendly pet fighters; require each individual PetResult experience entry. Verify enemy level4 yields4 stones and level100 gives50..80 at configured multiplier1.
5. Defensive AI plan selected through UI holds a live battle while quick→manual→quick toggles. Require stable fighter bag/owner identities, exactly one player command and five unique pet commands for the manual round, and a single BattleEnd settlement.
6. Join a party through facing and the native party button. Require total five pets split3/2 and independent per-owner result arrays. Then leave party, defend a solo round, request help and join through native rescue. Match prior pet bag identity, HP and status after the reset snapshot; ensure both clients can finish.
7. Enable real server auto encounter/quick battle in a valid field with high defensive GM stats. Close the entire persistent browser context and observe saved gold growth with SQLite. Reopen the same persistent profile and require automatic Resume of the same character plus restored automation.
8. Freeze the renderer with CDP lifecycle state and observe further server-side saved rewards. Unfreeze and require restored current state. This is actual renderer suspension, not a hidden CSS tab.
9. A clean browser context logs in with the password and takes over the same live character. Require the previous page to return to login, then probe the previous opaque token and require resume_failed. Stop automation through the new controlling UI.

The exact binary SHA-256 and each completed case are written to seed-results.json or gameplay-{phase}.json. A failed run records the traceback and does not count later cases as passed. Final acceptance must rerun against the final packaged binary; pre-review fixtures are labeled by their own SHA.

Commands (server start is a foreground process intended for a managed background job):

```bash
python Report/SA-1112-04/browser/run_fixture.py --binary /tmp/sa-upgrade-review
python Report/SA-1112-04/browser/gameplay_acceptance.py --seed
# Stop the first server gracefully, keep its temporary runtime.
python Report/SA-1112-04/browser/run_fixture.py --gm --binary /tmp/sa-upgrade-review-next
python Report/SA-1112-04/browser/gameplay_acceptance.py --run --phase all
```

No repository database is created, removed or edited. No temporary directories are deleted by these scripts.
