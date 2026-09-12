# Issue 1345: persistent commands and specification detail

This throwaway prototype lives on `prototype/issue-1345` in the separate
worktree `/mnt/krav-azure-dev-data/.worktrees/prototype-1345`.

**Review direction:** A and C are rejected and removed. B is the preferred
starting point. D is a new alternative that develops B. The design decision is
still open; no prototype code is promoted to production.

Both B and D keep commands available at the user's current scroll position.
Back to top is an optional convenience, not a prerequisite for creating an item.

## Open or restart

The prototype uses port 3001:

- [Library, B](http://localhost:3001/sv/requirements?variant=B)
- [Library, D](http://localhost:3001/sv/requirements?variant=D)
- [Specification 8, B](http://localhost:3001/sv/specifications/8?variant=B)
- [Specification 8, D](http://localhost:3001/sv/specifications/8?variant=D)

The detail URL without a variant defaults to B. Old A/C URLs redirect to B.
Use the bottom arrows or Left/Right keys to cycle **Before → B → D**. The
bottom links include all five lists and specification 8. Copy or reload a URL
to retain the selected variant. Fields and menus retain their normal arrow keys.

```sh
cd /mnt/krav-azure-dev-data/.worktrees/prototype-1345
npm run prototype:1345
```

Sign in with local development user `ada.admin` / `devpass`. Forward port 3001
in VS Code when browsing from outside the development host. The existing
Keycloak service on 8080 and development SQL Server must be running. The
launcher uses the existing registered local login client for port 3001.
Stop with Ctrl+C in the launch terminal.

The prepared worktree has its own dependencies and an ignored link to the
existing local development configuration. On another machine, run `npm ci` and
configure the normal development environment before using the launch command.

## Compare B and D

<!-- markdownlint-disable MD013 -->

| Surface | B: command band | D: grouped command bar |
| --- | --- | --- |
| List header | Title, labelled secondary tools and primary action in one band | Title and primary action together; secondary tools in distinct groups |
| Library tools | Existing order | AI/import grouped before reports/export/columns |
| Scrolling | Command band stays visible | Command bar stays visible; table headings sit below it |
| Appearance | Tinted band with accent border | Quieter surface, compact buttons and group separators |
| Specification detail | Named edit action and full-width metadata cards | Compact metadata, full panel-tab text and labelled panel actions |
| Narrow widths | Wraps the existing band | Wraps command groups while keeping actions available |

<!-- markdownlint-enable MD013 -->

Before retains the original rendering. Prototype simulation and review controls
remain active in Before too. No removed variant remains in the switcher or
gallery; the initial exploration is retained only in Git history.

## Visual comparison without the app

Open [review.html](review.html) in a browser. Choose any of the six views and B
or D for side-by-side Before/After images. Click an image for full resolution,
or stack the images to inspect larger versions. Keep the sibling `evidence`
folder when sharing the gallery. It needs no server or login.

The gallery links to matching live pages, captures taken while scrolled, wide
screens, dark theme and English narrow-screen layouts.

## Complete change and verification checklist

<!-- markdownlint-disable MD013 -->

| ID | Change | How to verify |
| --- | --- | --- |
| P01 | A/C removed; B and D selectable | Cycle both directions through Before/B/D. Open an old A/C URL and confirm it changes to B |
| P02 | Visible library heading | Open the library with navigation collapsed; B/D still identify the page as Kravbibliotek |
| P03 | Named primary controls on five lists | Visit all list links. Check Nytt krav, Nytt kravunderlag, Nytt kravpaket, Ny normreferens and Nytt kravområde, each with an icon |
| P04 | Persistent primary and secondary commands | Scroll far down the library in B and D. The creation button and every tool must remain visible and clickable without returning to the top |
| P05 | Scroll position preserved by actions | While scrolled, click the simulated creation action and open/close Reports or Columns. The same rows should remain at the same position |
| P06 | D groups commands | Compare B/D. In D, primary action is beside the title, AI/import precede output tools, and separators distinguish tool groups |
| P07 | Existing menu and list behavior | Open Reports and Columns, select rows, sort and filter. Check available entries and indicators. Back to top remains available separately |
| P08 | Specification detail added | Open `/sv/specifications/8` and use Before/B/D. Check the same name, description, governance type, responsible person/HSA-id, implementation type and lifecycle status |
| P09 | D makes detail metadata compact | Compare metadata in B/D. All values remain visible, labels wrap rather than clip, and D removes the individual card decoration |
| P10 | D makes detail tabs readable | Read Krav i underlaget, Behovsreferenser, RFI-frågelista, Tillgängliga krav and Kravurvalsfrågor. Switch all tabs and check their existing content |
| P11 | Detail panel commands stay in context | Scroll both tables independently. Use Nytt unikt krav in the left pane and open its action/column menus. Commands stay visible and both pane positions remain unchanged after a simulated action |
| P12 | Detail actions are named | D shows visible labels for creation, Columns and More actions; B retains its panel controls for comparison. Both show a named edit action at the top |
| P13 | State and keyboard review controls | Check the variant/view/action status, review panel, URL reload, keyboard wraparound and field/menu arrow behavior |
| P14 | Responsive and theme behavior | Compare at 1440 × 900 and 1920 × 1080, both navigation states and both themes. Try 390 and 320 px and English labels; commands should fit and remain usable |
| P15 | Simulated writes | Creation and edit controls report a simulated action. Browser write requests are intercepted; do not interpret this as real mutation verification |
| P16 | Developer Mode coverage | Enable Developer Mode and inspect the command bar, primary action, toolbar, switcher and specification detail layout markers |
| P17 | Worktree and runtime isolation | Confirm branch `prototype/issue-1345`, port 3001, and no prototype edits in the main checkout. Rendering and switcher require the development prototype flag |
| P18 | Offline review | Open every gallery view with B/D, compare screenshots and follow the matching live link |

<!-- markdownlint-enable MD013 -->

### Suggested review sequence

1. Start with the library in B. Scroll at least 900 px and create from there.
   The status reports simulation, and the list stays where you left it.
2. Switch to D at the same position. Compare command grouping and open a menu.
3. Repeat the header comparison on the other four lists using the bottom links.
4. Open specification 8. Compare Before/B/D, then scroll the two panes
   separately. Use the left creation control and check both scroll positions.
5. Switch the detail tabs, including needs references and selection questions.
6. Repeat at 1920 × 1080, with expanded navigation and dark theme. Try the
   narrow English layout for wrapping. Inspect existing long data rather than
   editing stored data.

## File inventory

<!-- markdownlint-disable MD013 -->

| File or component | Purpose |
| --- | --- |
| `Prototype1345.tsx` / `Prototype1345.css` | B/D headers, measured sticky height, switcher, simulation, review panel and detail presentation |
| Locale layout | Mount prototype controls within the existing authenticated shell |
| `ListWorkspace` | Reclaim the old action-rail gutter and scope candidate styling |
| `RequirementsClient` | Add library heading and named primary action |
| `RequirementsTable` | Render the existing tools in the command bar, group D's actions, retain menus and Back to top |
| Kravpaket, Normbibliotek and Kravunderlag list clients | Switch header presentation without changing data or permissions |
| `CrudAdminPanel` | Apply the prototype header only to Kravområden |
| Specification detail client | Add the prototype header while retaining metadata, tabs, panels and table behavior |
| Swedish/English message catalogs | Candidate names, explanations and verification controls |
| `package.json` / `prototype-1345.mjs` | One-command development launcher on port 3001 |
| This guide, `review.html`, `evidence` | Complete inventory, comparison gallery and recorded observations |

<!-- markdownlint-enable MD013 -->

## Scope and limits

This is a rendering experiment using normal authenticated reads and existing
view state. Creation, import, AI-generation and export toolbar triggers are
simulated, and browser writes are intercepted. This is a UI safeguard, not a
server authorization policy. It does not establish production mutation,
permission, report-generation or lifecycle correctness.

No new business-data persistence is introduced. Existing application filters
and view preferences may retain their normal browser storage; the prototype
uses the URL and component memory. All existing data and permission conditions
are retained. Adding the specification detail page is explicitly requested
exploration beyond the original five-list issue scope.

No production test suite or manual cases are added to this throwaway branch,
as required by the prototype skill. Browser observations, type checks and
focused linting are recorded below. Production implementation still needs the
full tests and manual cases in the issue's agent brief.

## Design verdict

A and C are rejected. B is preferred so far. D is the new candidate awaiting
review. Persistent access to commands at the current scroll position is a
requirement for either candidate. No final variant is approved for production.

## Recorded verification

- Chromium renders all six views in Before/B/D: 18 combinations at 1440 × 900.
  The candidates retain the expected page headings and fit the page width.
- At a library scroll offset of 900 px, both B and D keep the primary and
  secondary commands visible. Clicking the simulated creation action and
  opening/closing Reports leaves the scroll offset unchanged.
- In specification 8, the left and right panes are scrolled independently.
  Clicking Nytt unikt krav leaves both offsets unchanged in B and D. Detail
  tabs switch back to the existing lists correctly.
- Additional captures cover the library and specification detail at
  1920 × 1080 with dark theme and expanded navigation, and 390 px with English
  labels. These captures show no page-level horizontal overflow.
- An old A URL redirects to B. Keyboard switching to D and reload retention
  work. The browser pass reports no JavaScript page errors.
- TypeScript, focused Biome checks, documentation spelling and Markdown
  linting pass. The full production test suite is not run for this prototype.

Screenshots and raw observations are in [evidence](evidence). This is not a
complete role/locale/theme/viewport matrix; use the checklist for further
review before approving a production design.
