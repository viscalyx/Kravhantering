# Issue 1345: header and list actions prototype

This is a throwaway UI study on branch `prototype/issue-1345`, based on
`d1b21455`. It answers: **Which arrangement makes the current page and its
existing actions easiest to identify without giving up too much list space?**

No design is approved yet. A is the recommended starting point. C deliberately
explores an alternative to the issue's horizontal toolbar requirement.
Production implementation remains a separate task in
[issue 1345](https://github.com/viscalyx/Kravhantering/issues/1345).

## Run and show it

In the prepared workspace:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/prototype-1345
npm run prototype:1345
```

Open [the prototype](http://localhost:3001/sv/requirements?variant=A).
Use the local development account `ada.admin` / `devpass` if prompted.
Forward port **3001** in VS Code if your browser runs outside the development
host. The standard development Keycloak service on port 8080 and SQL Server
must be running, as they are for the normal app. The prototype uses the existing
registered port-3001 login client while running the development build.

The main checkout and its port-3000 server are separate. Stop this prototype
with Ctrl+C in its launch terminal. Do not run a production build to preview it:
the switcher and prototype layouts are development-only.

The prepared worktree has its own dependencies and a local link to the existing
development configuration. These ignored machine-specific files are not part
of the branch. On another machine, install dependencies with `npm ci` and follow
the normal development configuration setup before the launch command.

## Show the screenshots without running the app

Open [review.html](review.html) in a browser. This local gallery needs no server
or login. Choose any of the five lists and A/B/C to compare Before and After
side by side, or stack the images for a larger view. Keep the `evidence` folder
next to the HTML file when sharing it. The gallery also links to dark, wide,
narrow and English screenshots and the matching live app page.

## Compare designs

<!-- markdownlint-disable MD013 -->

| URL parameter | Design | What changes | Tradeoff |
| --- | --- | --- | --- |
| `variant=before` | Before | Original page rendering and floating icon controls | Baseline; prototype safeguards and review bar stay active |
| `variant=A` | Compact header | Title and named primary action above the list, separate row of secondary icons | Closest to the issue; takes an extra row in the library |
| `variant=B` | Command band | Title, named tools and primary action in one band | Less height when it fits; more wrapping with long labels |
| `variant=C` | Action panel | Title above the list, primary and named tools in a right panel | Clear commands; gives up table width and departs from the requested horizontal toolbar |

<!-- markdownlint-enable MD013 -->

Use the bottom arrows or Left/Right keys to cycle. The arrows do not take over
text fields, selects, editable content, menus, dialogs, sliders or tab lists.
The URL retains the variant on reload and can be copied to another browser.
The **Before / A** button is a quick baseline comparison; arrows select B or C.
Use **Changes & verification** for an in-app checklist and the current design's
tradeoff. The status line displays the variant, view and last simulated action.

The five links in the bottom bar preserve the selected variant:

<!-- markdownlint-disable MD013 -->

| View | Direct URL for A | Primary action |
| --- | --- | --- |
| Kravbibliotek | [Open](http://localhost:3001/sv/requirements?variant=A) | Nytt krav |
| Kravunderlag | [Open](http://localhost:3001/sv/specifications?variant=A) | Nytt kravunderlag |
| Kravpaket | [Open](http://localhost:3001/sv/requirements/stewardship?tab=packages&variant=A) | Nytt kravpaket |
| Normbibliotek | [Open](http://localhost:3001/sv/requirements/stewardship?tab=norms&variant=A) | Ny normreferens |
| Kravområden | [Open](http://localhost:3001/sv/requirement-areas?variant=A) | Nytt kravområde |

<!-- markdownlint-enable MD013 -->

## Complete change and verification checklist

<!-- markdownlint-disable MD013 -->

| ID | Change | How to verify |
| --- | --- | --- |
| P01 | A visible library heading | Open Kravbibliotek, compare Before/A, collapse the left navigation; A still says Kravbibliotek above the list |
| P02 | Precise primary labels on all five lists | Visit every bottom-bar link; compare Before/A and check the labels in the table above, each with a plus icon |
| P03 | Primary action positioning | Compare A's upper-right button, B's command band and C's right action panel on every view |
| P04 | Library secondary toolbar | In A/B/C, find AI authoring, Reports, Import, Export and Columns near the list; Before retains the floating rail |
| P05 | Visible secondary labels | Compare A's icons with B/C; B/C expose the existing accessible labels as visible text |
| P06 | Existing menu contents | Open Reports and Columns in all variants; use Escape, Tab and menu arrow keys; compare available entries and focus return |
| P07 | Existing read-only list interaction | Apply/clear a filter, sort, select rows and toggle a column; switch variants without reloading and check that the view state stays useful; scroll down and use the retained Back to top control |
| P08 | Three structural alternatives | Compare the same rows and filters in A/B/C; record preferred title position, action placement, wrapping and visible row count |
| P09 | Before comparison | Switch to Before on each view; original headings and control placement return, with no duplicate primary action |
| P10 | URL and keyboard switcher | Cycle both directions, including wraparound; reload; copy the URL; verify text-field and menu arrow keys still do their normal job |
| P11 | In-app review and state | Open Changes & verification, read the design tradeoff, click a creation control, and inspect the simulated-action status |
| P12 | Simulated mutations | Click a creation control; no creation page or save occurs. Other browser write requests return a prototype response. This demonstrates layout, not production mutation behavior |
| P13 | Narrow/wide and theme behavior | Use the viewport matrix below; check wrapping, focus visibility, control overlap, long labels and action-panel width |
| P14 | Swedish and English | Replace `/sv/` with `/en/` in each URL; compare primary and secondary labels, especially B's wrapping |
| P15 | Developer Mode markers | Enable Developer Mode; inspect the header action, list toolbar and variant switcher markers; marker naming remains English |
| P16 | Isolation and launch | Run the one-command launcher in the worktree; verify port 3001 and branch name. The main checkout has no prototype edits |
| P17 | Development-only rendering | Review the `NODE_ENV` and prototype-flag gates; ordinary development without the prototype flag and production rendering use the original list layouts |

<!-- markdownlint-enable MD013 -->

The new header is outside the library loading/error/empty content, so its
identity is independent of rows arriving. The library still depends on the
normal app's data services. The prototype does not introduce a fixture editor,
new persistence, new permissions or changes to lifecycle transitions.

### Viewport matrix

Use browser developer tools to set **1440 × 900**, then **1920 × 1080**.
For each size, compare Before/A/B/C with the same data, in light and dark themes,
with the navigation both expanded and collapsed. Compare at the top and after
scrolling; the review bar is intentionally separate from the candidate design.

Also try **390 × 844** and **320 × 800**, and use the English locale for longer
labels. The data grid may scroll horizontally as in the existing app; page
headers, primary controls and the prototype bar should fit the viewport.
For long-content checks, use existing long names/descriptions rather than
editing stored data. Ctrl/Cmd+click direct links to compare windows side by side.

### Scope and limits

The app's normal reads, authentication, filters and menus are reused. Creation,
import, AI-generation and export toolbar triggers are simulated, and browser
write requests are intercepted for the throwaway session. This is a UI aid,
not a server authorization mechanism. It does not prove real submissions,
permission enforcement, report generation or status transitions. Existing app
view preferences may still use their normal browser storage; prototype variant
and review state do not add new storage.

No automated test suite or manual-case changes are added to this throwaway
branch, as required by the prototype skill. Type checks, focused linting and
browser observations are recorded separately. A production implementation must
receive the full test and manual-case coverage specified in the agent brief.

Issue #1354 retains the requirement-area row and column work. This prototype changes
its header only. Other administration lists and detail views retain their
original rendering.

## Review outcome

Pending user review. Suggested starting point: A. Consider B if labelled
secondary controls fit the intended working width. C is an explicit width
tradeoff, not an accepted change to the issue's scope.

The full prototype belongs on this throwaway branch. After a design decision,
record the selected variant and rationale on the issue and implement it with
production tests; do not merge the exploratory code wholesale.

## Files changed

<!-- markdownlint-disable MD013 -->

| Files or component | Purpose | Checklist |
| --- | --- | --- |
| `Prototype1345.tsx` and `Prototype1345.css` | Three headers, shared switcher, action simulation, review panel and responsive styling | P01–P06, P08–P15 |
| Locale layout | Mount the development-only prototype provider inside the normal app shell | P10–P12, P17 |
| `ListWorkspace` | Remove the floating-rail gutter for candidates and reserve C's panel width | P03, P08, P13 |
| `RequirementsClient` | Add the library heading and named primary control | P01–P04 |
| `RequirementsTable` | Send the existing secondary controls to the candidate toolbar; keep menus and table behavior | P04–P07 |
| Kravpaket, Normbibliotek and Kravunderlag clients | Swap header and creation presentation only when a candidate is active | P02–P03, P09 |
| `CrudAdminPanel` | Scope the precise creation label and candidate header to Kravområden | P02–P03, P09 |
| Swedish and English message catalogs | Prototype explanations and controls in both locales | P10–P14 |
| `package.json` and `prototype-1345.mjs` | One-command development launcher on port 3001 | P16–P17 |
| This guide, `review.html` and `evidence` | Full change inventory, comparison gallery, screenshots and browser observations | All |

<!-- markdownlint-enable MD013 -->

## Verification recorded for this prototype

Browser inspection uses Chromium and the development administrator account.
The evidence folder contains screenshots and machine-readable observations.

- All five views render in Before/A/B/C: 20 combinations at 1440 × 900.
  Every candidate has one page heading and one primary button; the library
  has all five secondary controls. No page-level horizontal overflow is
  observed at this size.
- The original library has no page heading; all three candidates display
  Kravbibliotek. The other four page titles remain correct.
- Reports and Columns open in A/B/C. Creation controls report a simulated
  action. A sample POST returns the prototype response without a network POST.
- Library A/B/C also receive 1440/1920 dark-theme checks with expanded
  navigation. A additionally has a 1920 dark/collapsed capture. Header actions
  remain within the viewport in these observations.
- A is checked at 390 and 320 px; B/C at 320 px with English labels. The page
  and primary controls remain within the viewport. The data grid retains its
  existing horizontal scrolling.
- Left/Right variant cycling, wraparound and reload retention work. Arrow
  navigation in a text field leaves the selected variant unchanged.
- The offline gallery loads all 15 candidate/baseline pairings.
- The 20-view browser pass reports no JavaScript page errors.
- TypeScript, focused Biome checks, documentation spelling and Markdown
  linting are checked. No production test suite is added or run for this
  throwaway study.

The full cross-product of themes, locales, sizes and roles is not verified.
Real mutation behavior, production builds and the complete permission matrix
remain outside this layout study. The checklist above is the review procedure,
not a claim that every future production acceptance criterion has passed.
