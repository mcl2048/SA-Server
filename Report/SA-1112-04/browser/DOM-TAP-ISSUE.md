# Resolved quick toggle issue found in real browser acceptance

Resolved and revalidated on final binary `615a4fc6e354b8fac0dcdc026c8b72fe9d005deaa00b0453b30c985d834f521c`. The actual DOM probe passes all4 toggles with correct outgoing intents and authoritative acknowledgements. Quick-field DOM controls are reachable after the additional shell phase fix; the live quick→manual→quick scenario passes with five distinct pet commands, unchanged fighter identities and one settlement. Final phase reports contain no uncaught page errors. Original failing JSON/PNG evidence is retained under `v027-evidence/`; the root `dom-tap-probe.json` now contains the passing final-candidate regression.

Original issue at discovery follows.

Binary: `63ada6b5c8434ae09f9622f014916a7e930b8bf26b369b3f84c01c36440a6f5a`.
Isolated embedded client: http://127.0.0.1:45295/, Chromium touch viewport844×390.

Minimal normal UI sequence: log in, open 系统→战斗设定→基本, click the actual DOM `ai-auto-val` button once, then click `ai-quick-val` twice, then `ai-auto-val` once more. The auto toggle changes and sends AutoPlay as expected. Both quick clicks leave quick=true and never send AutoPlay with quick=false. Native canvas touches reproduce the same behavior, so they are not an acceptable workaround.

`dom-tap-probe.json` records each button's before/after bounding box, server state, outgoing non-secret messages, document pointerdown/pointerup/focusin/click/scroll events, viewport dimensions, UI hit and pointer positions. Buttons below the scroll area are scrolled into view by Playwright before tapping. Quick button settles at x7,y193,w147,h44; the click correctly targets ai-quick-val. VisualViewport remains844×390 with zero offsets. No resize or sa-controls-layout event occurs during the failing click. The canvas UI hot action is correctly ai-quick-val afterward.

This rules out the earlier suspicion that viewport/scroll layout cancellation caused this particular failed toggle. An outstanding AutoPlayState response overwriting locally changed settings before the following frame sync is a possible cause to inspect, not a confirmed diagnosis. The production owner must fix and rerun the real DOM probe plus battle mode acceptance.

At discovery, 12 baseline cases plus4 automatic-toggle checks and5 offline/session cases had passed on this exact binary. The offline phase failed only in its final quick-off cleanup. It does not invalidate the observed server reward growth or token/session assertions, but the run is not globally green. Do not claim complete acceptance until the remaining quick/group/rescue tests and cleanup pass.
