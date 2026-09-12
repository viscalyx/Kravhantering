# Issue 1346: application-wide visual prototype

**Question:** Does the agreed calmer visual style work throughout the real
application, while preserving its layout and workflows?

This is throwaway code on `prototype/issue-1346`, based on main commit
`49140e5e`. It lives in the separate worktree
`/mnt/krav-azure-dev-data/.worktrees/prototype-1346`.
It does not include the separate #1345 prototype or the current CI branch.
**Verdict: awaiting your visual review.** No prototype code is promoted to main.

## Open it

The prepared environment uses one command:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/prototype-1346
npm run prototype:1346
```

Open [Admin Center, Proposed](http://localhost:3002/sv/admin?variant=after).
Sign in with the local development account `ada.admin` / `devpass`.
Forward ports **3002 and 8080** in VS Code when using a remote workspace.
Use localhost URLs so the registered local identity-provider callback works.
Stop the preview with Ctrl+C in its terminal.

The launcher uses the existing development SQL Server and Keycloak services.
It creates a dedicated local client named `kravhantering-prototype-1346` if
needed and uses a separate `prototype1346_session` cookie. Other development
servers and their sessions remain independent. No database migration or seed
command runs. Local Keycloak administrator credentials default to the documented
development values; custom installations can set `PROTOTYPE_IDP_ADMIN_USER`
and `PROTOTYPE_IDP_ADMIN_PASSWORD`.

This prepared worktree has its own dependencies and an ignored link to the
workspace's development configuration. On another machine, run `npm ci` and
configure the normal development environment first. The local login client is
disposable and can be deleted by its exact name from the local Keycloak realm
after review.

## Compare before and after

- **Before** (`?variant=before`) shows the branch baseline.
- **Proposed** (`?variant=after`) applies the agreed styling throughout the UI.
- Both variants use the same route, components, data, permissions and layout.
  Switching preserves the page's current in-memory state and scroll position.
- Left/Right arrow keys cycle the variants outside fields, menus, tabs and
  dialogs. The arrows and buttons in the bottom bar always work.
- **Inspect** outlines classified controls and panels. The bar reports the
  current route, variant, theme, viewport, navigation width and element counts.
- **Changes & review** opens the complete change checklist in the application.
- **Open a view** links to the main surface families and every Admin tab.
  Open requirement and specification details from their lists.
- **Minimize** reduces the bar for inspection. The bar is clearly marked as a
  developer review tool and is not part of the proposed product appearance.
- A URL without `variant` defaults to Proposed. Ordinary product navigation
  can drop that parameter; use the bottom bar to return to Before if needed.

Use the application's theme, language and navigation controls to compare both
themes, Swedish/English, and collapsed/expanded navigation. Form edits are
temporary; browser writes show a notice and an independent server guard rejects
product mutations with HTTP 409 after the normal auth and CSRF checks. Existing
authentication still works. This is a visual preview, not a saving simulation.
Existing browser preferences such as theme and column widths retain their normal
local storage behavior.

## Suggested first review

1. Open Admin Center at 1440 × 900 in light mode. Switch Before/Proposed and
   compare the header, tabs, panel corners, shadows and disabled Save button.
2. Open New requirement. Compare fields and labels, then select **Ny** beside
   Norm references to inspect the dialog. Close it without saving.
3. Open the library and a requirement detail. Check status pills, action
   buttons, table text, horizontal scrolling and column resize handles.
4. Open specification details at 1920 × 1080, expand navigation and use dark
   mode. Compare both panes and their tabs with the same content.
5. Use the view selector for the remaining areas and all Admin tabs. Work
   through C01–C10 and P01–P07 below; use the narrow English gallery profiles
   to supplement your live review.

## Review without running the app

Open [review.html](review.html) directly in a browser. Choose a view and viewport
profile to compare screenshots side by side. Use **Stack images** for larger
images or click either screenshot for full resolution. Expand the measurements
to inspect actual rendered radii, type sizes, shadows, colors and dimensions.

Keep the sibling `evidence` folder when copying the gallery. No server, login or
internet connection is needed for the screenshots. Live links require the
running preview. [Evidence JSON](evidence/observations.json) records the capture
time, routes, profiles, measurements and any browser/capture errors.

To refresh the evidence while the preview is running:

```sh
npm run prototype:1346:capture
```

The capture uses Playwright's installed Chromium and the local demo account.
If needed, install that browser once with `npx playwright install chromium`.
The capture only opens views and a dialog; it does not submit product changes.
Its authenticated browser state stays in the ignored `.auth` directory.

## Complete change and verification checklist

Visual checks below are prototype review instructions, not additions to the
product's manual workflow test cases. Automated measurements and screenshots
provide the geometric evidence.

<!-- markdownlint-disable MD013 -->

| ID | Change | How to verify |
| --- | --- | --- |
| C01 | 8 px corners on buttons, icon buttons, fields and tabs | Compare Before/Proposed in Admin, a requirement form and a list action rail. Use Inspect and the gallery's measured controls; Proposed radii are 8px. Native checkbox/radio/range/color inputs are exceptions. |
| C02 | 12 px corners on panels and dialog surfaces | Compare the Admin frame, Columns cards, form frames and norm dialog. Inspect the panel/floating measurements. |
| C03 | Flat neutral panels, thin existing borders, decorative gradients removed | Compare Admin Center and not-found headings. Inspect light/dark profiles. Semantic warning, error and status colors remain. |
| C04 | Ordinary panel and button elevation removed | Hover ordinary buttons/cards and compare shadows. Use Tab to confirm focus rings remain. CSS drop-shadow outlines on steppers remain functional exceptions. |
| C05 | Floating dialog/menu elevation retained | In New requirement, open New norm reference. Compare the dialog edge and background separation. Also open a table's Columns or Reports menu. |
| C06 | Consistent indigo active tabs | Switch Admin tabs and the specification detail panes. Active tabs are indigo with readable text; inactive tabs remain neutral. |
| C07 | Page headings 24 px, section headings 20 px, field labels 14 px | Inspect a list heading, Admin heading/section, requirement form and not-found page. Compare table text size and row height measurements separately; typography does not redesign table density. |
| C08 | Lightly tinted table headings | Compare library, specification list and action log in both themes. Check headings remain readable and aligned with their columns. |
| C09 | Preserve functional shapes and status meaning | Compare status badge text, icon, pill shape and theme-specific colors. Inspect stepper outlines, native inputs and switch geometry. Logos and diagram connectors remain. |
| C10 | Primary/ordinary/destructive action hierarchy | Primary buttons use indigo, ordinary buttons neutral surfaces, and destructive controls retain red. Check enabled, disabled, hover and keyboard focus states. |
| P01 | Before/Proposed comparison on existing routes | Switch twice, copy/reload each URL, and check the same data and scroll position. Try keyboard arrows both outside and inside an input. |
| P02 | Application-wide styling layer | Visit every view in the selector and all Admin tabs; open details, help and feature dialogs. Newly mounted controls should acquire the same styling. See coverage inventory below. |
| P03 | Read-only prototype guard | Edit a form and attempt Save. A prototype notice explains the blocked request. The product cannot save; authentication remains available. |
| P04 | Review bar, inspection and state display | Toggle Inspect and Changes & review. Resize the window, change theme, collapse/expand navigation and confirm the reported state updates. Minimize the bar to inspect content. |
| P05 | Offline gallery and reproducible evidence capture | Open the gallery without the app. Choose every comparison, expand measurements and follow full-resolution images. Re-run the capture command with the app running. |
| P06 | Independent worktree, port and login | Confirm branch `prototype/issue-1346`, port 3002 and the dedicated local client/session. The #1345 preview stays on 3001. |
| P07 | Development-only activation | The skin, bar and write guard require the prototype launcher flag and non-production mode. Normal builds do not activate the experiment. |

<!-- markdownlint-enable MD013 -->

## Coverage inventory

The skin is mounted throughout the localized application, and separately in
application-owned root error, global error, not-found and auth-error surfaces.
It observes newly mounted elements, including dialog portals. Existing curated
Developer Mode markers remain; the review bar has its own marker.

The capture covers these surface families:

- Requirements library; new/edit forms; requirement details.
- Specification list and details, including their existing pane layout.
- Areas, packages, norm library, selection questions and information requests.
- Every Admin tab: Columns, Identity, Settings, Taxonomy, Statuses and workflows,
  Access review, Archiving, Privacy and Action log.
- Privacy, not-found and authentication error pages.
- A real norm-reference dialog and the prototype review controls.
- Four reference views at 1440 × 900 and 1920 × 1080, light/dark themes,
  with collapsed navigation at 1440 and expanded navigation at 1920.
- Narrow English library and Admin views at 390 × 844.

This is evidence across the application, not exhaustive coverage of every data
state, permission combination or nested dialog. Open those additional states
through the real controls during review. Full workflow, accessibility and
regression verification belongs to the subsequent production implementation.

## Verification results

TypeScript, focused Biome checks, Markdown lint and spelling checks pass.
Browser interaction checks confirm variant buttons, keyboard switching,
URL reload, Inspect, and arrow-key handling inside a text field. A direct
session-authenticated product mutation returns HTTP 409 from the prototype
server guard. Status badge colors/text/shape and stepper contrast outlines
remain unchanged in the inspected requirement detail. Transparent column
resize handles remain transparent, so they do not obscure table text.

See [interaction observations](evidence/interaction-checks.json) for the
recorded results, including before/after button shadows. The screenshot
capture records its own coverage, measurements and browser errors separately.
These checks do not constitute production acceptance or exhaustive functional
and accessibility testing. No production test suite or manual workflow case
is added for this throwaway visual experiment.

## Scope and implementation limits

The experiment intentionally compares **two skins**, rather than introducing
three different layouts: #1346 already specifies a visual direction and leaves
widths, row density, header height and content placement to other issues.
The original accepted shape, palette and typography choices remain the question
under review. #1359 still owns Admin's layout and denser Columns rows.

This prototype uses a DOM classifier and a stylesheet so the same real page can
switch instantly. The classifier reads existing roles and classes and generates a scoped
stylesheet without changing React-owned elements. That is deliberately temporary and
may miss unusual variants; Inspect exposes its classifications for review.
Production work should put these rules into maintained components and shared
styles, with their normal test coverage. Do not merge this scanner or launcher
as the final implementation.

Excluded: generated PDF/CSV documents, external identity-provider pages, brand
assets, and package-owned Developer Mode overlays. Their product launch controls
remain included. Status colors, semantic alerts, native control geometry and
accessibility outlines are functional exceptions to blanket visual changes.

No visual approval is inferred from successful capture or compilation.

## File inventory

<!-- markdownlint-disable MD013 -->

| File | Purpose |
| --- | --- |
| `components/Prototype1346.tsx` | Variant selection, review bar, change checklist, inspection and browser write blocking |
| `components/prototype1346-dom.ts` | Throwaway classification and generated style rules for controls, panels, floating surfaces and decoration |
| `components/Prototype1346.css` | Shared theme and typography rules plus visually separate review controls |
| Locale layout and root/auth error/not-found surfaces | Mount the prototype on existing application routes |
| `proxy.ts` | Independent development-only product write guard after auth and CSRF |
| `scripts/prototype-1346.mjs` | One-command launch with dedicated disposable local OIDC client |
| `package.json` | Launch and evidence-capture commands |
| `capture.mjs`, `gallery-template.html`, `review.html`, `evidence/` | Reproducible screenshot gallery, measurements and coverage records |

<!-- markdownlint-enable MD013 -->
