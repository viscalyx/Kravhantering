# Administration layout prototype — issue #1359

This throwaway prototype asks which structure makes column settings easiest
to scan and adjust. It contains the current layout and three alternatives.
No production design has been selected. The prototype is on branch
`prototype/issue-1359-admin-layout`, based on `daaf0d50`.

## Start and show it

From the prepared worktree, run:

```sh
cd '/mnt/krav-azure-dev-data/.worktrees/issue-1359-admin-layout'
npm run prototype:admin
```

The command starts both review surfaces:

- [Before/after comparison and checklist](http://localhost:3140): no sign-in
  required. Choose a layout, window size, navigation state and theme; move
  the divider to compare the original with the alternative. Select actual
  size to inspect the captured pixels without scaling.
- [Interactive prototype](http://localhost:3139/sv/admin?variant=A): sign in
  to the [existing development app](http://localhost:3000/sv/admin) first,
  then return to this link in the same browser. The existing localhost
  session also works on the preview port. If the session expires, sign in
  on port 3000 again and return to port 3139.

For this remote workspace, forward **3139** and **3140** in the VS Code Ports
panel. Use the localhost addresses above so the authentication cookie stays
on the same host. Stop with Ctrl+C in the preview terminal. This stops the
prototype and gallery without stopping the existing development app.

The launcher uses the existing SQL Server and Keycloak services. It makes
read-only links to the primary checkout's local environment files and keeps
its own dependency directory, build output and dev process. It does not
start, stop, reset or migrate shared services. On another prepared checkout,
use the same npm command; missing dependencies are installed or copied from
the primary worktree. Both local environment files remain read-only.

Optional port overrides: `PROTOTYPE_PORT` (default 3139) and
`PROTOTYPE_GALLERY_PORT` (default 3140). The gallery's live links use the
default preview port; adjust the address when using an override.

## Layouts

<!-- markdownlint-disable MD013 -->

| URL parameter | Layout | What to assess |
| --- | --- | --- |
| `variant=0` | Current | Original decorated header and individual column cards. Baseline controls still use the preview's simulated Save. |
| `variant=A` | Compact rows | Plain underline tabs, flat rows, aligned controls and actions above the list. Closest to the issue's proposed layout. |
| `variant=B` | Settings table | Two-line header, numbered table, column headings, alternating backgrounds and bottom action bar. |
| `variant=C` | Split workspace | Compact header with accent line; description, visibility count and actions on the left; rows start earlier on the right. |

<!-- markdownlint-enable MD013 -->

Use the bottom toolbar or Left/Right to switch. Arrow shortcuts leave inputs,
editable text, dialogs and the admin tab list alone. Within the tab list,
Left/Right and Home/End navigate tabs. Variant links survive reloads. Column
edits survive variant switches while the Columns panel stays mounted; leaving
Columns or reloading discards them.

The toolbar's **Long labels** adds synthetic display text without changing
column identifiers or stored data. **State & question** displays the variant,
active panel, long-label setting, complete column draft, saved baseline,
dirty state, loading state and local save state. The same state is printed
to the browser console. **Hide tools** gives a clearer view; use the remaining
small button to bring the toolbar back.

## All changes and how to verify them

<!-- markdownlint-disable MD013 -->

| Change | Verification |
| --- | --- |
| Less page-top spacing | Compare 0 with A/B/C at 1440 × 900 and 1920 × 1080. The title and settings begin earlier. |
| Smaller header typography and decoration | Compare the title, gradient, shadows, rounded frame and nested tab frame. The description and all tab labels remain. |
| Compact tabs and active marking | At 1920 pixels, check all nine tabs with expanded and collapsed navigation. Focus Columns and use arrow keys. A uses an underline, B a tab edge, C an outline. |
| A: flat setting rows | Compare its 56-pixel rows and thin separators against the original 78-pixel cards with 12-pixel gaps. Save/Reset remain above. |
| B: settings table | Check row numbers, headings, alternating backgrounds, 48-pixel rows and the bottom action bar. Scroll to reach the final row. At mobile width, the table scrolls horizontally inside its frame. |
| C: split panel | Check the description, visible count and action column on the left. Toggle visibility and observe the count. Narrowing the viewport moves that block above the settings. |
| Aligned controls | Compare a locked row with an editable row. Up/Down controls should stay in the same horizontal columns. |
| Secondary technical keys | Enable Long labels and inspect names and keys in each layout, especially C's narrower name area. Disable it to return to real labels. |
| Smaller ordering buttons | Move Requirement area up/down; verify its position changes. First Up and last Down stay disabled. Buttons are 32 × 32 pixels. |
| Plain visibility control | Toggle an editable checkbox with a click and with Space. Requirement ID and Requirement text remain locked with explanatory text; A/B/C also show a lock icon. |
| Simulated Save | Edit a row, then Save. The preview reports a local save and disables Save. In browser Network, no admin write request is sent. Reload restores the application's original values. |
| Reset remains an unsaved edit | Save a reordered draft, then Reset. Save becomes enabled again. Inspect state to compare the draft with the local baseline. |
| Variant switcher and state | Edit a value, switch A/B/C and inspect the state. The layout URL changes while the draft stays. Reload retains the variant and reloads application data. |
| Read-only previews of other panels | Open Identity or Taxonomy. The shared header uses the selected layout, while panel controls are inert. Only Columns is interactive in this prototype. |
| Developer Mode markers | Turn on Developer Mode and inspect the layout, switcher, tab-panel and row markers. |
| Language, theme and responsive behavior | Use Swedish and English, light/dark theme and both rail states. The gallery includes desktop comparisons, plus English, long-label and 320-pixel samples. |
| Isolated preview tooling | Check port 3000 remains available while 3139/3140 run. The main checkout is unchanged. Ctrl+C stops only the preview processes. |
| Review artifacts | Open the gallery, move the comparison slider, select each combination, use actual-size mode, and open the three difficult-case image links. The full checklist is also available there. |

<!-- markdownlint-enable MD013 -->

## Measured comparison

Captured in Chromium with Swedish, the existing 15-column data set and the
expanded navigation rail. These measurements are identical in light and dark
themes. The review toolbar is hidden in captures. Counts exclude rows covered
by B's bottom action bar.

<!-- markdownlint-disable MD013 -->

| Layout | Header at 1440 | Full rows at 1440 × 900 | Full rows at 1920 × 1080 |
| --- | --- | --- | --- |
| Current | 212 px | 5 | 8 |
| A — compact rows | 93 px | 12 | 15 |
| B — settings table | 133 px | 11 | 15 |
| C — split workspace | 92 px | 13 | 15 |

<!-- markdownlint-enable MD013 -->

A is the most direct interpretation of the issue. B emphasizes table scanning
and keeps actions at the bottom, which uses some visible row space. C exposes
the most rows at the smaller desktop size, at the cost of horizontal space
for column names. Choosing among these tradeoffs remains the user's decision.
No choice has been folded into production code.

## Verification performed

- 41 screenshots: 32 desktop combinations (four layouts × two sizes × two
  rail states × two themes), plus long-label, English and mobile captures for
  A/B/C.
- All captured pages fit the viewport horizontally; B intentionally has an
  internal horizontal table scrollbar on mobile. All nine tabs fit one row
  at 1920 pixels in every layout and rail/theme combination.
- Browser exercises passed for all four layouts: reorder, visibility, locked
  columns, first/last boundaries, local Save, Reset dirty state, and reload.
  Application column data compared equal before and after preview saves.
- Variant URL switching, arrow shortcuts, input shortcut exclusion,
  keyboard tab navigation, an inert Identity preview and the state inspector
  were checked. No browser page errors or admin write requests were observed.
- TypeScript and focused formatting/lint checks passed. This is a throwaway
  UI investigation; no production tests or shared manual cases were added.
  The full application test suite and production accessibility audit were
  not run. Authentication and authorization implementations are unchanged;
  the full role matrix was not retested.

To regenerate captures against the running preview:

```sh
npm run prototype:admin:capture
```

The script uses the existing development sign-in helper and Chromium. It
updates the saved screenshots, measurement JSON and gallery data. The gallery
itself also works offline by opening
[its HTML file](../../../../public/prototype-admin-layout/index.html) in a
browser. Keep the surrounding files alongside it.

## File inventory

- `AdminClient`: prototype wrapper, header marker, preview-only keyboard tab
  handling and inert non-Columns panel wrapper.
- `ColumnsPanel`: context-aware rendering, local Save branch, state reporting
  and long-label display fixture. Its existing data loading and edit logic
  remain the source of the column draft.
- `admin-layout-prototype.tsx`: development-only context, variant URL,
  state inspector and review toolbar.
- `column-layout-variants.tsx`: A/B/C presentations of the shared draft.
- `admin-layout-prototype.module.css`: scoped layout experiments.
- `PrototypeSwitcher`: shared floating review controls and keyboard cycling.
- English/Swedish messages: prototype labels and explanations.
- `prototype-admin.mjs` and npm scripts: isolated startup and shutdown.
- `prototype-admin-capture.mjs`: reproducible browser exercise and captures.
- `public/prototype-admin-layout`: static viewer, full checklist, screenshots
  and machine-readable verification results.
- This document: setup, complete change list, verification and open decision.

Prototype behavior requires development mode and
`NEXT_PUBLIC_ADMIN_LAYOUT_PROTOTYPE=true`, supplied by the launcher. The
switcher is also explicitly gated out of production. This branch is a
primary source for the later implementation, not a production-ready patch.
