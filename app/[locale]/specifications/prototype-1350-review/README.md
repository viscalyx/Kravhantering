# Issue 1350: visual prototype and review guide

This throwaway prototype asks which layout makes specification names and
responsibility easiest to scan. The agreed prototype scope shows names,
responsibility, classifications and
actions, sorted by specification name in ascending locale-aware order.
Requirement areas, requirements and requirement counts are omitted in every
option, including the simplified reference. A final layout is not selected.

## Open the running prototype

[Open combined prototype D](http://localhost:3001/sv/specifications?variant=D).
Sign in with the usual development account if prompted. The prototype uses
the existing Keycloak client registered for port 3001.

To start it again, run:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/issue-1350-prototype
npm run prototype:1350
```

Port 3001 must be free. Stop this process with Ctrl+C. The main checkout and
its port 3000 server are separate. SQL Server and Keycloak are reused without
resetting, reseeding, or changing their configuration. Local environment
settings are read from the primary checkout; its environment files are not
modified. Dependencies are already installed in this worktree.

For a fresh checkout elsewhere, install the repository dependencies and follow
its existing development service setup first. The launcher uses the tracked
port 3001 authentication profile and the primary checkout's local settings.

If your browser is on another machine, forward port 3001 alongside the normal
Keycloak port 8080 using the editor's Ports panel. Keep the local forwarded
port as 3001, since that is the registered login callback.

## Compare the options

<!-- markdownlint-disable MD013 -->

| URL parameter | Structure | Main tradeoff |
| --- | --- | --- |
| `variant=baseline` | Six-column simplified reference | Uses the same reduced information as every option; it is not a production-page clone. |
| `variant=A` | Compact table | Allocates space to names by stacking classifications; individual classification labels are less prominent. |
| `variant=B` | Two-level rows | Gives names a broad first line and metadata explicit labels below; rows are taller. |
| `variant=C` | Two-column card grid | Separates individual specifications clearly; comparing many items takes more scrolling. |
| `variant=D` | Combined view selector | Switches between the reference table, B and C inside one prototype, preserving data and search. |

<!-- markdownlint-enable MD013 -->

Use the floating bottom bar or Left/Right arrow keys to switch. The URL updates
and can be shared or reloaded. Arrow keys inside input fields keep their usual
behavior. Search survives variant switches; a full reload
resets in-memory review state.

Use **Representativa exempel** for the same seven examples in every option.
Use **Verkliga data (läsning)** to inspect the current authenticated catalog.
Both choices use the application's real shell, navigation and theme. The live
option respects the existing server-side data access and row permissions.

Names, create, edit, delete and co-author controls show a local preview
message. They do not navigate to editing workflows or save changes. This lets
you inspect action placement without changing the database. Existing shell
controls retain their normal behavior.

Open **Ändringar och granskningslista** for an in-page checklist, or **Visa
tillstånd** for the current variant, data source, filter, sort order,
viewport, visible row IDs and last preview action. Prototype controls are
clearly labeled and have Developer Mode markers.

## Prototype D: one page, three views

[Open D](http://localhost:3001/sv/specifications?variant=D). Three icon buttons
appear immediately to the right of **Kravunderlag**:

- Table icon: the simplified reference table.
- Two-row icon: the two-level rows from B.
- Grid icon: the cards from C.

These controls change the view inside D. The outer prototype selection and
`variant=D` URL stay the same. The selected icon has a border, check mark and
pressed state; hover text names each view. Search, selected data source and
ascending name order stay intact while switching. In each of D's three views,
the specification code uses muted monospace text. In two-level rows, it follows
the name on the same line when space allows and wraps below as space decreases.
In tables and cards, it sits below the name. Cards place their existing actions
at the top right beside the name and code. D opens in table view after a full
reload; the view selection is in memory for this throwaway prototype.

Tab focuses the selected icon. Left/Right move between the three views;
Home/End select the first/last view. Those keys stay within D when this control
has focus, while the floating bottom bar still selects the overall prototype.

To verify the combination: filter by Upphandling, switch through all three
icons, and confirm the same three example names appear in the same order.
Repeat with live data. Check that the address still contains `variant=D`.

## Every change and how to verify it

<!-- markdownlint-disable MD013 -->

| Change | Where | How to verify | Expected observation |
| --- | --- | --- | --- |
| Specification code | All three views in D | Switch views and resize the window, checking short and long names. | Codes use smaller, muted monospace text. Two-level rows place the code after the name if it fits, otherwise below. Tables and cards place it below. |
| Card actions at the top | Cards in C and D | Inspect the top right of each card; Tab to the permitted actions and activate a preview. | Actions sit beside the name and code without overlap, with no separate action footer. |
| Combined view selector | D | Click the three icons beside the title, then try Left/Right and Home/End. | The view changes between reference, B and C while D, the filter, data source and name order stay selected. |
| Ascending name order | All | Compare names in 0/A/B/C and each view in D, then filter and switch to live data. | Names follow ascending locale-aware order; Swedish Å, Ä and Ö follow Z. |
| Focused list contents | All | Inspect row content in every option, including the reference. | Each specification shows name, responsibility, classifications and permitted actions; D also shows its code beside or below the name. |
| More space for names | A | Compare 0 and A at 1440 × 900 with navigation expanded. Read the long information-exchange example. | Names receive the remaining table width; classifications occupy one column instead of three. |
| Alternative information hierarchy | B | Read the long information-exchange example and its second line. | Name, responsible person and actions lead; labeled classifications appear below. |
| Alternative browsing layout | C | Compare at 1440 and 1920 pixels; then narrow to 375 pixels. | Two cards per row on desktop and one on mobile. The tradeoff is reduced list density. |
| Stable responsibility block | A/B/C | Inspect the responsible people, especially the long personal name. | Person name appears above a smaller HSA-id. Long names can wrap independently. |
| HSA-id wrapping | A/B/C | Compare Karl Persson with the baseline; inspect the exceptionally long HSA-id for Alexandra. | Normal identifiers stay on one line. An unusually long identifier remains accessible through local horizontal scrolling. |
| Missing and anonymized names | All | Inspect API Gateway and Digital workplace; also open `/en/specifications?variant=A`. | Missing names retain the HSA-id. The sentinel is displayed as Anonym/Anonymous. |
| All three classifications retained | A/B/C | Compare the three baseline columns with each option. | A stacks values under one heading. B/C show individual labels and the same values. |
| Smaller action controls | A/B/C | Compare 0 and A; Tab to edit/delete and inspect hover labels. | Actions are 28 × 28 pixels instead of 44 × 44. Focus remains visible. |
| Stable action slots | A/B/C | Compare rows with three, two and no actions. | Missing permissions leave reserved space; actions do not move into different slots. |
| Heading/search alignment | A/B/C | Compare the top of 0 and A. | Title and search occupy one horizontal toolbar on desktop; they stack on narrow screens. |
| Search, clear and empty state | All | Search API, clear, then search a nonexistent name. | One example, all seven examples, then a clear empty state. |
| Search focus outline | All, including D | Click the search input, then use Tab and Shift+Tab in both themes. | One continuous outline surrounds the complete search box; help and clear buttons retain their own keyboard focus marks. |
| Filter help | All | Activate the information button beside search. | Explanatory text appears without changing the filter. |
| Real catalog option | All | Choose live data, filter by a known name and switch variants. | The same authorized catalog is shown in each layout. No example rows are written to the catalog. |
| Safe previews | All | Click create, name, co-authors, edit and delete. | Only the local preview message changes; no database mutation request is sent. |
| Keyboard variant selection | All | Focus a non-input control and press Left/Right. Repeat while editing search. | Outside inputs the variant changes and wraps; inside search the caret moves. |
| Shareable variant | All | Copy the URL, reload and compare the selected button. | The variant is retained in `?variant=`; transient filter state resets. |
| Existing navigation and theme | All | Use the app sidebar controls at both desktop sizes and in both themes. | The layout responds to actual available width and light/dark colors. |
| State inspection | All | Open Visa tillstånd and interact with search and actions. | The displayed JSON reflects the current review state. |
| Isolated development route | Worktree | Open `/sv/specifications` without `variant`. | The original client is used. The prototype route branch is disabled in production mode. |

<!-- markdownlint-enable MD013 -->

## Suggested ten-minute review

1. Open D with the example data at 1440 × 900 and expand navigation.
   Try its three title icons before comparing the separate options below.
2. Switch between 0 and A; compare name width, identifier wrapping and actions.
3. Read the longest name and person name. Check alphabetical name order.
4. Compare B and C. Decide whether explicit labels or card separation justify
   their extra height.
5. Repeat at 1920 × 1080, with navigation collapsed and in dark mode.
6. Switch to live data and search for a familiar specification.
7. Try the keyboard, empty filter results and action previews.
8. Record a preferred variant, any parts to borrow, and any remaining problems.

## Screenshots and verification

[Open the screenshot gallery](./index.html) locally in a browser. It needs no
server or login and contains only fictional example data. Each screenshot has
an exact viewport size and theme label. Open the full-size image to inspect
text; a fitted preview is scaled down.

[Verification results](./verification.json) record the browser measurements
and interaction results. These are exploratory browser checks, not a committed
regression suite or a full accessibility audit. The prototype skill deliberately
omits production tests; a chosen design needs production implementation and
matching automated/manual coverage before merging.

Observed on 2026-09-19: 32 desktop combinations (four layouts, two sizes,
two navigation states and two themes) plus four mobile layouts at 375 pixels
have no page-level horizontal overflow. The browser reports no uncaught errors
and sends no mutation requests during prototype interactions. Live data loads
26 authorized specifications in this verification run. Filtering, clearing, empty
results, keyboard switching, ascending name order, action previews,
English identity fallbacks and URL reload behavior are exercised.

TypeScript, targeted Biome checks, Markdown lint and guide spelling checks pass.
The full production regression suite is not run for this throwaway prototype.

The baseline is a presentation reference recreated around the same safe
preview controls and examples. It uses the agreed reduced information and empty
action slots, so it is not
pixel-identical to the current production list. The original
page remains available without the variant parameter for an exact comparison
using live data.

[D verification results](./verification-D.json) cover its three internal views
at both desktop sizes, navigation states and themes, plus mobile layouts.
They also cover icon placement, selected state, keyboard focus, preserved
filter/data and keeping the outer prototype set to D. The gallery includes
nine D desktop captures in addition to the twelve separate-option captures.
Code placement is checked across widths from 320 to 1920 pixels, including
inline and wrapped positions in two-level rows. See the
[narrow two-level view](./captures/D-B-375-dark.png). Card actions are checked
for alignment beside the title.

[Search focus verification](./verification-focus.json) covers mouse and keyboard
focus, the help button, filtering and clearing in light and dark themes.
The focus outline surrounds the complete search control, including its icons.
See the [light-theme focus capture](./captures/D-search-focus-light.png) and
[dark-theme focus capture](./captures/D-search-focus-dark.png).

## Code and scope

<!-- markdownlint-disable MD013 -->

| File | Purpose |
| --- | --- |
| `page.tsx` | Gates the rendering branch by development mode and query parameter; retains existing loading and authorization. |
| `prototype-1350.tsx` | Reference, A/B/C layouts, combined D selector and local interactions. |
| `prototype-1350.module.css` | Isolated layout and theme styles. |
| `prototype-1350.data.ts` | Seven in-memory examples covering names, responsibility and permissions. |
| `prototype-1350.start.mjs` | Starts a separate server using existing environment and login configuration. |
| `Prototype1350Switcher.tsx` | URL-aware floating switcher and keyboard controls. |
| `messages/en.json`, `messages/sv.json` | Prototype labels and review checklist. |
| `package.json` | Adds `npm run prototype:1350`. |
| This review directory | Guide, screenshots, gallery and measured verification. |

<!-- markdownlint-enable MD013 -->

Branch: `prototype/issue-1350`, based on `dea4eb4b` from the working checkout.
The main checkout has no prototype changes. No winner is promoted. The
provisional design hypothesis is A for density, B for explicit labels, and C
for inspecting individual items; the user's visual review decides the answer.
