# Final browser acceptance results

The original release gameplay acceptance is complete. Final candidate binary SHA-256: `615a4fc6e354b8fac0dcdc026c8b72fe9d005deaa00b0453b30c985d834f521c` (v0.2.8-LYNX). All19 final-candidate cases passed, with zero uncaught page errors in the collected phase reports. No production files were modified by the browser/art acceptance agent.

| Final-candidate phase | Cases | Evidence |
|---|---:|---|
| Desktop, portrait, landscape cover and original inputs; portrait password composition/viewport shrink | 4 | gameplay-layout.json |
| Real DOM automatic and quick toggles, including quick on and off with outgoing intents and server acknowledgements | 4 | gameplay-dom-probe.json; dom-tap-probe.json |
| Solo five pet fighters, each positive experience; level100 gold67 at rate1; level4 gold4 | 2 | gameplay-baseline-final.json |
| Live quick→manual→quick, group3/2 quota, rescue prefix state, both rescue clients finish | 4 | gameplay-gameplay.json |
| Closed browser, same-profile session resume, frozen renderer, new-device takeover, old token rejection | 5 | gameplay-offline.json |

The mode switch used only real DOM buttons, with no canvas fallback. All five pet bag identities stayed unchanged, the manual round sent exactly one player command and one command for each battle pet slot5..9, and the live cycle produced exactly one BattleEnd. The defensive long battle uses unmodified official enemy263 with escape weight0, avoiding the ordinary Uli enemy's legitimate random escape.

The two-player battle had five total pets split3/2 and independent result arrays for each owner. One owner's pet experience entries were zero under the active original reward rules; this case verifies quota and ownership, not positive experience for every pet in every party battle. The separate solo case verifies positive experience for all five pets. Rescue retained existing bag0/1/2 HP1403/153/183 and status0 after redistributing the field, including the damaged pet at153 HP. Both clients received a winning result. The browser case does not claim a dead/status-afflicted rescue fixture; world tests cover those variants.

With the whole browser context closed, saved gold and character experience grew4→8, while all five pet experience values also increased. The same persistent profile resumed automatically without password entry, with Session resumed/inWorld true and live entity ID1 unchanged. During an actually frozen Chromium renderer, gold26→31; unfreeze showed client gold31 and zero browser BattleCommand/BattlePetCommand messages during the frozen interval. A clean browser authenticated with the password, took over the same live entity, and caused the former page to return to LoginScreen; the old opaque token was rejected with resume_failed. Automation was stopped through the new controller's real UI before teardown.

The earlier candidate `63ada6…40a6f5a` also proved both characters'200 level cap,12 rebirth cap,180 pet cap and five selected pets. Those earlier passes are retained in `v027-evidence/gameplay-all.json` and are not counted among the19 final-candidate cases. Pet rebirth cap8 was configured; the repeated NPC progression is covered by world tests, not claimed as a browser workflow. Chromium touch viewport testing simulates phone dimensions and keyboard visual space; it is not a physical-device keyboard test.

Historical failures are retained: the original stale-ack quick-toggle defect, missing quick-field controls, and ImageBitmap-close dimension error were reported and fixed by the production owner. A saved supplemental baseline report also contains a later fixture wait failure caused by an enemy legally escaping; its two completed reward cases remain valid and its failure is not an unresolved final-candidate defect. Reentrant login now acknowledges the real stale-token modal before entering credentials and waits for the authoritative restored automation snapshot.

The isolated runtime remains `/tmp/sa-upgrade-blnnnvpk`, http://127.0.0.1:45295/, PID3182177. SQLite, credentials and browser profiles are outside the repository. Outgoing auth frames and raw Session tokens are excluded from reports; a scan of generated text artifacts found zero fixture password/recovery-secret values. `summarize_acceptance.py` filters by actual runtime SHA and produces `acceptance-summary.json` from the final phase reports plus the successful supplemental reward cases.
