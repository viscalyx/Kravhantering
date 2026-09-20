# Issue 1352: proportions and labels prototype

This is a throwaway visual experiment on the existing specification detail
route. It compares five answers to: **how can needs reference and both
requirement texts remain readable without cramped header metadata?**

**Prototype E is the selected design for issue 1352.** Keep the issue open
until production implementation is complete. This branch preserves the
reviewed prototype; implement E with normal production tests.

## Open the review

The review worktree and preview servers were removed after approval.
Recreate a review checkout from the main repository:

```bash
git fetch origin prototype/1352-proportions
git worktree add --detach /mnt/krav-azure-dev-data/.worktrees/prototype-1352-proportions FETCH_HEAD
cd /mnt/krav-azure-dev-data/.worktrees/prototype-1352-proportions
npm ci
npm run prototype:1352
```

- [Start with the comparison gallery](http://localhost:3136).
- [Interactive A: wide table](http://localhost:3001/sv/specifications/8?variant=A).
- [Interactive B: text first](http://localhost:3001/sv/specifications/8?variant=B).
- [Interactive C: reading cards](http://localhost:3001/sv/specifications/8?variant=C).
- [Current layout](http://localhost:3001/sv/specifications/8?variant=0).
- [A table with C header](http://localhost:3001/sv/specifications/8?variant=A&header=C).

The existing development SQL Server and Keycloak services must be running.
The launcher reads the primary checkout's local development configuration;
it does not edit environment files, migrate, seed, or restart services.
Sign in with the development administrator `ada.admin` / `devpass`.
Use the browser's actual viewport size, not merely its outer window size.
When using a remote workspace, forward ports 3001 and 3136.

Stop only this worktree's preview with:

```bash
npm run prototype:1352:stop
```

The gallery also works offline: double-click [index.html](index.html).
It embeds measurements and loads the adjacent PNGs. Live links still need
the running preview. Open full-size images to judge text at native resolution;
the comparison slider scales images to fit your current window.

## Variants

<!-- markdownlint-disable MD013 -->
| Variant | Panels | Header structure | Requirement presentation | Main tradeoff |
| --- | --- | --- | --- | --- |
| 0 | 50/50 | Existing separate metadata boxes | Existing table defaults | Reference is off-screen |
| A | 60/40 | Full-width, flat metadata band | Compact conventional table; reference immediately after text | Some horizontal scrolling for area/status at 1440 |
| B | 55/45 | Two-column definition list beside title | ID/area above text; reference/status below | Taller records, fewer visible rows |
| C | 50/50 | Inline properties below title | Bounded cards with full-width text and labeled reference/status footer | Lowest row density |
| D | 60/40 | Title left, description beside it; original metadata boxes underneath | Same compact table as A | Original boxes retain their styling and consume header space |
| E | 60/40 | Collapsed: one box with lifecycle and Agreement summary rows; expanded: description below title, then full metadata | Same compact table as D | Agreement selection stays available; add/edit Agreement actions require expansion |
<!-- markdownlint-enable MD013 -->

The proposals keep requirement text at 14 px. A/B/C metadata labels use normal
case at 12 px; D/E retain the original boxes and their label styling. C reduces
English tab side padding so all three labels fit.
The existing business data, actions, tabs and panel roles remain.
Reference moves before area in all proposals; no default field is removed.

A, D and E use initial column widths of 112 px for ID, 280 for text, 160 for reference,
120 for area and 110 for usage status, plus the existing 36 px selection
column. The right table uses the corresponding ID/text/area widths. Spare
width can still grow the text column. B and C reflow the real cells to the
available panel width instead of using those widths as horizontal tracks.

This is a presentation experiment, not a proposal to introduce new
permanent list modes or a new manual column-resize feature.

## Review controls

- Click a variant or use left/right arrows outside interactive controls.
  Inputs, selects, tabs, sliders and the panel divider retain their own keys.
- **State & changes** shows the variant, viewport, navigation, theme, panel
  widths, table overflow, column geometry, tabs, metadata and write policy.
  Relevant state is also logged on each variant switch.
- Inside State & changes, **Mix header** selects A, B, C, D or E independently.
  For example, `?variant=A&header=C` combines the conventional table with
  inline metadata. Switching the main variant clears this override.
- **Long text** temporarily replaces the title with exactly 150 characters
  and the description below it with exactly 300 characters in both languages.
  It also previews a registered mock Agreement with reference, effective
  date and current status. Expand E to access Agreement details for its description,
  registration/confirmation information and correction history. The selector
  includes a previous mock agreement. Mock selection does not change the
  requirement lists, and mock actions never call the API. Toggling Long text
  off restores the real Agreement display.
  It also replaces the first two requirement descriptions with multiline
  examples. It affects both the baseline and proposals, never saves, and can
  be toggled off.
- **Reset** restores the chosen variant's panel proportions and opens both
  panels. It also clears a mixed header selection.
- **H** hides/shows the floating bar. Add `review=clean` for clean captures.
- Shareable query parameters: `variant=0|A|B|C`, `header=A|B|C`,
  `nav=collapsed|expanded`, `theme=light|dark`, `sample=long`.
  Use `/en/specifications/8` to review English labels.

## Complete change and verification checklist

### 1. Panel proportions and default column order

Open each proposal at 1440 × 900 with navigation expanded. Inspect the state
panel. A starts at 60/40, B at 55/45 and C at 50/50, subject to the existing
400 px minimum panel constraint. Needs reference is visible beside/below the
text. In A, scroll horizontally to reach area and usage status at this size.
At 1920, all A default columns fit.

Drag the divider. Focus it and press ArrowRight: the left panel grows 8 px and
the variant stays unchanged. Collapse/reopen the right panel: the chosen
width returns. Reset restores the variant's initial ratio. The divider's
existing double-click/Home reset still means equal widths; the floating
bar's Reset means the variant default.

### 2. A: metadata band and compact table

Compare A with 0 in the gallery. All five metadata properties remain, with
normal-case labels and a shared band instead of individual boxes. Check the
agreement action and responsible person's name and identity. Read a long
requirement; narrower columns wrap text and therefore show fewer rows.

### 3. B: definition list and text-first records

Compare B with 0. Metadata sits beside the title. Check label/value alignment
and wrapping. Each requirement has its ID and area above its text, then
reference and usage-status fields beneath. Both panels fit horizontally.
Scroll to see the row-density cost. Open a requirement through its ID.

### 4. C: inline metadata and reading cards

Compare C with 0. Metadata flows beneath the title. Each card groups ID,
area, text and reference/status. Both panels fit horizontally, but fewer
requirements fit vertically. Check long text, the card boundaries in dark
mode and access to the full requirement through its ID.

### 5. Narrow filter rows

At 1440 with navigation expanded, inspect the right filter and actions.
They wrap onto separate lines when needed instead of overlapping the package
filter explanation. Filter information and controls remain accessible.
This can increase header height; it is included in the captured row counts.

### 6. Existing workspace behavior

Switch among Requirements in specification, Needs references and RFI question
list. Their tab positions stay stable. Switch the right panel between
Available requirements and Requirement selection questions. Scroll each list
and check that its header stays fixed and the other panel stays still.
Expand a requirement, inspect its detail, then close it. Use the column chooser
and filters without attempting to save business changes.

### 7. Long content, locales, themes and narrow screens

Use Long text in both 0 and a proposal. Check the 150-character title,
300-character description below it and multiline requirement descriptions.
The gallery links to English long-text captures.
Check both 1440 × 900 and 1920 × 1080, navigation expanded/collapsed and
light/dark themes. At 375 px, the panels stack rather than share a row.

### Variant D: title, description and original boxes

Open `?variant=D`. The title occupies the left two fifths of the header row;
the description sits beside it, aligned left with a 24 px gap. The original
metadata boxes (Agreement, governance object, lead, implementation type and
lifecycle status) span the row underneath. D uses A's tables and 60/40 split.

Toggle **Long text** to review a 150-character title and 300-character
description. Check that their top edges align and that all boxes remain below
both texts. Compare the boxes with 0: borders, backgrounds, labels and actions
retain the original appearance. On narrow screens the text and boxes stack.
D is also available through the header mixer, for example `?variant=B&header=D`.

### Variant E: expandable header based on D

Open `?variant=E`. The title, disclosure chevron and specification edit button
sit on the left. A single compact box on the right fits its content and
contains two rows. On desktop it sits 16 px above the title's top edge,
leaving a 16 px margin below the viewport top:

- **Livscykelstatus** (English: **Lifecycle status**) with its value on the right.
- **Avtal** (English: **Agreement**) with **Inget** / **None**, or its effective
  date and status. Only the selector dropdown is shown for registered agreements.

The compact Agreement row omits the reference and add/edit actions. Its
selector still switches between agreements, including previous ones. Expand
the header to see the description below the title, all original metadata
boxes, the full lifecycle label, and Agreement reference/details/add controls.
Specification editing remains available in both states.

Use **Long text** to inspect the mock registered Agreement. Confirm that the
compact rows place bold values directly after their labels, inside one
outer border with no divider. The arrow sits directly after the Agreement
value. Only the arrow opens the selector; the menu
matches the full box width. Use Tab to focus the arrow, then Enter or Space.
Confirm that selecting a previous agreement changes the date/status without
expanding the header. Toggle Long text off to verify the empty Agreement row
has no arrow or click action. On mobile the shared box moves below the title.
The Agreement component stays mounted throughout.

Expansion is preview URL state: `headerDetails=expanded` opens it directly
and survives reload. Variant switching and **Reset** return to collapsed.
E can be mixed with another table, for example `?variant=B&header=E`.

### 8. Preview state and write isolation

Change a view setting, then reload: the preview returns to URL-selected
initial settings. Persistent local/session storage is replaced by memory
before hydration. The real sign-in cookie is still used. Switching variants
starts a fresh panel-width comparison; it does not simulate durable user
preferences.

Application POST/PATCH/PUT/DELETE requests are rejected with 403 before their
route handlers execute. Authentication is allowed. The browser verification
sends an empty PATCH and confirms the prototype-specific denial. Do not use
this preview to evaluate saving, exports requiring POST or business mutations.

### 9. Developer Mode and review tooling

Enable Developer Mode and inspect the metadata summary, text-first records,
reading cards and floating controls. Their curated markers identify the
prototype surfaces. All prototype controls have English and Swedish strings.
The bar and preview activation require development mode and the launcher flag.

### 10. Reproduce the evidence

Keep the launcher running, then use another terminal in this worktree:

```bash
npm run prototype:1352:capture
npm run prototype:1352:verify
npm run type-check
```

Capture regenerates 48 comparison images, measurements and the offline
gallery. Verify exercises browser interactions and writes additional English
long-text/mobile captures and JSON reports, including mock Agreement
details, selection and network isolation. These are prototype review
scripts, not production acceptance tests.

## Measured results

Baseline: `12fbf8228dddf566382e89df7affe4fa1ea6930a`.
Evidence uses Chromium, specification 8, existing SQL Server demodata,
administrator controls and fresh in-memory view state. No user data is
changed. Measurements cover all 48 size/navigation/theme/variant combinations.

At 1440 × 900, navigation expanded, light theme:

<!-- markdownlint-disable MD013 -->
| Variant | Left/right width | Reference visible | Complete rows, left/right | Horizontal overflow, left/right | Panel top |
| --- | --- | --- | --- | --- | --- |
| 0 | 572 / 572 px | No | 11 / 12 | 921 / 541 px | 177 px |
| A | 686 / 458 px | Yes | 7 / 8 | 134 / 92 px | 194 px |
| B | 629 / 515 px | Yes | 3 / 5 | 0 / 0 px | 164 px |
| C | 572 / 572 px | Yes | 2 / 4 | 0 / 0 px | 182 px |
| D | 686 / 458 px | Yes | 7 / 8 | 134 / 92 px | 189 px |
| E (collapsed) | 686 / 458 px | Yes | 8 / 9 | 134 / 92 px | 96 px |
<!-- markdownlint-enable MD013 -->

All three left tab labels fit across the Swedish capture matrix. All proposals
show the needs-reference field initially. Requirement text remains 14 px.
The desktop document has no excess vertical overflow in the capture matrix.

See [all measurements](measurements.json) and
[interaction results](interaction-checks.json). Browser checks cover pointer
and keyboard resize, collapse/restore, variant Reset, stable left tabs,
independent scroll,
fixed headers, expanded details, both tab groups, long-text mode, mutation
rejection, URL switching, reload, mixed headers and the stacked mobile layout.
Focused browser review also checks all gallery controls and loaded images.

## Verdict and limits

**Prototype E was selected by the user.** Use its 60/40 starting panel ratio,
compact tables and expandable header for implementation. The collapsed
header keeps title/editing on the left and one content-sized box on the right.
Lifecycle status and Agreement occupy two tight rows. The Agreement arrow
sits directly after the value; only the arrow opens the full-box-width menu.
The desktop box starts 16 px below the viewport top. Expanded view shows the
description under the title, the original metadata boxes and full Agreement
actions. See the Variant E review steps above for the complete behavior.

The other variants remain comparison evidence. The choice supersedes the
earlier provisional preference for A. No production implementation is included.

The prototype does not prove production preference migration/preservation,
screen-reader table semantics after CSS reflow, every filter combination,
or saving workflows. Those need normal implementation and acceptance tests.
B/C use CSS to reflow table cells; treat them as visual evidence, not reusable
production table architecture. Preview storage and the write block must not
ship as product behavior.

## Source inventory

All files below are on the throwaway branch only.

- `verify-agreement.prototype.mjs`: mock Agreement browser checks and
  screenshots, included in `npm run prototype:1352:verify`.
- `components/specification-agreement.prototype.ts`: mock current/previous
  agreement records and correction history. The Agreement box displays them
  in Long text mode while keeping real list context separate.
- Detail client: gated variant activation, header selection, long-text data,
  table-preview props and panel remount on variant Reset.
- `components/RequirementsTable.tsx`: preview column order/defaults, cell
  labels, record/card markers and fluid B/C table wrappers.
- `components/PrototypeProportionsSwitcher.tsx`: URL switcher, keyboard
  controls, header mixer, state inspector and reset/long-text actions.
- `proportions.prototype.css`: the five headers and list structures,
  filter wrapping, responsive behavior and review controls.
- `instrumentation-client.ts`: in-memory view settings and URL defaults.
- `proxy.ts`: development-only application-write block.
- `messages/en.json` and `messages/sv.json`: preview control translations.
- `package.json`: start, stop, capture and verification commands.
- `run-proportions.prototype.mjs`: app/gallery launcher and shutdown socket.
- `capture-proportions.prototype.mjs`: reproducible comparison captures.
- `verify-proportions.prototype.mjs`: interaction review and extra captures.
- `build-gallery.prototype.mjs`: embeds measurements in the offline gallery.
- `prototype-review/`: this guide, gallery template/generated HTML,
  measurements, interaction reports and captured images.

The launcher uses existing services. Production schema, environment files,
main-checkout source, formal test specifications and manual product test cases
are unchanged; this branch supplies its own throwaway review guide instead.

## Verification record

- TypeScript type checking passes.
- Focused Biome checks pass for the changed code/configuration files.
- Markdown linting and spelling checks pass for this guide.
- All 48 comparison captures retain readable Swedish tabs; all 40 proposal
  captures bring needs reference into view, with no desktop page overflow.
- All five interaction runs pass, including English tab visibility,
  pointer/keyboard resizing, stable left/right tabs, expanded details,
  mixed headers and mobile stacking without horizontal document overflow.
- The gallery's 40 proposal combinations load their images. Its slider works
  at both keyboard endpoints. The evidence includes collapsed and expanded
  header captures.
- D also passes focused checks for title/description alignment, 150/300
  characters, matching original box styling, variant keyboard wrapping and
  mobile stacking. A Swedish long-text capture supplements the English one.
- E passes mouse/Enter/Space, reset, reload and mobile checks in Swedish
  and English, light and dark themes. See [header checks](expandable-header-checks.json).
  Collapsed metadata uses one box with lifecycle above Agreement,
  labels and bold values next to each other and only one outer border. The
  arrow opens a selector as wide as the whole box.
- Mock agreement checks cover registration details, correction history,
  previous-agreement selection and restoring real data. No mutation or
  mock-ID API requests occur; see [mock checks](mock-agreement-checks.json).
- Application mutation attempts return the preview-specific 403 response.
- The isolated launcher's stop and restart commands are verified.

Source branch: `prototype/1352-proportions`. The implementation issue remains
open for implementation; Prototype E is the approved design.
