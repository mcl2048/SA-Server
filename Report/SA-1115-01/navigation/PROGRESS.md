# Task1 progress

- Baseline: 6b5cfde / v0.2.18-LYNX.
- Root cause: BattleStart clears Field.target unconditionally. Quick battle keeps the field update loop alive, so simply retaining target would send forbidden Move requests during battle and receive PosCorrect.
- Input: reuse InputBox with native mobile adoption; coordinate form belongs to current floor only and must be removed on close/screen leave.
- Research completed before production edits; RED tests next.

- Implemented: Field.beginBattle/endBattle suspend quick encounters without Move; visible battle cancels intent; floor changes/corrections cannot resurrect old goals.
- Implemented: native X/Y fields, strict integer validation, map-go, minimap coordinate entry, input lifecycle and mobile labels.
- Added regression: manual directions clear the old goal instead of resuming it after key release.
- RED evidence: red.txt, coordinates-red.txt, manual-override-red.txt. Targeted 11 tests green in final-targeted.txt.
- Candidate ELF built to /tmp only, matching embedded client. Private runtime metadata: /tmp/sa-1115-navigation-runtime.json; no database/config/credentials exported to Report.
- Actual desktop acceptance succeeded in first attempt: exact goal (365,177), six actual quick encounters, no Move during battle, visible combat stops after one step.
- First long exec process group was terminated at approximately 120 seconds (143); no OOM and no completion claim. Restarted using detached own supervisor with native shutdown cleanup.
- Full current client + build-tool checks: 239 passed, 0 failed (`full-client-final.txt`).
- Production edits are stable; pending only full candidate desktop/mobile evidence and final-binary rerun by integration owner.
- Reproducer for integration: `python3 Report/SA-1115-01/navigation/prepare-runtime.py --binary /absolute/path/to/final/saserver --meta /tmp/sa-1115-navigation-final.json`, then node26 `Report/SA-1115-01/navigation/real-game.mjs --variant final --meta /tmp/sa-1115-navigation-final.json` under a detached supervisor. Runner owns and stops its ELF, checks SQLite position after SIGTERM, and can run another module via `--cases ./module.mjs` (exports `run`).

- Enhanced intermediate ffa8d4eb acceptance passed both desktop/minimap-entry isolation and mobile immersive navigation through orientation changes. Archived under intermediate-ffa8d4eb because integration DOM/camera/server repairs require a new ELF.
- Integration owner requested deferral during aa241f0b startup; stopped only owned runner with SIGTERM, server exited 0 and lock removed. Historical output archived under intermediate-aa241f0b-cancelled; waiting for sole final hash.
- Sole final delivery binary now frozen by integration owner: v0.2.19-LYNX, SHA-256 c9118a90071366a2aedf38ef28cda70faa2e122792811a81d1be0caeb96aa8f4. Fresh private runtime `/tmp/sa-1115-navigation-release.json`; final acceptance running with enhanced desktop/minimap and mobile immersive/orientation coverage.
- Scoped integration review findings were repaired by the integration owner; same camera probe changed from -1/f0 to 10/f10. Current full client/build tool run: 244 passed, 0 failed.

- COMPLETE: final c9118a90 acceptance passed desktop and mobile immersive/orientation cases; both devices traversed the actual 10-step obstacle detour to (379,186), six real quick encounters resumed to (365,177), zero illegal in-battle Move packets, normal battle stopped at (370,182), zero browser errors. Final SIGTERM exit 0 and SQLite position matches.
