# Issue 1345: persistent commands, search and filters

This throwaway prototype lives on `prototype/issue-1345` in the separate
worktree `/mnt/krav-azure-dev-data/.worktrees/prototype-1345`.

**Review direction:** B is the remaining prototype. A, C and D are rejected
and removed. Before retains the original layout for comparison. No prototype
code is promoted to production.

B keeps each list title, creation button and toolbar commands available at
the current scroll position. Search and filter bars also stay visible on specifications,
packages, norms, selection questions and RFI questions. Area headings sit
below the filters. Kravbiblioteket retains its existing sticky filter behavior.
Specification 8 retains independent scrolling and controls in both panes.
Its RFI and requirement-selection tabs also keep their filters below the
pane tabs; narrow layouts place the pane controls below the page command bar.

## Open or restart

- [Library](http://localhost:3001/sv/requirements?variant=B)
- [Specifications](http://localhost:3001/sv/specifications?variant=B)
- [Packages](http://localhost:3001/sv/requirements/stewardship?tab=packages&variant=B)
- [Norms](http://localhost:3001/sv/requirements/stewardship?tab=norms&variant=B)
- [Areas](http://localhost:3001/sv/requirement-areas?variant=B)
- [Selection questions](http://localhost:3001/sv/requirements/stewardship?tab=questions&variant=B)
- [RFI questions](http://localhost:3001/sv/requirements/stewardship?tab=information-requests&variant=B)
- [Specification 8](http://localhost:3001/sv/specifications/8?variant=B)

URLs without a variant default to B. Old A/C/D URLs redirect to B. Use the
bottom arrows or Left/Right keys to switch **Before ↔ B**. All eight views
appear in the bottom links. Copy or reload a URL to retain the variant.
Fields and menus keep their normal arrow keys. On narrow screens, scroll
the view links horizontally. Extra bottom space keeps final list items clear
of the review controls.

```sh
cd /mnt/krav-azure-dev-data/.worktrees/prototype-1345
npm run prototype:1345
```

Sign in with local development user `ada.admin` / `devpass`. Forward port 3001
in VS Code when browsing from outside the development host. Keycloak on 8080
and development SQL Server must be running. The launcher uses the existing
registered local login client for port 3001. Stop with Ctrl+C in its terminal.

The prepared worktree has its own dependencies and an ignored link to the
existing local development configuration. On another machine, run `npm ci`
and configure the normal development environment first.

## Visual comparison without the app

Open [review.html](review.html) in a browser. Select any of the eight views
for side-by-side Before/B images. Click an image for full resolution, or
stack the images for larger versions. Keep the sibling `evidence` folder
when sharing the gallery. It needs no server or login.

The gallery includes links to the live pages and additional scrolled, dark
and narrow screenshots. Removed variants remain only in Git history.

## Complete change and verification checklist

<!-- markdownlint-disable MD013 -->

| ID | Change | How to verify |
| --- | --- | --- |
| P01 | Only Before and B remain | Cycle both ways through Before/B; open an old A/C/D URL and confirm it changes to B |
| P02 | Visible library heading | Open the library with navigation collapsed; B still identifies the page as Kravbibliotek |
| P03 | Named primary controls on seven lists | Visit all list links and check each creation button's label and icon; original permission and disabled conditions still apply |
| P04 | Persistent titles and commands on every list | Scroll each of the seven lists halfway down and to the bottom. The page title, creation button and toolbar commands remain visible without returning to the top |
| P05 | Scroll position preserved by actions | While scrolled, click simulated creation and open/close Reports or Columns where available. The same rows stay in place |
| P06 | Sticky search and filter bars | Scroll specifications, packages, norms and both question tabs. Also check the RFI and requirement-selection panes in specification 8. Search and filters stay 16 px below the command bar; area headings stay below the filters. Resize or reveal Clear search and check that the offsets adapt; a search with no results must remain visible and clearable |
| P07 | Existing list behavior | Filter and clear the search, open available menus, select rows and sort. Kravbiblioteket keeps its existing sticky filters and optional Back to top |
| P08 | Specification detail prototype | Open `/sv/specifications/8` and compare Before/B. Check the same name, description, governance type, responsible person/HSA-id, implementation type and lifecycle status |
| P09 | Full-width detail metadata | Check that all metadata values remain available at desktop and narrow widths |
| P10 | Existing detail tabs | Switch Krav i underlaget, Behovsreferenser, RFI-frågelista, Tillgängliga krav and Kravurvalsfrågor and inspect their content |
| P11 | Detail controls stay in context | Scroll both tables independently. Use Nytt unikt krav in the left pane; controls remain available and both pane positions stay unchanged after simulation |
| P12 | Named detail edit action | Check the edit button beside the specification heading and its existing permission condition |
| P13 | Review state and keyboard controls | Check variant, view/tab and simulated action status; open the review panel, switch by keyboard and reload the URL |
| P14 | Responsive and theme behavior | Try desktop and 390/320 px, both themes and locales. Controls should fit; scroll the narrow review link strip to reach all eight views |
| P15 | Simulated writes | Creation and edit controls report simulation. Browser writes are intercepted; this does not verify real mutations |
| P16 | Developer Mode coverage | Inspect the existing layout, primary action, toolbar and switcher markers, plus the new sticky search and filters marker |
| P17 | Worktree isolation | Confirm branch `prototype/issue-1345` and port 3001. Candidate rendering requires the development prototype flag |
| P18 | Offline review | Select every gallery view, compare Before/B images and follow the matching live link |
| P19 | Stable header spacing | Scroll the library slowly and return to the top. Its 48 px top gutter and 17 px header-to-table gap remain constant. Other list headers retain their top gutter, and opaque sticky surfaces hide passing rows |
| P20 | Both question stewardship tabs | Open `tab=questions` and `tab=information-requests`. Check headings, filters, area grouping and question content; use the new switcher links and reload |

<!-- markdownlint-enable MD013 -->

## File inventory

<!-- markdownlint-disable MD013 -->

| File or component | Purpose |
| --- | --- |
| `Prototype1345.tsx` / `Prototype1345.css` | B header, measured sticky filters, spacing, switcher, simulation and review panel |
| Locale layout | Mount prototype controls inside the existing authenticated shell |
| `ListWorkspace` | Reclaim the old action-rail gutter and scope prototype styling on seven lists |
| `RequirementsClient` | Add the library heading and named creation action |
| `RequirementsTable` | Place existing library tools in B's command bar; retain menus, sticky filters and Back to top |
| Package, norm and specification list clients | Add prototype headers and sticky search bars with existing data and permission behavior |
| Selection question and RFI question clients | Add prototype headers and sticky filters; offset area headings below both |
| `CrudAdminPanel` | Apply the prototype header only to areas; this list has no search bar |
| Specification detail client and question panels | Add B's header, retain metadata and tabs, and keep pane search/filter controls below the tabs at desktop and narrow widths |
| Swedish/English message catalogs | B/Before labels and current verification guidance |
| `package.json` / `prototype-1345.mjs` | One-command launcher on port 3001 |
| This guide, `review.html`, `evidence` | Change inventory, visual comparison and browser observations |

<!-- markdownlint-enable MD013 -->

## Scope and limits

The prototype uses real authenticated reads. Creation, import, AI-generation
and export toolbar triggers are simulated; browser writes are intercepted.
This is a UI safeguard, not a server authorization policy. It does not prove
production mutation, permission, report-generation or lifecycle correctness.

No business-data persistence is introduced. Existing filters and preferences
may retain their normal browser storage; the prototype uses URL and component
state. The detail page and question tabs are explicitly requested exploration
beyond the original five-list issue scope.

No production test suite or manual cases are added to this throwaway branch,
as directed by the prototype skill. Browser observations, TypeScript, focused
Biome checks, Markdown lint and documentation spelling provide the recorded
verification. Production implementation still needs the issue's full tests
and manual cases.

## Recorded verification

Current screenshots cover all eight views in Before/B at 1440 × 900, with
additional scrolled, dark and narrow captures. Browser measurements verify
sticky commands and filters, area offsets, preserved scroll position,
filter/clear behavior, variant redirects, links and reload retention.

See [browser observations](evidence/observations.json) for the exact cases
and measurements. The checklist covers further review before approving a
production design. B remains a throwaway prototype under review.
