# Issue 1348: requirement-detail layout prototype

Question: which presentation makes a short expanded requirement easier to scan
while leaving more of its surrounding list visible?

This is throwaway UI code on `prototype/issue-1348`, based on
`fix/issue-1347` at `2d9ad75f`. A is approved as the design reference for
implementation; the code remains a prototype.

## Start and show it

The prepared worktree is:

```text
/mnt/krav-azure-dev-data/.worktrees/issue-1348-prototype
```

From any terminal in this environment, run:

```sh
npm --prefix /mnt/krav-azure-dev-data/.worktrees/issue-1348-prototype run prototype:1348
```

The command starts the separate checkout on port 3001. It uses the existing
local SQL Server and Keycloak services and the ignored development environment
configuration prepared in this worktree. Dependencies are copied into this
worktree. It does not reset or seed the database. Stop with Ctrl+C. If another
server owns port 3001, stop that server before launching this one; the command
does not kill other processes. Port 3000 is reserved for your normal app.
The launcher uses the existing local Keycloak client for port 3001 and a
separate prototype session cookie, so both apps can run side by side.

Open the [review gallery](http://localhost:3001/sv/requirements/prototype-1348-review/index.html)
for screenshots, measurements, a before/after slider, and a verification
checklist. The gallery also works offline: open the `index.html` in this
worktree's `public/prototype-1348-review` directory directly in a browser.

Open the [live baseline](http://localhost:3001/sv/requirements?variant=baseline&sections=empty&selected=ANV0002).
Sign in as the existing demo administrator `ada.admin`, password `devpass`.
For a remote workspace, forward port 3001 and the existing Keycloak port 8080
to localhost. The development OIDC callback expects localhost:3001.

The real requirements list, navigation, data loading, permissions and detail
controls provide the context. `selected=ANV0002` opens the example automatically;
the existing app consumes that parameter. After an ordinary page reload, you
may need to click ANV0002 again.

## Compare the alternatives

Use the floating **Prototyp #1348** bar at the bottom. Its arrows or the left
and right keyboard shortcuts cycle through all four views, wrapping at the
ends. Shortcuts leave text inputs, selects, dialogs and other protected
keyboard widgets alone. The selected variant stays in `?variant=`.

- **baseline — Nuvarande layout:** the original rendering.
- **A — Kompakt kort:** a smaller card with grouped metadata tiles, compact
  original-style process arrows beside the requirement-text heading, and
  area information available through an info button.
- **B — Metadata på rad:** no card frame; primary text blocks followed by
  flowing label/value pairs.
- **C — Dokumentlayout:** aligned label/content rows and ruled metadata.

Expand **Jämförelse, exempeldata och granskningsläge** for the sample controls
and the full inspection state. On the baseline, press **Kom ihåg baslinjens
höjd**, then switch variants. The bar shows the current expanded-detail height
and the saved pixels. Measurements update automatically. Baselines live only
in memory and are matched to the requirement/version, sample settings,
viewport and available detail width. Capture a fresh baseline when the data or
view settings change. Reload clears remembered measurements.

The sample controls apply to every variant, including the baseline:

- **Text:** real requirement text or explicitly synthetic long text.
- **Sektioner:** real sections, forced empty sections, or synthetic populated
  norm references, requirement packages and one improvement suggestion.
- **Detaljbredd:** available width or a **760 px split-width simulation**.
  This is a width stress case inside the current page, not a replacement for
  the real specification split workspace.

Use the app's navigation expansion and theme controls to compare actual light
and dark themes and collapsed/expanded navigation. Keep the data, locale,
version, viewport, navigation and scroll position identical when comparing.
For the requested sizes, use the browser's responsive viewport controls at
**1440 × 900** and **1920 × 1080**, with browser zoom at 100%.

## Every change and how to verify it

<!-- markdownlint-disable MD013 -->

| Change | How to verify |
| --- | --- |
| Three structural alternatives plus the actual baseline | Switch baseline/A/B/C on ANV0002. A groups metadata in a card, B flows pairs without a frame, C aligns rows in a document layout. |
| Smaller outer spacing, card padding and gaps | Compare the same short requirement. Watch total detail height and how many following requirements fit in the viewport. |
| Stronger primary text | In A/B/C, requirement text and acceptance text are 16 px with a 1.5 line height. Both precede metadata. Compare with the baseline and switch to long text to inspect wrapping. |
| Full-width primary text in A | Open SÄK0010 in A at 1440 px and 1920 px. Requirement text, acceptance criteria and verification method use the full inner card width, including beneath the process steps. Compare the SÄK0010 before/after captures in the gallery. At narrow widths, text wraps without horizontal overflow. |
| Verification method as a text section in A | Open SÄK0010. Verify the order: requirement text, acceptance criteria, verification method, metadata. The verification method has the same heading/body styles as acceptance criteria and appears once, outside the metadata grid. Compare desktop and mobile wrapping. |
| More compact metadata | Inspect all metadata values, verification method and specification count. A uses a compact grid with area owner inside the info panel; B uses inline pairs; C uses a ruled definition table. |
| Consistent property label size in A | Compare Kravtext, Acceptanskriterium, Verifieringsmetod, Normreferenser and Kravpaket with Verifierbar and the other metadata labels: all use 12 px. Check empty and populated sections in the gallery or live view. |
| Package pills in A | Populate sections and compare the package pills with the available options inside the package filter chooser: rounded ends, 24 px minimum height, 10 px text, 2 px gray border and neutral light/dark colors. Property labels remain 12 px. |
| Compact empty references and packages | Choose empty sections. Both labels and their empty information stay visible on compact rows. Choose populated sections and hover the package to inspect its existing purpose/scope tooltip. |
| Compact empty improvement suggestions | Choose empty sections and compare the card. Its title, empty information and registration button remain. Choose populated sections to inspect the existing suggestion pill and actions. |
| Compact original-style process steps in A | On desktop, inspect the steps to the right of Kravtext on the same heading row. The original outline, icons and configured active color remain; height is 24 px and arrow depth 6 px (baseline: 40 px and 14 px). On narrow cards the steps wrap below the heading. B/C retain their 30 px flat strip. |
| Area information on demand in A | Click the info icon beside the area name. A panel beneath it shows the real area description and area owner. The owner is absent from the closed detail view. Tab to the icon and press Enter; close with Escape or a click outside. Verify Swedish/English and light/dark themes. |
| Existing actions and version history retained | Compare the right action rail and version pill. Available actions still come from the real permission/lifecycle model. Open the registration dialog and navigate it by keyboard. |
| Samples and width stress controls | Switch real/long text and real/empty/populated sections; inspect the displayed state. Switch to 760 px simulation and check wrapping. Return to real data to restore loaded content. |
| Baseline measurement and shareable variant | Remember baseline height, change variant, inspect the height difference and URL. Use arrows to wrap around; reload to verify the chosen variant. Add `selected=ANV0002` to a copied library URL to reopen the example. |
| Prototype writes stopped before the network | Register a sample suggestion and press Save. Expect the explicit prototype message that no data changed. The existing dialog/error presentation is used; successful persistence is not simulated. |
| Developer Mode markers | Enable Developer Mode through the existing app control. Inspect the switcher, primary sections, metadata and reference chips. Marker labels remain English. |
| Existing standalone detail route | Open the standalone link below. Verify section order, populated/empty states and variants outside the expanded table row. |
| Production gate and isolation | The switcher and variant behavior require development mode and the prototype launch flag. Normal `npm run dev` uses the original rendering. All tracked changes belong to the throwaway branch. |

<!-- markdownlint-enable MD013 -->

[Standalone English detail](http://localhost:3001/en/requirements/ANV0002/1?variant=A&sections=populated)

## Current A refinement

The user prefers A and asks for smaller ordinary process arrows beside
Kravtext, plus an area info icon with description and owner in a panel.
The revised desktop example is **574 px** high, compared with **588 px** for
A before this refinement and **824 px** for the baseline. Both desktop sizes
use the same actual ANV0002 text and forced empty sections.

[Open refined A](http://localhost:3001/sv/requirements?variant=A&sections=empty&selected=ANV0002).
The gallery includes open information panels in light/dark themes and at
320/375 px. `refinement-verification.json` records the focused checks for
alignment, arrow geometry, real area information and keyboard dismissal.
The area's existing read API supplies the description when the panel opens;
loading, unavailable-description and read-error messages stay inside it.
The demo area's owner currently resolves to its stored HSA-id display value.

### Text wrapping in SÄK0010

A removes the inherited `75ch` reading-width cap from the primary text
blocks. Verification method is a third full-width section directly below
acceptance criteria, using the same heading and body styles. Text uses the
full inner card width beneath the process-step heading.
At a 1440 px viewport, each block grows from 720 px to 967 px; at 1920 px,
from 720 px to 1447 px. Stored line breaks remain intact.

[Open SÄK0010 in A](http://localhost:3001/sv/requirements?variant=A&selected=S%C3%84K0010).
Before/after screenshots and `sak0010-before.json` / `sak0010-after.json`
record the real requirement text, available width and measured text height.
Before images reconstruct the preceding A layout in the browser with its
75ch cap and metadata placement, matching the initial measured geometry.
The text sections alone save 48 px at 1440 px and 96 px at 1920 px; moving
verification method into its own section also contributes to total height.
`verification-method-check.json` records section order, matching styles and
absence of a duplicate metadata entry. `wrap-stress-verification.json` covers
long content, dark theme, simulated split width and narrow standalone views.

## Evidence and limits

The gallery contains screenshots and machine-readable measurements from the
running worktree. The baseline and candidate desktop screenshots use ANV0002
version 1, its actual primary text, forced empty supporting sections, Swedish
locale, the demo administrator, light theme and collapsed navigation. Their
expanded rows start at the same screen position. Compare these measurements
with each other, not with the historical 2026-09-05 screenshot coordinates.

Additional captures cover long populated content, dark theme, expanded
navigation, simulated split width, English standalone details and a narrow
375 px viewport. Browser verification records live beside the screenshots.

The isolated runtime readiness probe reports `tls_file_invalid` because its
TLS runtime files are unavailable here. The preview verifies UI/database reads
and Keycloak login, not deployment readiness.

The normal data reads and authentication remain active. In this prototype
process, non-authentication writes made through `apiFetch` return a local 409
response before a request is sent. This is a preview convenience, not a server
security boundary. Do not use direct APIs to exercise mutations. Existing
browser preferences, such as navigation expansion and theme, retain their
normal app behavior; sample data and prototype measurements are not saved.

The shared detail-section renderer falls back to the baseline outside the
requirements routes. Actual specification-local details and the real
specification split workspace still require regression verification during
production implementation. The 760 px simulation does not certify those
workflows. Likewise this prototype does not certify lifecycle transitions,
all roles, custom status catalogs, or full accessibility compliance.

Per the prototype skill, no production test suite or official manual test
cases are added for the throwaway variants. TypeScript, focused formatting,
lint and spelling checks, plus browser interaction and visual inspection,
validate that the prototype is runnable. A selected design needs a proper
implementation with the issue's production test and documentation coverage.

## Code map and decision

- `AreaInfo.tsx` contains the read-only area information panel for A.
- `Variants.tsx`, `state.ts` and `prototype.css` contain the alternative
  presentation, URL state and scoped styles.
- `PrototypeSwitcher` is the floating comparison/inspection tool, mounted by
  the temporary requirements layout.
- `RequirementDetailSections` keeps the original baseline and selects the
  variants with optional in-memory sample props.
- `RequirementDetailCard`, `StatusStepper`, `RequirementDetailClient` and
  `ImprovementSuggestionsSection` expose presentation/measurement hooks.
  The suggestions section also substitutes optional sample items.
- `apiFetch` contains the development-only no-write stub.
- Both locale message catalogs contain prototype controls and sample text.
- The package runner adds `prototype:1348` without dependency changes.
- The public review directory contains the offline gallery, its external script,
  screenshots, measurement data and browser verification results. A public
  directory alias serves these assets through the existing authenticated
  Swedish requirements path without changing authentication rules.

**Verdict:** the user approves prototype A as the design reference for
implementation of #1348. Use full-width requirement text, acceptance criteria
and verification method in that order; compact original-style process steps
beside the requirement-text heading; area description and owner behind the
info icon; 12 px property labels; and package pills styled like the available
options in the package filter chooser. The 10/11 px property-label experiments
are discarded. Retain A's compact metadata and empty supporting sections.

The prototype remains on `prototype/issue-1348`. Production implementation
must apply the approved design to the real components, include the issue's
required tests and documentation, and omit prototype controls and stubs.
