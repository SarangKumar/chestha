# Grove — manual verification checklist

`npm test` proves the rules hold. `npm run build` proves it compiles. **Neither proves
that Chrome fires the events the tracker expects, or that anything renders.** This file
covers what only a person at a browser can establish.

Run the whole list before calling the Grove done, and after any change to
`apps/extension/src/tracker.js`, `apps/web/src/grove/useGroveDrain.js`, or the manifest.
Record the date and the Chrome version at the bottom.

## Setup

```bash
npm run build:extension
```

1. `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.
2. Chrome will ask to confirm the new permissions (`idle`, `alarms`, `storage`). Accept.
3. Open a new tab — the workspace is the new-tab page.
4. Settings → **Productive time** → tick "Count time on the sites I list", add
   `leetcode.com` (or any site you can sit on for a few minutes).
5. Keep `chrome://extensions` open in a second window: it is where the service worker
   is inspected and stopped.

Useful while testing:

- The worker's own state: service worker → **Inspect** → Console →
  `await chrome.storage.local.get(['grove.active', 'grove.inbox', 'grove.rules', 'grove.paused'])`
- What has been credited: the Grove → **Stats** → "Time on your sites".

---

## A. Time accounting

| # | Do this | Expect |
| --- | --- | --- |
| A1 | Sit on the tracked site, active, for ~2 min | `grove.active` names the host; `lastSeenAt` advances roughly once a minute |
| A2 | Open the workspace tab | Within a minute, Stats shows roughly the time spent, and `grove.inbox` empties |
| A3 | Sit on the tracked site for 15 minutes total | **+5 XP** appears, once, with "15 minutes on …" in Recent rewards |
| A4 | Keep going to 30, 45, 60 minutes | +10, +15, +20 — each exactly once, in order |
| A5 | Stay past 60 minutes | Nothing further is awarded that day |
| A6 | Navigate between pages on the same site | Accrual is uninterrupted; no reset, no second segment per page |
| A7 | Open the tracked site in a **background** tab and work elsewhere | Nothing accrues |
| A8 | Two windows: tracked site in the unfocused one | Nothing accrues. Focus that window — accrual starts |
| A9 | Visit `chrome://settings`, the Web Store, a local PDF | Nothing accrues, no error anywhere |
| A10 | Visit a site with **no** rule | Nothing is recorded at all — `grove.inbox` gains no entry for it |

## B. Idle, lock and sleep

| # | Do this | Expect |
| --- | --- | --- |
| B1 | On the tracked site, stop touching the machine for 2 min | Accrual stops within ~60 s of going idle; the partial minute is kept |
| B2 | Move the mouse again | Accrual resumes into the same day's total |
| B3 | Lock the screen for 5 min | Same as idle, immediately on unlock there is no 5-minute jump |
| B4 | Close the laptop lid for 30+ min, reopen | **At most ~2.5 minutes** is credited for the whole gap (the `MAX_TICK_MS` clamp) |
| B5 | Switch to another application for 10 min, with the tab still "active" | Nothing accrues while Chrome is not the focused window |

## C. Service worker suspension and restarts

| # | Do this | Expect |
| --- | --- | --- |
| C1 | `chrome://extensions` → **stop** the service worker while sitting on a tracked site | It restarts within a minute (the alarm) and accrual continues |
| C2 | Check `grove.inbox` after C1 | No gap longer than ~2.5 min is credited; no duplicated segment ids |
| C3 | Reload the extension (↻ on its card) mid-accrual | No crash; the open segment is closed and a new one opens |
| C4 | Quit Chrome entirely, reopen | No credit for the time it was closed |
| C5 | Open the workspace in **two** tabs at once, with segments pending | Each segment is credited exactly once; Stats agrees between the tabs after a refresh |

## D. Focus sessions

| # | Do this | Expect |
| --- | --- | --- |
| D1 | Start a 15-minute session and let it finish | Timer reaches zero, chime plays (if enabled), toast shows XP and seeds, plant is **Grown** |
| D2 | Start a session, pause 2 min, resume | Paused time is excluded; the countdown does not move while paused; the plant stops growing |
| D3 | Start a session, end it early | XP for the time, **no** completion bonus, plant stays at the stage it reached and appears in the Grove |
| D4 | Start a session, close the tab, reopen **before** it would have ended | Still running, correct remaining time |
| D5 | Start a session, close the tab, reopen **after** it would have ended | Settled at its planned end, full XP **with** bonus, toast says it completed while you were away |
| D6 | Start a session, quit Chrome, reopen after it would have ended | Identical to D5 |
| D7 | Start a session, leave it overnight (or set a short planned time and wait 12h+) | Marked written off; the time it earned, no bonus |
| D8 | During a session, sit on a tracked site for 20 min | Stats shows the time under "in sessions"; **no** website XP for it |
| D9 | Reopen the same completed session's tab twice | XP is awarded once, not twice |

## E. Audio

| # | Do this | Expect |
| --- | --- | --- |
| E1 | Save a mix on the Sounds page, pick it in Settings → Grove, start a session | The mix starts with the session |
| E2 | Pause the session | The mix pauses; resume brings it back |
| E3 | End the session | Chime, then the mix fades out shortly after |
| E4 | Play a mix from the Sounds page **first**, then start a session | The session leaves the existing mix completely alone, and does not stop it when it ends |
| E5 | Start a session with no mix chosen | Silence, no error |

## F. Interface

| # | Do this | Expect |
| --- | --- | --- |
| F1 | Add the **Grove** and **XP today** widgets; drag, resize, compact them | Layout stays gap-free and valid; no overlap; arrangement survives a reload |
| F2 | Narrow the window to phone width | Widgets reflow; no horizontal scroll; the Grove page stays usable |
| F3 | Switch to the light theme | Plant, ring and meters all remain legible; nothing disappears into the background |
| F4 | Tab through the Grove with the keyboard only | Every control reachable, focus always visible, dialogs trap and return focus |
| F5 | Turn on **Reduce motion** in the OS | Growth and ring transitions stop animating |
| F6 | Collection: unlock something | Seeds drop, XP is unchanged, the item becomes owned |
| F8 | Garden: run two sessions, then reload several times | Both plants appear and stand in exactly the same spots every time |
| F9 | Garden: unlock a decoration, then switch environment in Collection | The decoration appears in the scene; the wash changes; plants stay the most saturated thing on screen |
| F10 | Garden: select a plant | Its species, stage, session length and **local** date are named; the date matches when you actually ran it |
| F11 | Garden in the light theme | The scene stays light — no dark rectangle — and every plant is still legible |
| F7 | Hide the Grove in Settings → Navigation | It leaves the rail; `#/grove` still opens it |

## G. Degradation and privacy

| # | Do this | Expect |
| --- | --- | --- |
| G1 | `npm run dev` and open `localhost:5173` | Settings → Productive time explains that tracking needs the extension; sessions and task XP work normally |
| G2 | Turn tracking off | `grove.paused` flips immediately; `grove.active` is cleared; nothing further accrues |
| G3 | Settings → **Delete website-time data** | Stats empties; XP, tasks, plants and rules are untouched |
| G4 | Settings → Grove → **Reset Grove progress** | XP, seeds, sessions, plants and unlocks go; tasks, notes, calendar and DSA are untouched |
| G5 | Inspect `grove.inbox` and the `grove.time` area | Only domains, local days and seconds. No paths, no query strings, no titles |
| G6 | Watch the Network tab throughout | The extension makes no request of any kind |
| G7 | Export, then import into a fresh profile | Grove data round-trips; a pre-Grove backup still imports |

---

## Known limits — not bugs

- Website time is **approximate**, accurate to roughly ±60 s per transition. It can
  undercount and must never overcount.
- A session whose tab was closed completes at the moment it would have completed. That
  is deliberate: the extension cannot tell "kept working on paper" from "wandered off",
  and it is designed to be generous rather than wrong in the punishing direction.
- The app cannot see page content and so cannot know whether an hour on YouTube was
  educational. A rule is a domain; that is the whole signal.

## Run record

| Date | Chrome | Run by | Result |
| --- | --- | --- | --- |
| | | | |
