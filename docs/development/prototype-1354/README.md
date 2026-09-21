# Requirement area layout prototype: #1354

This guide is for the person reviewing the layout. It explains how to open
the prototype, compare every change and record a preferred direction.

Question: which layout makes requirement-area descriptions and responsibility
easier to read while keeping names, prefixes, HSA IDs and actions available?

This is throwaway work on `prototype/issue-1354`, based on `4b268d39`.
Maintainer decision: close #1354 as not planned. No layout variant is selected
for production. The only remaining desired improvement is to show the full
Kravområde description without shortening it; that improvement is deferred
because it is not worth the time now. The branch preserves the explored
alternatives and their evidence for possible future reference.

## Open it

The prepared worktree is:

```text
/mnt/krav-azure-dev-data/.worktrees/prototype-issue-1354
```

Start from any terminal in this workspace with one command:

```sh
npm --prefix /mnt/krav-azure-dev-data/.worktrees/prototype-issue-1354 run prototype:1354
```

Open [the interactive prototype](http://localhost:3001/sv/requirement-areas?variant=A&sample=stress).
Sign in with the existing local account `ada.admin` / `devpass`. If sign-in
lands on the requirements library, open the prototype link again. In a remote
VS Code session, forward port 3001 as **localhost:3001**, and keep the existing
Keycloak port 8080 forward available.

The launcher reads the main checkout's development environment without editing
it. It uses the existing SQL Server and Keycloak services, the registered
`kravhantering-prodlike` client, and a separate prototype session cookie.
Port 3000 remains available for the normal app. If 3001 is occupied, the
launcher stops with an explanation; it never stops another service.

Dependencies are installed in this worktree. In a new checkout, run `npm ci`
first and configure the normal development environment. Do not copy secrets
into committed files. Stop this prototype with Ctrl+C in its terminal.

For review without any running services, open [review.html](review.html) in
a browser. Double-click it in a file manager or use the browser's Open File
command. Keep the adjacent `evidence` directory when sharing the gallery.
The gallery compares matching captures side by side, supports full-size
images, and links to the narrow-screen, empty-list and existing-data views.
Keep `review.css` alongside the HTML file as well.

## Five-minute review

1. Use **Långa och korta exempel** and **Före** in the bottom switcher.
   Look at INF's long description and SAM's five co-authors.
2. Select **A**, **B**, then **C**. Read the same information in each layout.
   Decide whether column scanning, reading descriptions or grouping by area
   matters most. B and C are exploratory alternatives to the requested table.
3. In browser developer tools, set 1440 × 900, then 1920 × 1080. Expand and
   collapse the real navigation. Use its theme control for light and dark.
   The offline gallery already has all eight combinations for all four views.
4. Switch to **Befintliga data** to assess the real list's density. Switch to
   **Tom lista** to inspect the empty state. No database fixtures are created.
5. Open **Granskningsläge och anteckningar**. The state shows variant, dataset,
   row count, locale, theme, viewport, workspace width and last preview action.
   Notes remain in memory while switching variants; copy them before reloading.

Direct links:

- [Before](http://localhost:3001/sv/requirement-areas?variant=before&sample=stress)
- [A: compact table](http://localhost:3001/sv/requirement-areas?variant=A&sample=stress)
- [B: description rows](http://localhost:3001/sv/requirement-areas?variant=B&sample=stress)
- [C: area cards](http://localhost:3001/sv/requirement-areas?variant=C&sample=stress)
- [English A](http://localhost:3001/en/requirement-areas?variant=A&sample=stress)
- [A with existing data](http://localhost:3001/sv/requirement-areas?variant=A&sample=live)

## Complete change and verification checklist

These are prototype changes, not completed production acceptance criteria.
Before uses the current column definitions and cell rendering. The surrounding
purple review controls and action stubs are present in every variant.

<!-- markdownlint-disable MD013 -->

| Change | Where | How to verify |
| --- | --- | --- |
| Natural description wrapping | A, B, C | Read INF to its final sentence. Compare Before's ellipsis. Resize both desktop widths. |
| Long unbroken references wrap | A, B, C | Inspect IDN. Text stays within its description area and does not cover actions. |
| Compact prefix column | A | Compare ANV with Before at 1920px. Prefix stays 88px; extra width goes to other columns. |
| Stronger area name hierarchy | A, B, C | Compare names against secondary prefixes and HSA IDs. INF's long name remains complete. |
| Aligned responsibility information | A, B, C | Compare the top of owner and co-author information on INF and SAM. On narrow B/C they stack in reading order. |
| Name and HSA ID hierarchy | A, B, C | Owner name is primary; HSA ID remains readable underneath. Check TOM's missing display name. |
| Multiple co-authors remain visible | A, B, C | Count all five names in SAM. No new truncation or expander is introduced. |
| Anonymous person labels | All | PRV shows Anonym in Swedish and Anonymous in English. HSA IDs remain visible. |
| Compact row actions | A, B, C | Targets are 28 × 28px; Before retains 44px targets. Tab to each and activate with Enter. |
| Preview-only actions | All | Click create, edit, delete and manage co-authors. Feedback appears; records remain unchanged. TOM has no co-author management action. |
| Table proportions and spacing | A | At 1440px with expanded navigation, all columns fit. Short rows are compact; long content determines row height. |
| Description-first rows | B | Prefix/name/actions lead; description follows; owner/co-authors share the next row. Compare reading comfort against list height. |
| Area cards | C | Two columns on desktop, one below 1000px. Compare grouping, gaps under shorter cards and order when narrowing the browser. |
| Narrow-screen behavior | A, B, C | At 320px, A scrolls inside its table; B/C stack. The page itself must not scroll sideways. |
| Theme support | All | Use the real theme control. Check text, borders, focus and action visibility in both themes. |
| Before/variant switcher | All | Click all four options and both arrows. At the ends, arrows wrap. URL updates; reload preserves selection. |
| Keyboard switching | All | Use left/right arrows outside fields. In the review notes or dataset selector, arrows keep their native behavior. |
| Data selector | All | Select existing data, six examples and empty list. URL and state panel reflect the selection; reload preserves it. |
| Review notes and state | All | Enter a note, switch variant, inspect JSON state, then reload. Notes and action feedback clear on reload. |
| Original route | No variant parameter | Remove the query string. The normal application page appears without prototype controls. Its actions are real. |
| Production guard | Rendering and switcher | Inspect both development-only guards. Production builds use the original page even with a variant parameter. This is source-inspected, not a production build verification. |
| Developer Mode markers | Prototype surfaces | Inspect the prototype review, table/rows/cards, action and switcher markers. Marker labels are English in both locales. |
| Offline review gallery | review.html | Change both variants, viewport, navigation and theme; open full-size images and additional views. |
| Isolated launch | Task runner | Run the command above. Confirm port 3001 and the separate branch; an occupied port causes a clear exit. |

<!-- markdownlint-enable MD013 -->

## What the prototype preserves and simulates

The existing page still loads its real list through the existing authenticated
controller. Variant rendering can use those records or in-memory examples.
The examples include short text, long names and descriptions, five co-authors,
empty values, an unbroken reference and anonymized names. Their negative IDs
are not database IDs and are never submitted to an API.

The prototype preserves the existing name-formatting functions and field
content. It does not redesign the header or rename the create button; #1345
remains outside this work. The Before table shares the actual current column
definitions; its presentation wrapper is copied for this comparison.

All record actions within the prototype are simulations that display feedback.
No edit forms, responsibility dialogs, save operations or permission rules are
implemented by the prototype. Original navigation and theme controls still
work. Navigating away from the prototype returns to the normal app.

## Files and responsibilities

- `requirement-areas-client.tsx`: development-only query gate and exported
  area type; normal controller and production rendering remain in place.
- `requirement-areas-prototype.tsx`: Before and three exported variants,
  dataset choice, review state, notes, preview actions and curated markers.
- `requirement-areas-prototype.module.css`: scoped layout, typography,
  theme styles, responsive behavior and target sizes.
- `requirement-areas-prototype-data.ts`: six in-memory review examples.
- `PrototypeSwitcher.tsx`: floating controls, URL updates and keyboard cycling.
- Both locale message catalogs: matching prototype copy in Swedish and English.
- `cspell.jsonc`: the Swedish word `kravområdeskort` and CSS value `nowrap`.
- `package.json` and `prototype-1354.mjs`: one-command isolated development
  launch using the existing local authentication registration.
- This directory: review guide, offline gallery, repeatable capture script,
  screenshots and measured observations.

## Verification results

The captured review contains 37 views: 32 desktop combinations, three
320-pixel English views, one empty list and one view with 39 existing records.
All three proposals show the six example descriptions without clipping in
the captured combinations. Before clips four of the six descriptions in
each desktop combination. A also shows all 39 existing descriptions without
clipping at 1920 × 1080 with expanded navigation and dark theme.

The browser exploration confirms aligned responsibility information on
desktop, action targets of at least 24 pixels, no page-level horizontal
overflow in the proposals, localized anonymous names, variant cycling and
reload behavior, keyboard editing in notes, action feedback, empty-state
selection and return to the original route. No requirement-area mutation
requests or browser exceptions occur during the recorded run.

The offline gallery resolves all 32 desktop pairings and its layout/zoom
controls work. TypeScript, focused Biome checks, Markdown lint and spelling
checks pass. These checks support design review; they do not establish full
accessibility conformance or production readiness.

To inspect the exact implementation inventory from the worktree:

```sh
git diff --stat 4b268d39...HEAD
git diff 4b268d39...HEAD -- 'app/[locale]/requirement-areas' components/PrototypeSwitcher.tsx
```

## Repeat the browser review

With the prototype server running, run from the worktree:

```sh
node scripts/dev-login.mjs --base http://localhost:3001 --jar /tmp/prototype-1354.cookies
node docs/development/prototype-1354/capture.mjs
```

The cookie file contains a local session and must not be committed or shared.
The capture script reads it without printing it. It records screenshots,
description geometry, responsibility alignment, action sizes, page overflow,
browser errors and attempted requirement-area mutations. The observations
file contains measurements and results, not cookies or request headers.

The main capture matrix uses the same six in-memory examples. A separate
existing-data image reflects the development database at capture time.

This is a prototype review, not a production test-suite run. No production
tests or manual-case definitions are changed. Before implementation, select a
direction, rewrite the chosen layout under normal production constraints and
add the issue's required automated and manual coverage.

## Maintainer decision

The layout redesign is not planned. No variant is selected or promoted to
production. Showing the full Kravområde description without shortening it
remains desirable, but implementation is deferred because it is not worth
the time now. This is not a decision to remove description content or a
permanent rejection of natural wrapping.

The prototype branch and review evidence remain upstream. The local prototype
server and worktree are removed after capture. The launch instructions above
apply after recreating the worktree and installing its dependencies.
