# Package layout prototype for issue 1353

This throwaway prototype answers: **which layout makes package names,
purpose, responsibility and contents easiest to compare?**

Branch: `prototype/issue-1353-package-layout`.
Base: `ba673ee7` from the main checkout. No winner is approved yet.
The initial recommendation is **A**, because it improves the existing table
without adding a selection step. B and C make the tradeoffs visible.

## Open it

The dedicated development server uses port **3133**. The normal app stays on
port 3000. Sign in to the normal app first, then open the prototype using the
same hostname, `localhost`, so the existing session cookie is available.
If authentication sends you back to port 3000, finish signing in and reopen
the prototype link. No Keycloak configuration changes are needed.

- [Open A in Swedish](http://localhost:3133/sv/requirements/stewardship?tab=packages&variant=A)
- [Open A in English](http://localhost:3133/en/requirements/stewardship?tab=packages&variant=A)
- [Open the screenshot gallery](./index.html)
- [Open the normal app for comparison](http://localhost:3000/sv/requirements/stewardship?tab=packages)

Start or restart with one command. Stop this server with Ctrl+C in its
terminal. If port 3133 is already listening, use the running instance.

```sh
npm --prefix /mnt/krav-azure-dev-data/.worktrees/issue-1353-package-layout run prototype:1353
```

For a remote workspace, forward ports 3000 and 3133 to your computer and open
both with `localhost`. The launcher reads the original checkout's existing
environment without editing its files. `PROTOTYPE_SOURCE` overrides the
source checkout, which defaults to `/workspace`; `PROTOTYPE_PORT` overrides
the prototype port. Dependencies are copied from the source if needed.

## Five-minute review

1. Open A. Use the bottom bar to compare **Before**, **A**, **B** and **C**.
   The URL contains `variant=before`, `variant=A`, `variant=B` or `variant=C`.
   Left/right arrow keys also switch, except while editing text or in a dialog.
2. Compare at 1440 × 900 and 1920 × 1080 using browser responsive mode.
   Expand/collapse the real navigation and use its theme control.
3. Enable **Long-text samples** / **Långa exempeltexter**. These are four
   synthetic, memory-only examples: long text and identifiers, archived and
   anonymous responsibility, counts of 0/1/14/209, and a hidden assignment
   action. Switch back to compare the same existing application data.
4. Open **Review guide** for the complete checklist below. Open **Inspect
   state** below the list to inspect the current variant, visible data,
   selection, filter and preview changes.
5. Try editing, archiving or deleting a row. **Apply in preview** changes
   memory only. **Reset previews** or a reload restores the data. Reload
   retains the URL variant but clears sample selection and local edits.

## Every change and how to verify it

<!-- markdownlint-disable MD013 -->

| Change | How to verify | Expected result |
| --- | --- | --- |
| A: compact seven-column table | Switch Before → A without changing data or viewport. | More combined width for name/purpose; 142px action column instead of 220px. |
| B: name and purpose grouped in rows | Switch to B and compare consecutive packages. | Name/status/count sit above the complete purpose; responsibility and actions sit alongside. Rows are taller. |
| C: split list and detail | Switch to C and select several package names. | The selected package's full purpose, responsibility, status, count and actions appear in the detail pane. Full-purpose comparison requires selection. |
| Unbroken counts | Enable samples; inspect 0, 1, 14 and 209 in Swedish and English. | Each count and noun stay together in A/B/C. |
| Compact row actions | Tab through co-authors, edit, archive/reactivate and delete. Hover each. | Stable order, labels/tooltips, visible focus and 28px targets in A/B/C. |
| Assignment-control variation | Inspect the fourth sample. | Co-author management is absent, other controls retain their order. This previews layout, not authorization enforcement. |
| Status text and icon | Inspect active/archived samples; preview archive/reactivate. | Text and icon identify the package's own state. Requirement-version status is unchanged. |
| Responsibility hierarchy | Inspect a long name, long HSA-id and the anonymous sample. | Name is primary, HSA-id is secondary and can scroll with keyboard focus; Anonymous/Anonym replaces the internal sentinel. |
| Full purpose text | Inspect the second sample, including its second paragraph. | No truncation or hover is needed to read the purpose. |
| Count dialog entry | Activate a count using mouse and Enter; press Escape. | A clearly marked preview dialog opens, takes focus and closes. It does not load real linked requirements. |
| Reversible preview edits | Edit name/purpose, archive/reactivate, or remove a row; inspect state; reset. | Visible state changes locally and resets. No package API writes occur. |
| Create/co-author stubs | Open these actions. | A dialog explicitly identifies the preview; it performs no workflow. |
| Filter | Search a name or purpose fragment and clear it. | Matching packages remain; typing arrow keys does not switch variants. |
| URL switcher | Use buttons/arrows, copy the URL, reload. | The chosen variant remains selected. The bottom bar uses short labels on narrow screens. |
| Review guide and state inspector | Expand both details panels. | Each change has instructions; relevant state is inspectable after a switch or action. |
| Language and themes | Open both locale URLs; cycle the real theme control. | Prototype labels, counts and status are localized and readable in light/dark mode. Authored live data retains its original language. |
| Narrow layout | Use 375px and 320px widths. | Page width stays within the viewport; the table scrolls internally, B stacks, C stacks list/detail. |
| Developer Mode markers | Enable Developer Mode and inspect the prototype. | Curated markers identify workspace, switcher, responsibility, status, counts and row actions. |
| Isolated launch | Start with `npm run prototype:1353` inside this worktree. | A separate server uses port 3133 and its own build output. Normal `npm run dev` does not enable the prototype. |
| Development-only gate | Inspect the gate in the package client and switcher. | Prototype rendering requires a development build and the launcher's explicit flag. No production design is promoted. |

<!-- markdownlint-enable MD013 -->

## Measured comparison

The same 43 live development packages are used across the desktop matrix.
Before reproduces the current table body for safe side-by-side comparison;
the extra prototype toolbar, review guide and stub dialogs are not part of
the production page. The normal app remains the full-workflow reference.

Widths below are rounded CSS pixels; both themes produce the same measures.
The text measurement is the combined name and purpose column width.

<!-- markdownlint-disable MD013 -->

| Viewport | Navigation | Text before | Text A | Action before → A | Table before → A | “14 krav” before → A |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 × 900 | Collapsed | 479 | 642 | 220 → 142 | 1246 → 1246 | 2 lines → 1 |
| 1440 × 900 | Expanded | 432 | 450 | 220 → 142 | 1196 → 1054 | 2 lines → 1 |
| 1920 × 1080 | Collapsed | 936 | 1122 | 220 → 142 | 1726 → 1726 | 1 line → 1 |
| 1920 × 1080 | Expanded | 753 | 930 | 220 → 142 | 1534 → 1534 | 1 line → 1 |

<!-- markdownlint-enable MD013 -->

At 1440px with expanded navigation, A fits the available table surface
instead of needing the horizontal scroll present in Before. Long English
count labels have a wider reserved column. Full long text can still make
rows tall: preserving the information takes priority over uniform height.

## Verification and evidence

- TypeScript type checking passes.
- Focused Biome formatting and lint checks pass for the changed code.
- Browser exercise covers all four views across two desktop sizes, two
  navigation states and two themes: **32 combinations**.
- Additional checks cover English long-text samples, anonymous names,
  single-line counts, 28px targets, edit/archive/delete/reset previews,
  count-dialog keyboard activation and Escape, filtering, arrow-key
  exclusions, reload behavior, and 375px/320px layouts.
- The browser exercise reports **zero page errors and zero API writes**.
- [Raw browser measurements](./measurements.json) contain the captured
  geometry and verification timestamp.
- [Screenshot gallery](./index.html) provides Before/A/B/C, expanded dark
  navigation, English long text and a narrow-screen view.

This is throwaway design exploration. No permanent automated tests or
manual-case changes are introduced, following the prototype skill. The full
repository check suite and a production build are not part of this review.
A production implementation still needs the issue's automated and manual
coverage, real authorization/workflow verification, and accessibility review.
The sample permission flag demonstrates control placement only.

## Files and purpose

- `package-layout.prototype.tsx`: three views, Before reference, sample data,
  filter, review guide, state inspector and memory-only action previews.
- `package-layout.prototype.module.css`: table proportions, action sizes,
  identity scrolling, row/split structures and responsive/theme rules.
- `PrototypeSwitcher`: shared bottom bar, URL selection and keyboard cycling.
- `RequirementPackagesClient`: development-only opt-in rendering gate;
  existing read-only data loading is retained.
- English and Swedish message catalogs: all prototype labels and review text.
- `prototype-package-layout.mjs` and the `prototype:1353` package command:
  isolated startup using the existing development environment.
- This review folder: instructions, complete checklist, measured results,
  screenshots and the offline gallery.

No database schema, API, authentication configuration, environment file or
shared development service is changed. The prototype branch is the primary
source for review; the main checkout keeps its existing application code.
