# Prototype verification and design findings

Verified on 2026-09-22 against the separate development server on port 3138.
The source data consists of the same 15 loaded norm references used during
triage. The comparison uses Ada Admin, Chromium, 100% zoom and reduced motion.

## Recommendation for review

**Start with A.** It retains direct comparison across all nine columns and
reduces the worst observed name fragmentation. No variant is approved yet.

At 1440 × 900 with expanded navigation, A gives both text columns 208px.
Before gives the name 135px and the issuer 163px. The NIS2 name moves from
10 text lines to 4; its row falls from 225px to 97px. The action column moves
from 172px to 148px while all three row buttons remain 44 × 44px. The name's
usable text width grows from approximately 51px to 144px after its padding,
link and gap are accounted for.

A deliberately gives ID and reference less width, so those fields can wrap
more often. That is the central tradeoff to inspect alongside name readability.
No values are removed, combined or truncated.

B gives the NIS2 name one line at both desktop sizes, but its grouped metadata
makes the row 141px tall. C gives the selected norm a broad detail panel and
requires selection to compare full metadata. C's detail-panel height is not
comparable to a table-row height. Both are exploratory alternatives to the
current issue brief.

## Requested variant D

D places the name at the top and issuer vertically centered in the first column.
Identification has its own column with separately labelled ID, reference,
version and type. The URI icon follows the name text inline with a 24px
click target. The name and first identification value share a 24px line
height. Equal flexible space above and below the issuer centers it vertically,
with at least 12px separation from the name.
Row actions retain 44px targets; their visible icons align with the status
badge center. The targets extend 10px above the badge within cell padding, with
the requirement count immediately after the badge on the same line. No winning
variant is assumed by
these refinements.

Compare [D in Swedish](screenshots/D-sv-1440-expanded-light.png) with
[B](screenshots/B-1440-expanded-light.png). Inspect
[D in English and dark theme](screenshots/D-en-1440-expanded-dark.png).
The added [D verification](D-verification.json) covers 16 combinations of
language, desktop size, navigation and theme. It checks the issuer/name
relationship and the separate identification cell, alongside geometry and
API writes. [D interaction checks](D-interaction-verification.json) cover
variant cycling, local edits, reload and narrow-screen scrolling.

## Before/A measurements

NIS2 row heights in CSS pixels; themes give the same results:

| Viewport | Navigation | Before | A | Name lines Before → A |
| --- | --- | --- | --- | --- |
| 1440 × 900 | Collapsed | 105 | 61 | 4 → 2 |
| 1440 × 900 | Expanded | 225 | 97 | 10 → 4 |
| 1920 × 1080 | Collapsed | 69 | 61 | 2 → 1 |
| 1920 × 1080 | Expanded | 69 | 61 | 2 → 2 |

See [all desktop geometry](verification.json) for column positions, action
sizes, text line counts, scroll boundaries and detail-panel dimensions.

## Captures to compare first

- [Before: 1440, expanded, light](screenshots/before-1440-expanded-light.png)
- [A: 1440, expanded, light](screenshots/A-1440-expanded-light.png)
- [A: 1440, expanded, dark](screenshots/A-1440-expanded-dark.png)
- [B: 1440, expanded, light](screenshots/B-1440-expanded-light.png)
- [C: 1440, expanded, dark](screenshots/C-1440-expanded-dark.png)
- [A: English edge cases](screenshots/A-english-examples.png)
- [A: 320px access](screenshots/A-320-mobile.png)

The screenshot directory contains 32 desktop captures, four English
edge-case captures and eight narrow-screen captures. Full-page screenshots
show the fixed comparison bar at its viewport position; scroll the live page
to inspect content beneath it.

## Completed checks

- Four variants × two desktop sizes × two navigation modes × two themes:
  32 combinations, no document-width overflow, all sampled row actions 44px.
- English fixtures: 0/1/14/209 requirements, missing version, archived norm,
  different ID/reference/version and a non-clickable URN.
- Local edit across A/B/C, previous/next wrapping, URL updates and keyboard
  arrows. Arrow keys in the search field do not change variants.
- Archive/reactivate with mouse and keyboard; Escape closes a preview dialog
  and restores focus to the surviving trigger.
- Delete/create/reset, no-results filtering and visible state updates.
- Reload retains the URL variant and resets memory-only data and examples.
- All four variants at 375px and 320px: document width equals viewport width;
  tables scroll inside their own containers. C stacks vertically.
- Zero JavaScript page errors and zero API write requests during the recorded
  desktop and interaction runs.
- TypeScript compilation and focused Biome checks pass.
- Review documentation passes spelling and Markdown checks.

See [interaction evidence](interaction-verification.json). The browser
checks are temporary verification scripts, not committed production tests.

## Limits and follow-up

The comparison is a design exercise. It does not validate production
permissions, mutations, loading failures, every keyboard interaction or all
accessibility criteria. Links are inspected without following external
sites. The preview edit/create dialog only changes the name. Other norm
fields are read from loaded data or examples.

English A can require horizontal scrolling at 1440px with expanded navigation
because full requirement-count labels use a wider column. On mobile C's
selected detail appears below its complete list. These tradeoffs are visible
for review rather than hidden behind a different mobile design.

No production test suite is run and no manual test cases are changed for
this throwaway prototype. Production implementation must add the tests and
manual-case updates required by the selected design and the agent brief.

The original application remains on port 3000. The prototype neither changes
the environment files nor provisions database or identity-provider services.
