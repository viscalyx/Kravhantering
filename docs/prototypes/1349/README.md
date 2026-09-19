# Requirement form layout prototype — issue 1349

<!-- markdownlint-configure-file {"MD060": {"style": "compact"}} -->

This throwaway prototype asks: **which arrangement makes norm references easier
to read while preserving useful writing space?** No variant is approved yet.
Use the existing form, navigation, themes, field help and reference data to
compare the baseline geometry with five alternatives.

For the D/E update, see the [Swedish review guide](GRANSKNING.md).

## Open it

From the prototype worktree:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/1349-form-prototype
npm run prototype:1349
```

Open [variant A](http://localhost:3001/sv/requirements/new?variant=A).
Sign in with the normal development account (`ada.admin` / `devpass`).
If your browser is outside the development container, forward port **3001**
in the editor's Ports panel. Keep the existing Keycloak port **8080** forwarded.
Use `localhost` for both forwarded addresses so the registered callback works.

The launcher uses the existing development SQL Server and Keycloak services.
It uses Keycloak's existing port-3001 client, a separate session cookie,
and this worktree's own Next.js output. It does not start, stop or reset
containers or the development app on port 3000. It reads the main checkout's
local environment through a symlink; it does not edit that file.

If port 3001 is occupied, the launcher stops with a message. Do not stop an
unrelated prodlike server to run this demo. A running prototype already serves
the URLs below. Use Ctrl+C in its terminal to stop just that prototype.

<!-- markdownlint-disable MD013 -->
| View | URL | Question to answer |
| :--- | :--- | :--- |
| Baseline | [Open](http://localhost:3001/sv/requirements/new?variant=baseline) | What does the existing arrangement cost? |
| A: wider norms | [Open](http://localhost:3001/sv/requirements/new?variant=A) | Is redistributing sidebar width enough? |
| B: stacked rail | [Open](http://localhost:3001/sv/requirements/new?variant=B) | Is more list scrolling worth a wider writing column? |
| C: writing first | [Open](http://localhost:3001/sv/requirements/new?variant=C) | Is extra page scrolling worth full-width writing? |
| D: equal panels | [Open](http://localhost:3001/sv/requirements/new?variant=D) | Can narrower writing fields give both lists enough space? |
| E: modal selection | [Open](http://localhost:3001/sv/requirements/new?variant=E) | Is a compact badge summary preferable to inline lists? |
<!-- markdownlint-enable MD013 -->

Replace `/sv/` with `/en/` for English. The floating bottom bar selects a
variant; its arrows and the keyboard's left/right arrows cycle with wrapping.
Arrows inside inputs, text areas, selects or editable content retain their
normal editing behavior. The URL preserves the layout on reload; edited data
is deliberately reset on reload. Switching variants keeps in-memory edits.

Baseline retains the existing column widths and footer arrangement. Like
all other variants, it now shows package purpose directly; this is an
intentional change from the original baseline. The banner, variant description
and simulation status add review space around it; this is not a pixel-identical
full-page production capture. Use the same prototype frame for before/after comparisons.

## A five-minute walkthrough

1. Open Baseline at 1920 × 1080 with navigation collapsed and the light theme.
   Compare the first norm labels (EN 301 549, NIS2 and ISO/IEC 25010), both
   list tops, and the destination controls below Save/Cancel.
2. Switch to A using the bottom select. Look for fewer wrapped norm-label
   lines, aligned list tops and one shared footer row. Compare the writing
   column; it should retain its dimensions. Check the narrower package names.
3. Switch to B. Scroll the package list and norm list independently. Decide
   whether a wider writing column and references offset the shorter lists.
4. Switch to C. Compare writing width, then scroll down to associations and
   the footer. Decide whether this reading order justifies a taller page.
5. Click **Ändringar och checklista** (Changes & review checklist). The panel
   describes the current variant and shows all field values, selections,
   destination, temporary norms and last simulated action. Close it before
   assessing the underlying layout.

For exact viewports, open browser developer tools, enable responsive/device
mode, select Responsive, enter **1920 × 1080** or **1440 × 900**, and keep
browser zoom at 100%. This controls the page viewport, unlike resizing the
outer browser window. Repeat with navigation expanded and both themes.

## Every change and how to verify it

<!-- markdownlint-disable MD013 -->
| Change | Where | Verification |
| :--- | :--- | :--- |
| Redistributed association width | A | Compare with Baseline at desktop size: packages 176 px, gap 16 px, norms 352 px; writing width stays the same. |
| Vertically stacked associations | B | Packages appear above norms in a 384 px rail. Each list scrolls; the writing column is wider. |
| Associations below writing | C | Writing spans the card; packages and norms appear underneath in a 1:2 split, in a 320 px section. |
| Aligned list headings | A/B/C/D | Compare package and norm list tops in A/C. New is 24 px high; B has separate stacked headings. |
| Unified footer | A/B/C/D/E | Destination and Save/Cancel share a row where space permits; at narrow widths they wrap without clipping. |
| Writing heights preserved | All | Load long text; text and acceptance fields remain at least 100 px high. Toggle Verifiable and inspect its writing field. |
| Equal panel widths, narrower writing | D | At 1920 px compare 402 px writing and two 390 px selection panels; writing height stays 100 px. |
| Visible purpose and scope | All | Read package purpose without hovering. Ordinary checkboxes stay; there is no additional confirmation or automatic matching. Missing purpose is labeled, not blocked. |
| Transactional modal selection | E | Mark packages/norms, cancel, reopen, then Select. Only Select applies changes. Search must not lose hidden checked choices. |
| Badge summary | E | Only selected items appear in the form as removable badges. Reopen the modal and inspect existing checks. |
| Modal keyboard/focus | E | Escape cancels, Tab stays in the dialog, and closing returns focus to the trigger. Variant arrows must not act behind the modal. |
| Responsive layout | All | Inspect 1440 × 900, 1920 × 1080 and 320 px width. Check wrapping, list scrolling and access to every footer control. |
| Baseline comparison | Baseline | Confirm equal association columns, taller New button, offset norm-list top and separate destination row. |
| Shareable layout URL | All | Select a variant and inspect `?variant=`. Reload; the layout stays but unsaved edits disappear. |
| Floating switcher | All | Cycle both directions, including E → Baseline. Arrow keys in text fields must move the caret instead. |
| Long-text sample | Toolbar | Click Load long text. Requirement text, acceptance criteria and verification method fill; Verifiable becomes checked. |
| Local state preserved while comparing | All | Select packages/norms, edit fields and switch variants. Inspect the state panel and selections. |
| Simulated Save | Footer | Choose an area, enter requirement text and click Save. Read the simulation message; no navigation or database write occurs. |
| Simulated Cancel | Footer | Click Cancel. The message explains that the preview remains for further comparison. |
| Simulated norm creation | New in Baseline–D | Enter a name, click Add in memory. The new norm appears selected. Reload and confirm it disappears. |
| Destination keyboard access | Footer | Focus List view, Tab to Detail page, press Space. Inspect selected state and simulated Save's destination message. |
| Reset control | Toolbar | Reset clears edited fields, associations, temporary norms and destination; it retains the selected layout. |
| Change checklist and full state | Review panel | Switch variants with the panel open. Descriptions and state update. Close it to inspect the actual layout. |
| Swedish and English copy | `/sv/`, `/en/` | Open both locales and inspect toolbar, variants, checklist and simulation messages. |
| Developer Mode markers | Prototype surfaces | Enable Developer Mode in app settings. Inspect markers for layout, action row, destination, review controls and variant switcher. |
| Development-only activation | Launcher/page gate | The normal route remains unchanged unless `PROTOTYPE_1349=true` in a non-production process. |
| Isolated launcher | Worktree | Check port 3000 still serves your original app. The prototype runs on 3001, with separate build output and cookie. |
<!-- markdownlint-enable MD013 -->

Reference catalogs are read from the existing app database. **Save, Cancel,
New and navigation after saving are simulations**, not proof of production
behavior. Existing field help and selection interactions use the real shared
component. The prototype does not write requirements or norm references.

## Files and boundaries

<!-- markdownlint-disable MD013 -->
| File | Purpose |
| :--- | :--- |
| `app/[locale]/requirements/new/page.tsx` | Development-only gate on the existing new-requirement route. |
| `app/[locale]/requirements/new/requirement-form.prototype.tsx` | In-memory form, comparisons, review panel and simulated actions. |
| `app/[locale]/requirements/new/requirement-form.prototype.css` | Scoped layout alternatives and prototype controls. |
| `components/PrototypeRequirementAssociations.tsx` | Purpose display, ordinary package checkboxes, draft/apply modals and badge summaries. |
| `components/RequirementFormFields.tsx` | Optional prototype-only rendering slots; defaults retain existing behavior. |
| `components/PrototypeVariantSwitcher.tsx` | URL-driven picker and guarded arrow-key navigation. |
| `messages/en.json`, `messages/sv.json` | Prototype labels, sample text and review instructions. |
| `scripts/prototype-1349.mjs`, `package.json` | One-command launch with independent port/cookie and local dependency preparation. |
| This directory | Review guide, screenshots, measurements and findings. |
<!-- markdownlint-enable MD013 -->

`RequirementFormFields` has two explicitly named throwaway rendering slots
for prototype associations; its default rendering remains unchanged.
Production `RequirementForm`, SQL schema, API mutations, auth policy and
manual production test cases are unchanged.
The scoped CSS intentionally depends on the current shared field structure:
it is an experiment, not a proposed permanent component API.

## Screenshots and inspection evidence

The screenshots use the same loaded data. Only the floating variant picker
is hidden for capture so it does not obscure the form. It remains available
in the live prototype.

<!-- markdownlint-disable MD013 -->
| Variant | 1920 × 1080, light, collapsed | 1440 × 900, dark, expanded |
| :--- | :--- | :--- |
| Baseline | [Screenshot](screenshots/baseline-1920-collapsed-light.png) | [Screenshot](screenshots/baseline-1440-expanded-dark.png) |
| A | [Screenshot](screenshots/A-1920-collapsed-light.png) | [Screenshot](screenshots/A-1440-expanded-dark.png) |
| B | [Screenshot](screenshots/B-1920-collapsed-light.png) | [Screenshot](screenshots/B-1440-expanded-dark.png) |
| C | [Screenshot](screenshots/C-1920-collapsed-light.png) | [Screenshot](screenshots/C-1440-expanded-dark.png) |
| D | [Screenshot](screenshots/D-1920-collapsed-light.png) | [Screenshot](screenshots/D-1440-expanded-dark.png) |
| E | [Screenshot](screenshots/E-1920-collapsed-light.png) | [Screenshot](screenshots/E-1440-expanded-dark.png) |
<!-- markdownlint-enable MD013 -->

Also see the [open review panel](screenshots/A-review-panel.png),
[inspection findings](FINDINGS.md) and [raw measurements](measurements.json).

This is a visual experiment on the create route. Production saving, edit
reconciliation, cancellation protection and authorization regression coverage
remain implementation work. No production test cases are changed for the
throwaway prototype. Browser inspection exercises the actual prototype;
there is no new permanent test suite for this throwaway code.

## Decision to make

Compare A and D for the tradeoff between writing width and package purpose
readability. B and C explore grouping and reading order. E moves the complete
selection task into dialogs and keeps the form compact.
**No visual variant is approved.** The confirmed interaction preference is
visible purpose with ordinary checkboxes and no separate acknowledgment.

The prototype is preserved on `prototype/1349-requirement-form-layout`.
After choosing an arrangement, implement that decision with production
validation and the issue's regression coverage. Keep these experiments off
the production branch.
