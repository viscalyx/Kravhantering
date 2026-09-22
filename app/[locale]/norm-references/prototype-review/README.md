# Norm library layout prototype — issue 1358

This throwaway prototype asks: **which layout makes long norm names and
issuers easiest to compare while keeping identifiers and actions readable?**

It is for maintainers reviewing visual design. No variant is approved.
Variant A is the closest candidate to the current implementation brief.
B, C and D deliberately explore alternatives outside that brief.

## Open the prototype

The separate worktree is:

```text
/mnt/krav-azure-dev-data/.worktrees/issue-1358-norm-layout
```

Start it from any directory with one command:

```sh
npm --prefix /mnt/krav-azure-dev-data/.worktrees/issue-1358-norm-layout run prototype:1358
```

1. Sign in at <http://localhost:3000> as the development user you normally use.
   Ada Admin shows the full review surface.
2. Open [variant A](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=A).
3. Use the bottom selector or its arrows to compare layouts. Left and right
   keyboard arrows also cycle, except within editable controls or dialogs.
4. Open **Granskningsguide · ändringar och verifiering** for the checklist.
   Open **Prototypens aktuella tillstånd** below the content to inspect state.

Use the same hostname on ports 3000 and 3138 so the development session cookie
is shared. If redirected to port 3000, finish signing in there and reopen the
prototype link. In a remote VS Code session, forward port **3138** in the
Ports panel if it is not already forwarded. Keep the same hostname convention
for both ports.

Ctrl+C in the launch terminal stops only this prototype server. Its default
port is 3138; `PROTOTYPE_PORT` overrides it if occupied. The launcher reads the
existing `/workspace` development configuration and copies installed
`node_modules` into the worktree if missing. `PROTOTYPE_SOURCE` can identify a
different configured checkout. It does not install services or run migrations.

## Variants

- [Before](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=before):
  the current nine-column structure, automatic widths, original cell padding,
  name/link grid and plain text status. This is a comparison reconstruction;
  the prototype header, controls and safe actions are added around it.
- [A — Weighted table](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=A):
  nine columns with narrower metadata padding, reserved action widths,
  remaining width assigned to name and issuer, and status badges.
- [B — Grouped rows](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=B):
  three broad columns. Name, ID, reference and version form one labelled group;
  issuer and type form another; status, count and actions form the third.
- [C — List and detail](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=C):
  select a norm in the left list to read every field in the right panel.
  The panel follows scrolling on desktop. On narrow screens it sits below
  the list, so reaching the detail may require scrolling past the list.

- [D — Separate identification](http://localhost:3138/sv/requirements/stewardship?tab=norms&variant=D):
  based on B, with name and issuer together in the first column,
  identification in the middle, and status/actions on the right.

Use `/en/` instead of `/sv/` for English controls. Norm names and synthetic
source content remain in their source language, as required by ADR 0008.

## Complete change list and how to verify it

### 1. Separate runtime and development-only entry

Only the separate worktree serves the prototype, on port 3138. The ordinary
norm component still loads its existing data. A development-only environment
flag substitutes the prototype rendering after its hooks run.

Verify: compare the same norm route on port 3000 and port 3138. The prototype
notice and switcher appear on 3138. The flag and `NODE_ENV` gate the rendering;
the switcher is also hidden in production. This branch is not a production PR.

### 2. Width redistribution in A

Metadata columns have explicit widths. The remaining width is shared equally
between name and issuer. Horizontal cell padding falls from 16px to 6px per
side; vertical padding falls from 12px to 8px. Names keep their font size.
The action column shrinks through surrounding spacing, not smaller buttons.

Verify: use 1440 × 900 with expanded navigation, and switch Before/A. Compare
NIS2, GDPR and the long MSB issuer. No name or issuer is truncated or hidden.
Repeat at 1920 × 1080 and observe the extra space reaching the text columns.

### 3. Compact metadata and controlled wrapping

A reserves space for type, version, status and requirement count. Reference
and ID can wrap within their own cells. Counts stay on one line. English
counts need a wider column; A therefore has a 1140px minimum table width in
English and 1040px in Swedish. A horizontal scrollbar can appear with expanded
navigation in the narrower English desktop case.

Verify: turn on **Lägg till gränsfall / Add edge-case examples**. Inspect all
four `PROTOTYPE-*` rows: missing version, distinct ID/reference/version,
long unbroken reference, and counts 0, 1, 14 and 209. Switch language.
Scroll within the table to reach all columns at 320/375px.

### 4. Status badges in A, B and C

Active and archived norms show text and an icon, following the final package
list design from issue 1353. Before retains plain status text. Norm status
continues to use the norm's own `isArchived` value.

Verify: compare `PROTOTYPE-001` and `PROTOTYPE-002`, change theme using the
navigation control, and check both text and icon. Archive/reactivate a row
through its preview action and observe the badge change.

### 5. External links beside the name

All variants retain the name/link relationship. D uses a 24px link target;
the earlier variants retain their 44px target. The
existing URI helper decides whether a link is clickable. The icon has its
existing translated name and opens its destination in a new tab.

Verify: compare a loaded row with a link against a row without one. Inspect
`PROTOTYPE-003`: its URN is intentionally not rendered as a clickable link.
Tab to an external link and observe its focus ring. Example web links lead
to `example.com`; actual loaded links retain their existing destinations.

### 6. Safe previews of existing actions

Edit, archive/reactivate and delete keep their order and 44 × 44px buttons.
The create button occupies the reserved space to the right of the content.
All prototype actions open the existing modal component and change only
local React state. Editing and creation expose the name field only; these
are layout previews rather than complete production forms.

Verify: edit a name, archive/reactivate a norm, delete a row, then create a
row using the plus button. Each dialog identifies itself as a preview.
Use **Apply in memory / Tillämpa i minnet**. Check the list and state panel.
Escape or Cancel closes without applying changes. Focus returns to the
trigger when that trigger remains in the document.

The prototype uses the signed-in app shell but does not reproduce every
production permission or busy-state scenario. Review with Ada Admin;
production authorization testing remains part of implementation.

### 7. Grouped information in B

B replaces separate metadata columns with labelled groups. It gives names
more room but uses more vertical space for each row.

Verify: read the same norm in Before and B. Locate all nine original pieces
of information and controls. Compare several references at once and decide
whether the taller rows are worth the wider text.

### 8. Selection and detail in C

C moves full metadata and actions into a selected detail panel. The list
shows each norm's ID, full name and status. It supports full reading of one
norm rather than simultaneous comparison of every field across rows.

Verify: select NIS2, then another norm by mouse and keyboard. Confirm the
name, issuer, ID, reference, version, count and actions all follow selection.
Filter out the selection and confirm the first remaining norm is shown.
On mobile, scroll below the list to inspect the selected detail.

### 9. Shareable comparison controls

The bottom bar includes previous/next arrows and a labelled variant selector.
It cycles Before → A → B → C → D → Before. The URL records `variant` and
survives
reload. On mobile the bar sits above the development runtime indicator.
Arrow keys do not change variants while editing, choosing a select
option, or interacting with a dialog.

Verify: cycle in both directions, copy a URL, reload, then use the keyboard.
Type into the filter and press left/right: the caret moves, not the variant.

### 10. Filter, edge cases and local reset

The filter searches ID, name, type, reference and issuer. An optional set of
four synthetic records covers edge cases without writing to the database.
**Reset local changes** restores loaded rows and clears the filter/selection;
it keeps the examples checkbox as selected. Reload also clears that checkbox.

Verify: search `PROTOTYPE-002`, then an impossible string for the no-results
state. Clear the filter. Make local edits, switch variants, then reset and
reload. Variant switches retain the edits; reset/reload remove them.

### 11. State and review help

The page includes a translated review checklist and an expandable state
panel. State includes variant, filter, examples, loaded count, visible IDs,
selected norm, last action and every local edit. Developer Mode markers
identify the prototype layouts, status surface and variant switcher.

Verify: expand both panels and perform an action or variant switch. Inspect
the changed state. Enable Developer Mode to inspect the curated markers.

### 12. Captured evidence and run command

The branch contains the launcher, English/Swedish UI copy, this guide,
geometry results and screenshots. The comparison code is next to the norm
page, named `norm-layout.prototype.tsx`. The shared prototype switcher is in
`components/PrototypeVariantSwitcher.tsx`.

Verify: run the command above, open the five links, and compare the captures
in [screenshots](screenshots). Read [desktop measurements](verification.json)
and [interaction checks](interaction-verification.json).

### 13. Separate identification and vertically centered issuer in D

D uses **Name / Identification /
Status and actions**. The name stays at the top, aligned with the first
identification value. The issuer is vertically centered in the name cell. Equal
flexible space
above and below its block keeps it centered; the name stays at the top of
the upper area, with at least 12px separation. Identification contains
separately labelled norm reference
ID, reference, version and type. Type is the last value in that column.

The external link flows immediately after the name text with a 24px target.
The name and first identification value share a 24px line height. The issuer
label uses 12px, matching Reference; the issuer value stays 14px. Status
badges and row-action icons align visually at the top of their cell.
The 44px action targets extend 10px above the badge to align icon centers
with the 24px badge center, within the cell padding. The requirement
count follows the badge on the same line with an 8px gap. The right column
reserves 320px in Swedish and 390px in English to fit full count labels and
actions. Identification uses 27%; the name gets the remaining width. D keeps
a 1000px minimum table width.

Verify: open `variant=D` and compare B/D. Check NIS2 and a row with a long
reference: the name remains at the top while the center of the Issuer block
lines up
with the vertical center of the row. Check that action icons line up
with the center of the status badge while their full targets remain 44px.
Confirm 0/1/14/209 counts
follow the status badge on the same line without overlapping the actions.
Confirm ID, reference,
version and type remain in the middle column. Enable examples to check
wrapping, missing version and long references. Check the URI icon, 24px
target and top alignment in both languages/themes and navigation modes.
On narrow screens, scroll inside the table. Editing and variant switching
still change memory only.

## Review matrix

Use identical data for each Before/A/B/C/D comparison:

- 1440 × 900 and 1920 × 1080.
- Navigation collapsed and expanded.
- Light and dark themes.
- Swedish and English, including the synthetic examples.
- Mouse and keyboard: variant controls, filter, links, selection and dialogs.
- 320px and 375px widths for access to all content and controls.

To set exact dimensions, open browser developer tools, enable the device
viewport toolbar, choose a responsive viewport and enter the width/height.
Use 100% browser zoom. Expand the navigation using its top-left control and
change the theme using its theme control. The default example switch is off
so the base comparison uses the same loaded development data as triage.

## Findings and verification limits

See [RESULTS.md](RESULTS.md) for measured comparisons and representative
screenshots. No winning design is selected. A is the preliminary recommendation
because it addresses the issue while retaining nine-column comparison.
B, C and D answer different reading needs and require an explicit scope
decision.

This is throwaway code. No permanent unit or integration tests, manual cases,
production migrations, environment-file changes or production behavior changes
are included. Browser checks verify this prototype, not the final feature.
The selected design needs a normal production implementation and regression
coverage. The original checkout and its development services remain available.

The primary source is branch `prototype/issue-1358-norm-layout`, based on
`d81b22a3`. The implementation issue is
[#1358](https://github.com/viscalyx/Kravhantering/issues/1358).
