# Prototype #1347: readable requirement-library headers

THROWAWAY design exploration. No variant is selected for production.

Question: which arrangement keeps column labels and controls clear, with
compact headers and adjustable space for requirement text?

The prototype uses the existing requirement-library page, authentication,
development data and navigation. It starts from `5ca568bb`, which includes
the wider workspace delivered by #1344.

## Open it

From this worktree, run:

```sh
npm run prototype:1347
```

Open <http://localhost:3003/sv/requirements?variant=A>.
Sign in with the local development account `ada.admin` / `devpass`.

The launcher prepares generated development assets and registers a dedicated
local Keycloak client and session cookie. It requires the repository's existing
Node dependencies, development environment, SQL Server and Keycloak on port
8080. This worktree is prepared with those dependencies. It does not create,
migrate or seed a database. Stop the launcher with Ctrl+C. If port 3003 is
occupied, use its running preview or stop that preview before starting again.

To see every design without running the app, open [review.html](review.html).
It contains all 32 screenshots, an adjustable before/after overlay, a change
list, verification instructions and measurements. It is one self-contained
HTML file: download or copy it, then open it in a browser.

## Five-minute walkthrough

1. Open A at 1440 × 900 with navigation expanded. Select **Före** in the
   bottom bar, then A. Check **Kravområde** and the renamed **Status**.
   Labels use one line with an ellipsis when narrowed. Compare header height
   and the width of the first long requirement text.
2. Select B and C. B places filters below their column labels; C collects
   filters in a shared strip. Compare the extra height with A.
   The existing package chooser opens on hover. If it covers a control, press
   Escape or move away from the package band.
3. Click **Radbryt: av**, then focus the same button and press Space to turn
   wrapping off again. Look at the long text in the first row.
4. Sort by **Kravområde**, open its filter, select **Användbarhet**, and
   remove that filter using its chip. Drag a column divider and then use
   its arrow keys. Open the column picker and show **Version**.
5. Open **Kolumnbredder**, then drag a divider. Watch its pixel value change
   before releasing the mouse. **Kopiera bredder** copies the visible column
   widths, viewport and navigation width. **Bredder att dela** provides the
   same JSON for manual copying.
6. Open **Granska / tillstånd**. Inspect the selected variant, widths,
   filters, sort order, clipping measurements and horizontal overflow.
   Use **Återställ layout och filter** before comparing defaults again.

Switch variants using the bottom buttons or ← / →. The URL records the
variant as `before`, `A`, `B` or `C`, so you can share a particular option.
Arrow keys in inputs, filter menus and resize handles retain their normal
meaning. Changes to column widths, visibility and filters stay in memory.
Switching variants preserves those settings; reloading resets them. Navigation
and theme still use the app's normal browser preferences on this separate
origin. Prototype column settings never read or overwrite your usual saved
column preferences.

## All changes and how to verify them

<!-- markdownlint-disable MD013 -->
| Change | Where to look | How to verify |
| --- | --- | --- |
| Original baseline | `?variant=before` | Check the original truncated labels and original column widths in the same page and data. |
| A: compact inline controls | `?variant=A` | Labels stay on one line and use the original ellipsis when needed. Sorting and 28 px filters remain alongside them. Compare header height with Before. |
| A: vertically aligned headers | A with Verifierbar and Normreferenser visible | Compare every header text center with the select-all checkbox. Sortable and plain labels use the same 28 px control row, including when filter chips add height below it. |
| B: labels above controls | `?variant=B` | Labels have their own top row; filters and wrapping occupy a second row. |
| C: shared filter strip | `?variant=C` | Find all existing column filters in the labelled strip. Headers retain sorting; active chips stay with their columns. |
| Domain labels | A uses ellipsis; B/C allow wrapping | In A, inspect the full name through the existing sort tooltip or accessible name. B/C retain compound-boundary line breaks. |
| Preferred default widths | A | Reset and compare with preferred-widths.json. Six columns remain visible by default; each optional column gets its supplied width when shown. Requirement text starts at 730 px and grows into spare space. |
| Status label | A | Check Status in the header, column picker, width panel, sorting name and filter name. |
| Live width panel | Kolumnbredder | Drag without releasing: the pixel value must update and highlight the selected column. Copy widths and compare the JSON with the panel; manual copying is available under Bredder att dela. |
| Width tradeoffs | All proposed variants | A favors the supplied wider defaults and may need horizontal scrolling. B/C retain their narrower metadata columns. Compare actual widths and row-text truncation. |
| Labelled wrapping control | A/B in the text header; C at the end of the filter strip | Click and press Space; verify the visible on/off label, icon, pressed state and actual row wrapping. |
| Existing sorting and filters | Each header or C's strip | Toggle sort direction, select a filter, inspect its count/chip, and clear it. |
| Scoped prototype width limits | Proposed variants only | Resize narrow metadata columns without peers snapping wider. Requirement text can retain its grown width above the original 960 px drag cap. |
| Existing column resizing | Column dividers | Drag, use keyboard arrows, and verify only the column on the left changes. Switch variants with a manual width to see that it is retained. |
| Column picker and reset | Existing column picker; Review / state | Show Version, switch variants, then reset. Reset restores default columns, widths, filters, sorting and wrapping. |
| In-memory preferences | Entire preview | Change widths and visible columns, reload, and check that defaults return. The variant remains in the URL. |
| Variant navigation | Floating bottom bar | Click previous/next through all four options; verify wraparound and URL updates. Repeat with arrows while the page or switcher has focus. |
| Review panel | Granska / tillstånd | Read the checklist and current state. Click Measure layout after an interaction to refresh geometry explicitly. |
| Existing page context | Navigation, theme, scrolling, row expansion | Collapse/expand navigation, switch theme, scroll down and expand a row. Check sticky header/body alignment. |
| Localized copy and markers | Swedish/English route; Developer Mode | Switch language. Inspect named header, sort, filter, wrap and prototype-toolbar markers when Developer Mode is enabled. |
| Isolated launcher and write guard | Port 3003 | Sign in through the dedicated prototype session. Data-changing requests receive a read-only response; browse and layout interactions remain available. |
| Offline comparison gallery | review.html | Select a viewport, navigation state, theme and variant. Use the overlay slider, then open the full-resolution image. No app connection is required. |
<!-- markdownlint-enable MD013 -->

## Measured comparison

Chromium, Swedish, Ada Admin, six default columns, published-status filter,
no manual widths. Each row has matching light and dark captures.

<!-- markdownlint-disable MD013 -->
| Window | Navigation | Before: text | A: text | B/C: text |
| --- | --- | --- | --- | --- |
| 1440 × 900 | Collapsed | 448 px | 730 px | 634 px |
| 1440 × 900 | Expanded | 360 px | 730 px | 442 px |
| 1920 × 1080 | Collapsed | 928 px | 1025 px | 1114 px |
| 1920 × 1080 | Expanded | 736 px | 833 px | 922 px |
<!-- markdownlint-enable MD013 -->

Before clips both reported labels in all eight combinations and requires
horizontal scrolling at 1440 px with expanded navigation. A now fits all six
default labels without wrapping in these captures. Its wider defaults require
horizontal scrolling at 1440 px in both navigation states; at 1920 px they fit.
Narrowing A columns uses single-line ellipsis. B/C retain full labels on at most
two lines and avoid default horizontal scrolling in these eight combinations.

At 1440 px with collapsed navigation, the measured sticky table area is
123 px for Before, 107 px for A, 146 px for B and 159 px for C. This includes
the package band and the active status chip, not just the label row.

**Current review direction:** A uses single-line ellipsis to avoid extra
header height, the maintainer's [preferred widths](preferred-widths.json), and
**Status** as its shortened status-column label. The supplied ten widths come
from a 1710 × 951 viewport with 4.5rem navigation. The six existing default
visible columns remain; optional columns receive their supplied widths when
shown. Requirement text has a 730 px base and grows to fill spare space.
The width panel reports actual rendered widths, including that growth.
B/C remain available as earlier alternatives. This is a prototype direction;
production promotion remains a separate implementation step.

## Verification evidence and limits

- [Measurements for every screenshot](evidence/observations.json).
- [Interaction verification results](evidence/interactions.json).
- [Additional browser verification](evidence/additional-verification.json).
- [Preferred widths and live-drag verification](evidence/preferred-widths-verification.json).
- [All ten preferred widths in the live panel](evidence/preferred-widths.png).
- [Header and checkbox alignment measurements](evidence/alignment-verification.json).
- [Aligned optional headers](evidence/alignment-light-right.png).
- [Offline comparison gallery](review.html).

The capture program is a throwaway review aid, not a production regression
suite. With the preview running, reproduce the image matrix using:

```sh
node docs/development/prototype-1347/capture.mjs
# Refresh only the revised A captures:
node docs/development/prototype-1347/capture.mjs --only-a
```

The gallery embeds the captured images. Regenerate it after recapturing:

```sh
python3 docs/development/prototype-1347/build-gallery.py
```

TypeScript and focused formatting/lint checks pass. Browser verification
covers sorting, filter selection/clearing, mouse/keyboard wrapping and resizing,
column selection, reset, variant arrows, in-memory preferences, row expansion,
sticky headers, the review panel, English rendering, mobile containment and the
offline gallery. The development write guard returns its expected response.
The prototype deliberately does not add production test suites or claim a full
accessibility audit. Persistence across reloads is excluded from this design
prototype; the production implementation must retain the issue's persistence
contract. Mobile uses the existing table-scrolling model and remains a review
case rather than a promise that all columns fit on a small screen.

Production promotion requires choosing a design and implementing it with the
repository's normal automated tests, manual-case updates and full checks.

## Files and capture

- `components/prototype-1347/`: variant definitions, scoped styles and switcher.
- `RequirementsTable`: opt-in rendering, proposed widths and relocated controls.
- Column-state and resize hooks: optional width-clamp injection for the proposed
  variants; the normal clamp remains the default for other callers.
- Requirement-library client: variant selection and in-memory column preferences.
- English/Swedish messages: prototype labels and walkthrough.
- Prototype launcher and development-only proxy guard: isolated preview runtime.
- Next configuration: disables the disposable Turbopack disk cache only for
  this development prototype to limit worktree disk usage.
- This directory: review guide, screenshot capture, evidence and offline gallery.

The full prototype lives on branch `prototype/issue-1347`, outside main.
Issue #1347 is the implementation handoff, including the revised A direction.
