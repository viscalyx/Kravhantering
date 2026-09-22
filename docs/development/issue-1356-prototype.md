# Expanded controls prototype for issue 1356

This guide is for the maintainer reviewing the visual alternatives and for the
implementer who later builds the chosen design. It answers: **which layout
makes question actions and answer actions easiest to distinguish while keeping
all controls directly accessible?**

This is throwaway code on `prototype/issue-1356-expanded-controls`, based on
`e486c01f`. No design is approved yet. Keep the variants as comparison evidence;
implement the selected design with production coverage in a separate change.
The approved collapsed-question layout from #1355 remains the baseline.

## Start and show it

The prepared worktree has its own dependencies and build output. Its environment
files are read-only links to the existing development checkout. Start with:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/prototype-issue-1356
npm run prototype:1356
```

Open the [interactive prototype](http://localhost:3000/sv/requirements/stewardship?tab=questions&variant=D).
Forward port **3000** in VS Code if accessing the workspace remotely. The
launcher refuses to replace a process already using that port. Ctrl+C stops
only the prototype server. An alternative port is supported with
`PROTOTYPE_PORT=3137 npm run prototype:1356`.

The app uses normal development authentication and the existing SQL Server and
Keycloak services. Stop any development app currently using port 3000 before
starting this prototype. Sign in directly on the prototype if necessary, using
`ada.admin` / `devpass`. The registered local authentication callback already
uses port 3000. No identity provider registrations or environment-file edits
are required. The screenshot gallery remains on port 3138.

The sample security question `SÄK-KUF001` opens automatically with its three
answers. The area filter initially selects Säkerhet. Clear it to explore the
rest of the loaded catalog.

## Compare the five layouts

The floating bottom bar cycles through `original`, `A`, `B`, `C` and `D`. Left and
right arrow keys also cycle when focus is outside interactive controls. The
`variant` URL parameter updates immediately, survives reload, and can be copied.
Switching variants retains expanded questions, filters and temporary examples.

<!-- markdownlint-disable MD013 -->

| Variant | Structure | What to judge |
| --- | --- | --- |
| original | Existing question toolbar and bordered answer actions | Baseline for visual comparison and control availability. |
| A | Labeled question-action band; compact answer actions beside content | Whether the two action levels are clear without adding height or moving answer actions away from their text. |
| B | Question-action sidebar; answer actions below each answer | Whether the stronger separation is worth the extra answer height and reduced content width. |
| C | Shared answer/content headings, aligned action column and alternating rows | Whether the stable two-by-two action grid helps scanning without making the view feel too tabular. |
| D | Side-by-side numbered answer cards; edit in the heading, lifecycle controls in the footer | Whether comparing answer meaning and selected requirements is easier with a distinct card per answer. |

<!-- markdownlint-enable MD013 -->

A, B and C give editing a stronger visual treatment, make secondary
actions quieter, retain a red delete icon and label, and use action buttons that
are 32px high.
Answer text uses 14px semibold type; action labels use 12px type. They remove
the answer list's outer frame and the reorder handle's
box while retaining row dividers. Descriptions and source indicators share the
same left edge as the answer text. Every existing action remains visible.

At narrower widths the layouts stack or wrap. The source previews, editors,
visibility panel and confirmation dialogs retain their existing presentation.

## What changes in D

Open [prototype D](http://localhost:3000/sv/requirements/stewardship?tab=questions&variant=D).

D changes the reading order and control placement:

1. A separate question toolbar keeps all six question-wide actions together.
2. Numbered answer cards appear side by side with larger answer headings and
   visible status. The grid uses three, two or one columns as space allows.
3. **Redigera svar** sits in each card heading and opens the existing editor
   directly. It remains visible independently of lifecycle actions.
4. Descriptions lead into a labeled requirements section. Existing source pills,
   counts and expandable previews remain interactive inside each card.
5. Activation, archiving and deletion sit in a separate footer. Equal-height
   cards align these footers within each grid row.
6. Reorder handles move the whole card with pointer drag or keyboard arrows.
   The numbers follow the displayed order; reset restores the original order.
7. Read-only examples hide editing and lifecycle controls. Swedish and English
   copy, dark theme and Developer Mode markers cover the new surfaces.
8. The switcher includes D and wraps from D to original in both directions.
   The launcher and gallery open D by default.

To review: compare D with original using the bottom arrows, then select long
text and mixed states under **Granska och jämför**. Open **Redigera svar**,
inspect the editor and cancel. Expand a requirements count inside a card,
reorder a card, then reset. Try the expanded navigation and a narrow window to
see when three columns become two or one.

D spends more space on each answer and makes comparison the main activity.
Long content and two-column layouts can require more vertical scrolling.
This is an explicit tradeoff to judge, not evidence of faster task completion.

## Review controls and temporary state

Open **Granska och jämför** in the bottom bar. The panel contains variant
buttons, a checklist, measurements and the complete relevant question/answer
state for the selected area. Measurements include answer heights and each
action's target dimensions. Click **Uppdatera mått** after resizing the browser.

Use **Granskningsscenario** to compare:

- **Befintliga data:** the loaded catalog and the default sample question.
- **Lång fråga, långa svar och beskrivningar:** temporary long content with the
  existing source links, for wrapping and alignment checks.
- **Utan kravurval, saknat kravurval och arkiverat svar:** three temporary answer
  states, including an absent description and empty source collections.
- **Skrivskyddade frågekontroller:** temporarily hides question and answer
  management controls. This is a layout example, not an authorization test.

**Återställ exempel och ordning** restores the initial loaded catalog and
sample selection. Reload also restores the data. Both question and answer
reordering stay in memory. Editors open normally, but saving and other API
mutations through `apiFetch` return a visible prototype message. The review
panel records blocked attempts. Confirmations can be inspected and cancelled;
confirming deletion still cannot write through this client guard.

The guard is a prototype convenience, not a server authorization boundary.
Use this app for reviewing the question layouts. Other application pages are
not part of the prototype review.

## Screenshot gallery

With the prototype running:

```sh
npm run prototype:1356:capture
npm run prototype:1356:gallery
```

Open the [local gallery](http://localhost:3138/gallery.html). Forward port
**3138** if needed. You can also open `tmp/prototype-1356/gallery.html` directly
in a browser without a running app or authentication. Keep the accompanying
PNG and JSON files beside it for full-size links and measurements.

The gallery contains 80 comparisons: five variants, two desktop sizes, two
themes, two navigation states and two content scenarios. Select the same
conditions and compare all five variants side by side. Click a screenshot for
native resolution; **Full question** shows the entire expanded question even
when long content extends below the viewport. Full-question captures hide the
overlapping sticky area heading and prototype
switcher so the question itself is unobstructed. The normal page screenshot keeps
the navigation and surrounding application context visible.

The capture command also creates narrow-window examples at 320px and 768px,
`measurements.json`, and `verification.json`. It uses the existing local login
flow without changing the identity provider. Screenshots and records stay in
ignored local output; they are not committed or published to GitHub.

To repeat only the interaction checks using existing captures:

```sh
npm run prototype:1356:capture -- --verify-only
```

## Complete change and verification checklist

<!-- markdownlint-disable MD013 -->

| Change | How to verify | Expected result |
| --- | --- | --- |
| Five layout variants on the existing route | Use the bottom arrows, then reload or copy the URL. | `variant=original`, `A`, `B`, `C` or `D` matches the visible layout; question expansion survives switching. |
| Labeled question action group | Compare original with A, B, C and D. | Six existing actions have a recognizable question-level location. |
| Compact answer action group | Inspect every answer in each variant. | Edit, activate/deactivate, archive/reactivate and delete remain directly visible; no menu or extra click is introduced. |
| Editing emphasis and quieter secondary actions | Compare Edit with adjacent controls in both themes. | Edit has an accent background; secondary actions have less framing; delete retains a red icon and label. |
| Description/source alignment and reduced framing | Inspect all three answers and expand a source preview. | Text, descriptions and sources align; removed frames do not hide controls or collapse source content. |
| Variant B sidebar | Compare B with A, then narrow the viewport. | Question actions sit left of the answer list on desktop and wrap above it on narrow screens. |
| Variant C columns | Compare C with A, including long text. | Answer content and action columns align across rows; actions use a two-by-two grid on desktop and wrap on narrow screens. |
| Variant D comparison cards | Open D at 1920px, then narrow the window and expand navigation. | Three numbered cards become two or one columns according to available width; footers align within each row. |
| Variant D editing and requirements | Click Redigera svar and cancel; expand a requirements count. | The existing editor opens directly; requirements expand inside the matching card. |
| Variant D ordering and read-only state | Drag a card, use its handle with ArrowDown, reset, then select read-only. | Whole cards move, numbers follow order, reset restores data, and all management actions disappear in read-only. |
| Responsive and theme treatment | Review both desktop sizes, both navigation states, both themes, 768px and 320px. | No horizontal page overflow or clipped controls; content remains readable. |
| Temporary scenarios | Select each scenario in the review panel. | Long text, absent description, no selection, missing selection, archived answers and read-only controls can be inspected without data edits. |
| Memory-only reordering | Use a handle with pointer drag or keyboard ArrowUp/ArrowDown; reset or reload. | Order changes in the tab, then returns to the loaded catalog. |
| Editor and confirmation access | Open question/answer editors, add answer, visibility conditions and delete/archive confirmation; cancel. | Existing surfaces open from the same controls and confirmations retain their context. |
| Source filtering and requirement details | Expand the requirements count, select source pills and open a requirement in the answer editor. | Existing previews remain accessible and readable. |
| Blocked saves | Edit answer text and press Save, or confirm a lifecycle action. | A prototype message appears; no API mutation is sent; the review panel records the attempt. |
| Review state and measurements | Open the panel after switching, resizing or reordering; refresh measurements. | State and geometry correspond to the current view; blocked saves are listed. |
| Keyboard navigation | Tab through actions and press Enter; use Left/Right in a text field and outside controls. | Focus remains visible; editing keys do not change variants; page-level arrows cycle variants. |
| Developer Mode markers | Enable the existing Developer Mode overlay and inspect the expanded area. | English markers identify the expanded question, question actions, answer list/content/actions and variant switcher. |
| Swedish and English copy | Repeat a comparison on the equivalent `/en/` URL. | Prototype controls and new group labels use the selected language. |
| One-command launch and capture | Run the three commands above from the worktree. | A separate app runs on 3000, captures are generated locally, and the gallery runs on 3138. |

<!-- markdownlint-enable MD013 -->

## File inventory

- `requirement-selection-questions-client.tsx`: prototype gate, URL variant,
  sample selection, temporary scenarios, local reordering and layout hooks.
- `expanded-controls.prototype.tsx`: original/A/B/C/D layout selection, the
  variant C column headings and variant D card headings, beside the existing
  stewardship client.
- `expanded-controls.prototype.css`: scoped alternative layouts, responsive
  behavior, emphasis, spacing and theme colors.
- `ExpandedControlsPrototypeSwitcher.tsx`: floating navigation, review panel,
  scenarios, state, measurements and blocked-write log.
- `api-fetch.ts`: development-only mutation guard for this prototype build.
- Both translation catalogs: all new prototype and group-label copy.
- `package.json`: launch, capture and gallery commands.
- `cspell.jsonc`: correctly spelled Swedish terms used in prototype copy.
- `prototype-1356.mjs`: isolated-port development launcher.
- `prototype-1356-capture.mjs`: finite capture and interaction review plus
  gallery/measurement generation; not a production regression suite.
- This guide: question, alternatives, full change inventory and review steps.

## Recreate the worktree later

The prepared worktree is ready now. From the normal checkout, an additional
machine can fetch the throwaway branch and prepare its own worktree:

```sh
git fetch origin prototype/issue-1356-expanded-controls
git worktree add /mnt/krav-azure-dev-data/.worktrees/prototype-issue-1356 \
  prototype/issue-1356-expanded-controls
```

Install dependencies there with `npm ci`, then link the existing development
checkout's `.env.development.local` and `.env.sqlserver` without editing them.
The original environment, SQL Server and Keycloak services remain shared;
application build output and dependencies remain worktree-local.

## Decision and verification record

No visual design is approved. The review of A, B and C asks for a more distinct
user experience. D explores answer comparison as the primary activity, with
editing separated from lifecycle management. Review D against the original and
judge whether that change is worth the wider cards and additional scrolling
with long content. A, B and C remain available as comparison evidence.

This prototype does not establish a measured usability benefit. The production
implementation still needs the issue's functional, accessibility and automated
coverage, including matching manual cases. The production manual-test catalog
is unchanged because this branch contains only throwaway review tooling.

## Observed comparisons

Expanded-content heights for the same sample question are below. These include
question actions, answers and Add answer, and exclude the collapsed summary.
Both themes give the same measurements. They are observations, not fixed design
targets; data and source counts affect height.

<!-- markdownlint-disable MD013 -->

| Viewport and content | Navigation | original | A | B | C | D |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 × 900, existing data | Collapsed | 554px | 556px | 567px | 540px | 657px |
| 1440 × 900, long text | Collapsed | 746px | 739px | 669px | 663px | 805px |
| 1440 × 900, long text | Expanded | 878px | 739px | 784px | 757px | 1240px |
| 1920 × 1080, long text | Collapsed | 580px | 582px | 627px | 600px | 722px |

<!-- markdownlint-enable MD013 -->

A primarily changes visual hierarchy rather than height. B gives question
controls their own location but spends more vertical space on ordinary answers.
C keeps answer actions aligned and uses less height in the 1440px comparison
with collapsed navigation and long text. No layout is the shortest in every
configuration.

The finite browser review covers URL and keyboard switching, retained
expansion, reload, temporary scenarios, narrow windows, pointer and keyboard
answer reordering, reset, previews, delete cancellation, the visibility editor,
blocked editor saves, English copy and Developer Mode markers. Desktop captures
also check action counts, target dimensions and page overflow. The generated
verification record is the exact list of checks and records API mutation
requests. TypeScript and focused formatting, lint, target-size, Tailwind,
Markdown and spelling checks accompany the review. No production test suites
are added by this throwaway branch.

Current review result: 80 desktop captures pass 240 checks for action counts,
target sizes and page overflow; all 40 theme-paired measurements match. All
44 finite interaction checks pass with zero API mutation requests. Gallery
filters show exactly five matching variants in all 16 filter combinations.
D-specific checks include card layout, editor access, pointer and keyboard
reordering, requirement previews, mobile stacking, English labels, Developer
Mode markers and wraparound switching. The manual checklist above includes
all D changes; no production manual-test cases or test suites are added.
