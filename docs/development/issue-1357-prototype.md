# RFI layout prototype for issue 1357

This guide is for the maintainer reviewing the RFI layout and for the developer
who will implement the selected design. The question is: **which compact RFI
layout best preserves readable question text, version, status and actions while
matching the requirement selection question list?**

This is throwaway code on `prototype/issue-1357-rfi-layouts`, based on
`e486c01f`. No design is approved yet. A is the provisional recommendation:
it follows the completed #1355 split-row design and has consistent density
with either navigation state. Keep the prototype on its separate branch;
implement the selected design with production tests after review.

## Start and open

The prepared worktree has local dependencies and links to the existing
development environment files. Start with one command from that worktree:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/issue-1357-rfi-layouts
npm run prototype:1357
```

Open the [interactive prototype](http://localhost:3137/sv/requirements/stewardship/workspaces/information-requests?variant=A).
Forward port **3137** in VS Code if you access the workspace remotely.
The launcher refuses an occupied port instead of stopping another process.
Use `PROTOTYPE_PORT=3138 npm run prototype:1357` for a different unused port.
Ctrl+C stops only the prototype server.

Use the existing development sign-in at `http://localhost:3000` first if
needed, then return to the prototype. Use the same hostname for both:
localhost session cookies work across ports. The development account is
`ada.admin` with password `devpass`. If the normal app is not running, start
`npm run dev` in `/workspace` in a second terminal. For remote access, forward
ports 3000 and 8080 for the normal sign-in workflow as well as 3137.

SQL Server and Keycloak are the existing development services. The prototype
does not reset, migrate or seed them. Existing authentication, authorization
and data reads remain in use. The environment files are treated as read-only.

For a fresh worktree:

```sh
git fetch origin prototype/issue-1357-rfi-layouts
git worktree add /mnt/krav-azure-dev-data/.worktrees/issue-1357-rfi-layouts \
  prototype/issue-1357-rfi-layouts
cd /mnt/krav-azure-dev-data/.worktrees/issue-1357-rfi-layouts
npm ci
ln -s /workspace/.env.development.local .env.development.local
ln -s /workspace/.env.sqlserver .env.sqlserver
npm run prototype:1357
```

## Compare the designs

Use the floating bottom bar, its selector, or Left/Right outside an editor.
Each choice uses the existing RFI workspace and the same data. The URL's
`variant` parameter is shareable and survives reload. Switching preserves
filters and expanded questions.

- `original`: existing cards and the original five-track filter layout.
  The common prototype controls and blocked saves apply here too.
- `A`: question text on the left, a separate facts column on the right, and
  compact rows sharing a bordered surface per requirement area. This follows
  the approved #1355 direction.
- `B`: aligned question-code, question-text and version/status columns,
  alternating row shading, and area metadata below the question. This favors
  scanning down columns but gives question text less space.
- `C`: individual compact cards with a subtle leading border, question text
  first and a quieter metadata line below. This retains visual separation
  between questions but departs from #1355's shared surface.

All alternatives remove the empty fifth filter track. Above 1100px, the
search field takes the remaining width beside the three filters. At medium
widths, search spans a row above the filters; on small screens controls stack.
Text wraps, metadata remains visible and actions remain separate from the
disclosure button. No question reordering or hierarchy controls are added.

## Review controls and temporary state

Open **Review and state** in the floating bar:

- **Add long-text / archived examples** adds temporary long text to three
  questions and shows one as archived at version 12. These are explicitly
  marked examples, including a long unbroken reference value. They are not
  saved. Toggle the button again to return to the loaded data.
- **Reset data and filters** removes examples, clears all filters and
  expansion, closes editors and clears the displayed error.
- **Measure rows** shows viewport size, resolved filter columns, row heights
  and complete rows above the open panel. Measurements are snapshots; the
  capture command below measures with the panel closed for fair comparisons.
- The state display shows the current variant, example mode, filters,
  visible question codes, question data, authoring permissions, expansion,
  editor state, suggestion counts/target, and blocked write attempts.

Close the panel before comparing layouts. Input, textarea, select and dialog
arrow keys retain their normal function. Example data and filters reset on
reload; only the variant is stored in the URL. The app's existing theme and
navigation preferences retain their normal storage behavior.

The prototype's client API helper blocks mutating calls before sending them.
An attempted save displays a prototype error confirming that nothing changed
and increments the blocked-write counter. This applies across the
prototype app, including `original`. It is a client preview guard, not a
server authorization boundary. Do not use this preview to test persistence.

## Offline comparison gallery

With the prototype server running, run:

```sh
npm run prototype:1357:capture
```

Open `tmp/prototype-1357/gallery.html` locally in a browser. It embeds all
32 screenshots and offers viewport, theme and navigation selectors. Each
selection shows the original and A/B/C side by side. Click an image to open
the corresponding PNG at its native size. Copy the entire output directory
if you want those PNG links available on another machine.

The capture command uses the existing local Keycloak flow against the
prototype server; it does not need a running app on port 3000 or alter IdP
configuration. It records:

- 32 PNGs: four variants × two viewports × two themes × two navigation states.
- `measurements.json`: row heights, complete-row counts, filter columns,
  unused filter width and document overflow for every capture.
- `gallery.html`: the offline comparison surface.

These artifacts contain development data and remain local and Git-ignored.
They are not included in the published prototype branch. Regenerate them to
compare against your current dataset. The prepared worktree also contains
three `stress-320-*.png` captures and `interaction-results.json` from the
interactive verification; those are local evidence, not outputs of the
32-image capture command.

## Complete change and verification checklist

Use the same questions, no filters, collapsed details, scroll position at the
top and browser zoom at 100% for density comparisons. Review at 1440 × 900
and 1920 × 1080, both themes, and both navigation states. Also check 768px
and 320px widths with example text enabled.

<!-- markdownlint-disable MD013 -->

| Change | How to verify | Expected result |
| --- | --- | --- |
| Separate throwaway worktree and launcher | Run the start command; inspect the terminal and branch | Port 3137 and the prototype branch; normal development services stay available |
| Original comparison | Choose `original` | Existing cards, metadata above text, and the visible filter gap |
| Four-control filter layout in A/B/C | Compare the last filter's right edge and search width against `original` | No empty fifth track; search gains 202px in the captured desktop layouts |
| A split rows | Choose A and compare with the requirement selection question list | Shared area surface, text left, facts right, compact dividers |
| B register | Choose B; compare navigation collapsed and expanded | Aligned code/text/facts columns and alternating shading; narrow text may wrap more |
| C compact cards | Choose C | Individual compact cards, leading border, question before metadata |
| Version and status | Enable examples; find version 12 and archived text/icon | Both remain readable and independent of color |
| Long text and responsive layout | Enable examples; resize to desktop, 768px and 320px; scroll through full text | Rows grow; text remains available; no horizontal page overflow in A/B/C |
| Compact action placement | Inspect edit/archive controls and suggestion controls where data provides them | Separate controls remain reachable; direct row action buttons are 32px in A/B/C |
| Disclosure behavior | Focus a question and press Enter twice; also click its text | Details open and close; help text and answer format remain accessible |
| Actions stay independent | Open edit on a collapsed row | Editor opens without expanding the row |
| Filters survive switching | Search a code or select an area/status, then switch variants | Same filtered questions and filter values; existing area grouping and code order remain |
| Example filtering | Enable examples and choose archived status | Temporary archived question appears; reset restores the live-data view |
| Suggestion access | Use the suggestion filter and available area/question indicators | Existing review surfaces remain available; mutation attempts are blocked |
| Variant controls | Use selector, buttons and Left/Right outside editors; reload | URL follows the choice, cycling wraps, reload retains the variant |
| Editor keyboard behavior | Press arrow keys in search, a select and an edit dialog | Normal control behavior; no unexpected variant change |
| State and measurements | Open review panel, switch variant, measure and inspect state | Current variant and interaction state are visible; measurement snapshots are explicit |
| In-memory examples and reset | Add examples, filter/expand, then reset; separately reload | Examples disappear; reset clears filters and expansion; no data persists |
| Blocked writes | Open edit, change text and attempt save; inspect browser Network and state panel | Clear prototype error, blocked-write count increases, no API mutation request |
| Developer Mode coverage | Enable Developer Mode and inspect filter, list, summary and review controls | Curated prototype markers identify relevant surfaces; existing action markers remain |
| Production gate | Inspect the prototype enable condition and API guard | Prototype layout, switcher and write blocking require development mode plus the explicit prototype flag |
| Gallery and measurements | Run capture command and open generated gallery | 32 comparisons, zero unused filter width in A/B/C, measurement JSON alongside images |

<!-- markdownlint-enable MD013 -->

## Measurements and verdict

The baseline contains 32 development RFI questions. Complete-row counts
exclude rows covered by the common floating switcher. Both themes produce
the same counts. The open review panel is excluded from the captures.

<!-- markdownlint-disable MD013 -->

| Viewport | Navigation | Original | A | B | C |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 | Collapsed | 4 | 6 | 7 | 6 |
| 1440 × 900 | Expanded | 4 | 6 | 5 | 6 |
| 1920 × 1080 | Collapsed | 6 | 9 | 9 | 8 |
| 1920 × 1080 | Expanded | 6 | 9 | 9 | 8 |

<!-- markdownlint-enable MD013 -->

The first original row is 90px. A measures 59.5px at 1440 and 52px at 1920.
B measures 55.8px except at 1440 with expanded navigation, where it measures
77.5px. C measures 61.8px. The original filter leaves 202px unused; all three
alternatives reduce that to zero. These measurements describe this dataset,
not fixed requirements for row heights or counts.

**Provisional verdict:** A best satisfies the issue's request to coordinate
with #1355 while improving density consistently. B is useful for scanning
codes but is sensitive to available text width. C offers more question-text
width and individual separation at the cost of consistency with #1355.
The maintainer still needs to choose a design or combination of elements.

## Verification status and implementation boundary

The 32-image capture completes. Interactive browser checks pass for variant
switching, URL reload/wrap behavior, filter and expansion preservation,
keyboard disclosure, editor/select arrow handling, reset, long text at
1440/768/320px, action independence and a blocked save with zero API mutation
requests. All three alternatives have no horizontal document overflow at
those checked widths and keep direct row-action targets at least 24px.

TypeScript, targeted Biome formatting/lint, Tailwind and target-size lint,
and the existing 26 RFI UI unit tests pass. The prototype adds no permanent
tests or manual product cases: it is a disposable design experiment, not
the production implementation. The eventual implementation still needs the
automated and manual coverage specified in the issue brief, especially full
suggestion workflows and permission combinations. No full production build
or end-to-end regression suite is claimed here.

The source changes are limited to the prototype summary/styles, the shared
prototype switcher, the RFI client's gated wiring and example state, the
gated client write blocker, two launcher/capture scripts, task-runner entries
and this guide. No database, API endpoint, authentication configuration,
translation catalog or committed environment file changes are part of this
prototype. The primary development checkout remains unchanged.
