# Issue 1351: list-height prototype

This guide is for reviewing the layout and choosing a direction. This is
throwaway code on `prototype/1351-list-height`, based on `d39bb52d`.
No design has been approved or promoted to production.

## Open it

From this worktree, run:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/1351-list-height
npm run prototype:1351
```

- [Before/after gallery](http://localhost:3135): no login needed. Choose a
  variant, resolution, navigation state and theme. Drag the comparison slider.
  Original-size images and all measurements are available there.
- [Live baseline](http://localhost:3001/sv/specifications/8?variant=0): sign in
  through the existing local Keycloak realm with `ada.admin` / `devpass`.
- [Live A](http://localhost:3001/sv/specifications/8?variant=A),
  [live B](http://localhost:3001/sv/specifications/8?variant=B),
  [live C](http://localhost:3001/sv/specifications/8?variant=C).

The live page opens both panels. Use the bottom bar or left/right arrows to
switch variants. `Inspect` shows live geometry and state. Press `H` to hide
or restore the bar. Add `&review=clean` to start without the bar.
Input fields, tab buttons, sliders and panel dividers keep their arrow keys.

For remote VS Code, forward ports **3001 and 3135** and open those forwarded
addresses. The gallery's live link assumes a local port mapping; use the
forwarded 3001 address if your forwarding service supplies separate URLs.
The screenshot gallery also opens directly as `index.html` in a browser.

Stop both preview servers with `npm run prototype:1351:stop` from this
worktree, or Ctrl+C in the launch terminal. Existing
SQL Server and Keycloak services stay running. Port 3000 is untouched.
The launcher fails if port 3001 is occupied; it does not kill another server.

Dependencies are installed in this worktree. A fresh checkout needs `npm ci`
and the normal developer services. The launcher reads the primary checkout's
local development environment without modifying its files, and uses the
already-registered Keycloak client for port 3001. It does not seed or migrate.

## What the options answer

- **0: Baseline.** Existing layout, with both panels open for comparison.
- **A: Compact stack.** Keep the original ordering: tabs and actions, package
  filters, then table headings. Reduce padding and button heights.
- **B: Full-width tabs.** Give tabs an entire line with an underline for the
  active tab. Vertical dividers separate the tabs in both panels. Put
  package filters and actions together on the next line.
- **C: Shared shelf.** Move both tab groups above the panels. Combine filters
  and actions inside each panel. The shelf follows the panel widths.

**Provisional recommendation: B.** It gives the labels more horizontal room
while returning almost as much list height as A. C explores a stronger
separation between navigation and list controls, but uses more vertical
space and can wrap its filter summary in narrower panels. Choose based on
live inspection; these measurements do not establish user preference.

## Measured result

The 2026-09-19 captures use Swedish, the administrator demo account,
kravunderlag 8, default columns, both panels open, no active package filter,
and the same existing data. Text remains 14px. Row counts depend on content.

<!-- markdownlint-disable MD013 -->
| Variant | List height at 1440 × 900 | Gain | Fully visible rows, left / right |
| ------- | ------------------------ | ---- | -------------------------------- |
| 0 | 477.5px | — | 10 / 10 |
| A | 566.5px | 89px | 11 / 12 |
| B | 563.5px | 86px | 11 / 12 |
| C | 555.5px | 78px | 11 / 12 |
<!-- markdownlint-enable MD013 -->

This table uses collapsed navigation and light theme. The same gains hold
at 1920 × 1080. C's right panel gains 76px with expanded navigation at 1440
because its filter summary wraps. See [all measurements](measurements.json).

All variants reduce the footer from 85px to 41px and the bottom gap from
40px to 8px. The viewport height calculation changes with the footer;
page overflow falls from 21px to zero at both desktop sizes.

## Every change and how to verify it

<!-- markdownlint-disable MD013 -->
| Change | How to verify | Expected result |
| --- | --- | --- |
| A: compact pill tabs | Switch 0 → A at 1440 × 900; inspect the top of each panel. | Same tab names and actions; shorter header. Compare label truncation with expanded navigation. |
| B: full-width tab strip | Switch to B; select each tab. | Tabs occupy their own row; active tab has an underline. Filters and actions share the next row. |
| B: stable tab placement | Switch between Krav i underlaget, Behovsreferenser and RFI-frågelista repeatedly. | Every tab keeps the same x/y position, width and height, including when the view has a New action. |
| B: shared action-row layout | Switch through all three left-panel tabs. | Each action row starts at the same height and is 37px tall; icon actions are 30 × 30px. Ny belongs to Behovsreferenser; filter, CSV/PDF and lock belong to RFI. |
| B: RFI controls | Select RFI-frågelista and toggle the included-only filter; inspect CSV/PDF links and the lock switch. | The filter still changes state; exports and locking are grouped below the tabs. Group and question actions stay with their content. |
| B: RFI mode text | Select RFI-frågelista, expand navigation and resize the panel. | Mode and explanation sit left of the actions; the row stays 37px high. Long explanations truncate with the full text in a tooltip. |
| B: vertical tab dividers | Inspect both panels in B in both themes. | Two lines separate the three left tabs; one line separates Tillgängliga krav and Kravurvalsfrågor. |
| B: stable right tabs | Switch Tillgängliga krav → Kravurvalsfrågor → Tillgängliga krav. | Both tabs keep exactly the same position and size. |
| C: shared tab shelf | Switch to C; select tabs and drag the panel divider. | Tab groups sit above the panels and follow their widths; collapsed panel's shelf group is hidden. |
| C: flat surfaces | Inspect C in both themes after switching variants. | Backdrop blur is disabled in C to keep Chromium from obscuring adjacent content during grid changes. |
| Smaller actions | Compare 0 with A/B/C; open column and more-action menus. | Header buttons are 30px high; actions remain reachable. Package controls keep their existing sizes. |
| Slimmer package band | Open the right package filter; select several packages, then clear. | Labels, count and selected chips remain available; wrapping can consume some of the gain. |
| Smaller bottom gap | Use Inspect, or compare the last visible row in the gallery. | Gap between panels and footer decreases from 40px to 8px. |
| Smaller footer | Hide the review bar with H and inspect the bottom of the page. | Copyright text remains; footer decreases from 85px to 41px. |
| Corrected page height | At both desktop sizes, compare 0 with a variant. | Both lists gain room and the normal page no longer overflows by 21px. |
| Independent scrolling | Hover each list in turn and use the wheel. | Only that panel scrolls; its header remains fixed. A panel whose content fits needs no scrolling. |
| Unchanged row content | Compare identical rows and column widths between 0 and a variant. | Same text, metadata, text size and wrapping settings. |
| URL variant selection | Copy a variant URL and reload it. | The selected variant returns. Other preview preferences reset. |
| Floating review bar | Use buttons and arrows; press H twice. | Variants cycle and wrap; the bar hides/restores without shifting the layout. |
| State inspector | Open Inspect, resize the window, scroll, and change variant. | Viewport, navigation width, theme, panel/header/list heights, scroll positions, footer and page overflow update. |
| Memory-only preferences | Change a column or panel width, then reload. | Preview preferences reset; normal browser storage is not modified. |
| Read-only preview | Open an edit dialog and try saving, if desired. | The application request is rejected with 403; data is not saved. Login remains functional. |
| Language and markers | Open the English route; enable Developer Mode. | Review controls are translated; prototype controls and shelf have English developer labels. |
| Mobile fallback | Reduce width below 1280px, including 375px. | Existing stacked layout returns; no separate C shelf. Desktop spacing overrides are inactive. |
| Comparison gallery | Select all viewport/navigation/theme combinations and drag the slider. | Corresponding before/after images and numerical changes appear. Original-size links expose the full screenshots. |
| Isolated launch | Run the command, then stop it with Ctrl+C. | Only this worktree's Next server and gallery start/stop; existing services are unchanged. |
<!-- markdownlint-enable MD013 -->

## Verification evidence and limits

- TypeScript type checking passes.
- Targeted Biome checks cover the modified source files.
- 32 browser captures cover 0/A/B/C at both sizes, both themes, and both
  navigation states. No browser page errors occurred during the capture.
- Mouse scrolling verifies independent panels and fixed headers in every
  captured state where content overflows. Both panels are exercised.
- Review controls, keyboard cycling, tab switching, selecting two
  packages, keyboard panel resizing without switching variants, memory-only
  preference reset, and narrow B/C layout fallback pass browser smoke checks.
- An application POST probe returns the prototype's 403 response before it
  can reach application logic.
- This is a throwaway layout exploration, not a production acceptance run.
  No permanent test suite or production manual cases are added, as specified
  by the invoked prototype skill. Full keyboard/accessibility coverage,
  all package-filter states, all tabs, other specifications, and production
  performance still need validation when implementing the chosen design.
- Application authentication and read queries use the existing services.
  Application mutations are blocked. Authentication and normal read-side
  telemetry can still produce their ordinary operational records.
- Existing row content and metadata layout remain as-is; horizontal
  proportions and metadata redesign belong to #1352. C is exploratory,
  not a recommendation to change panel workflows.

## Stable tabs in B

The three left-panel tabs now share the same padding and alignment in every
view. All three views have a 37px action row below the tabs, with 30px-high
controls and 30 × 30px icon buttons. Behovsreferenser places Ny there.
RFI places its included-only filter, CSV/PDF exports and lock switch there.
The mode and explanation sit on one line to their left; long explanations
truncate with an ellipsis and retain the full text as a tooltip.
Group/question actions remain in the content.
The row keeps its height while RFI loads or when no create action is available.
The original vertical offsets were 166.5px, 175px and
171.5px at 1440 × 900. All three now start at 166.5px in that same state.

[Tab geometry evidence](tab-stability.json) covers both desktop sizes, both
themes and both navigation states, including switching back to the list.
Each tab preserves its complete rectangle throughout the switches. The rows
also preserve their top position and height, and the RFI filter still toggles.
Opening New, export destinations, sticky RFI actions, desktop/mobile
relocation, and fallback placement in 0/A/C pass browser smoke checks.
The compact action layout applies to desktop B; other variants and narrow
viewports retain the existing placement.

- [Needs references, light](images/1440-B-needs-references-light.png)
- [Needs references, dark](images/1440-B-needs-references-dark.png)
- [RFI list, light](images/1440-B-rfi-light.png)
- [RFI list, dark](images/1440-B-rfi-dark.png)

## Stable right tabs in B

Tillgängliga krav and Kravurvalsfrågor now use the same header spacing and
collapse-button height. Previously the question view moved both tabs 5px
down and 4px right. Both now stay at the same coordinates. A vertical line
separates the tabs in both themes.

[Right-tab geometry evidence](right-tab-stability.json) covers 24 states:
both desktop sizes, both navigation states, both themes, and switching back.

- [Selection questions, light](images/1440-B-selection-questions-light.png)
- [Selection questions, dark](images/1440-B-selection-questions-dark.png)

## Source inventory

- `requirements-specification-detail-client.tsx`: mounts the switcher and
  C shelf on the existing specification route; retains data loading.
- `specification-rfi-list-panel.tsx`: moves tab-wide RFI controls into B's
  action row on desktop, retaining the existing fallback elsewhere.
- `list-height.prototype.css`: gated desktop layouts and review styling.
- `PrototypeLayoutSwitcher.tsx`: URL controls, keyboard controls, live state
  inspection, and shelf alignment.
- `instrumentation-client.ts`: in-memory preview storage and initial panels.
- `proxy.ts`: development-only prototype application-write guard.
- `messages/en.json` and `messages/sv.json`: review-control translations.
- `package.json` and `run-list-height.prototype.mjs`: one-command launch.
- `prototype-review/`: guide, standalone gallery, images and measurements.

Use `git diff d39bb52d...prototype/1351-list-height` to inspect the complete
prototype changes. The branch is intentionally separate from implementation.
