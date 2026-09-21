# Question layout prototype for issue 1355

This guide is for reviewing the visual design before choosing an implementation.
The question is: **which compact question layout makes comparison easier while
keeping question text, metadata and controls readable?**

This is throwaway code on `prototype/issue-1355-question-layouts`, based on
`4b268d39`. No design is approved yet. The provisional recommendation is A,
because it gives question text priority with the smallest structural change.
B and C expose alternatives worth comparing with real, long question text.

## Open the prototype

The worktree is separate from the normal development checkout:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/issue-1355-prototype
npm run prototype:1355
```

Open the [live prototype](http://localhost:3135/sv/requirements/stewardship?tab=questions&variant=A).
Forward port **3135** in VS Code if you access the workspace remotely.
The normal development services and port 3000 remain undisturbed.
Stop this server with Ctrl+C in its terminal.

Sign in to the normal development app at `http://localhost:3000` first if
needed. Use the same hostname for both apps: localhost cookies are shared
across ports. Then return to the prototype URL. The development account is
`ada.admin` with password `devpass`. The prototype retains normal authentication
and permissions; it does not add a new identity-provider client.

If live sign-in is unavailable, use the screenshot gallery below to review
every layout without a browser session. The capture command completes the
existing local Keycloak flow against the worktree without changing IdP settings.

On this prepared worktree, dependencies are copied locally and the existing
environment files are linked read-only. For a fresh worktree, install with
`npm ci`, then link the existing `.env.development.local` and `.env.sqlserver`
from the development checkout. Do not copy secrets into committed files.
The launcher runs the existing metadata preparation automatically.

To choose another unused port:

```sh
PROTOTYPE_PORT=3136 npm run prototype:1355
```

## Compare the four choices

The route stays the same. Change only the `variant` parameter:

- `original`: current production-source layout, including metadata first,
  shadows, padding and gaps. The common prototype notice and switcher are added
  to every choice so comparisons use the same available space.
- `A`: question first, quieter metadata below, compact individual rows.
- `B`: question on the left and a separate facts column on the right;
  a single bordered surface per requirement area.
- `C`: aligned ID, question and metadata columns, with alternating row shading;
  a single bordered surface per requirement area.

Use the arrows in the floating bottom bar, or Left/Right while focus is outside
an editor. The URL changes immediately and survives reload. Switching layouts
preserves filters, expanded questions and temporary order. Arrow keys in inputs,
selects, dialogs and reorder handles keep their existing purpose.

The **Granska och visa tillstånd** button opens a review panel:

- **Växla lång frågetext** appends an explicitly temporary long-text example to
  the first three questions. Toggle it again to restore the original text.
- **Mät rader** records viewport size, each row's height and how many complete
  rows fit above the floating switcher.
- **Återställ data och filter** reloads saved data and clears expansion and
  filters. A browser reload also discards temporary changes.
- The state display includes the current variant, filters, expansion,
  hierarchy/visibility panels, question text and order, permissions and answer
  order. Measurements are snapshots; remeasure after changing the layout.

Close the review panel before judging the page so it does not cover the list.

## Screenshot gallery

With the prototype server running:

```sh
npm run prototype:1355:capture
```

The command reads existing development data and creates:

- `tmp/prototype-1355/gallery.html`: a comparison gallery containing the
  screenshots, filterable by viewport, theme and navigation state.
- `tmp/prototype-1355/measurements.json`: the measured rows for all 32 captures.
- 32 PNG files: four choices × two viewports × two themes × two navigation
  states. Clicking a gallery image opens its PNG at native resolution.

Open `gallery.html` in a browser or VS Code HTML preview. The embedded images
work offline. Keep the PNGs beside it for native-resolution image links.
Generated captures stay local and are not committed to the prototype branch.
For a different server port, use the same `PROTOTYPE_PORT` override on capture.

## Complete change and verification checklist

<!-- markdownlint-disable MD013 -->

| Change | How to verify |
| --- | --- |
| A: question text above metadata | Switch original → A. The question is first and emphasized; ID, type, status, answers and area remain readable below. |
| B: separate facts column | Switch to B. Question text occupies the left; ID/area and other metadata occupy a separate right column. |
| C: aligned ledger | Switch to C. Compare the ID, question and metadata columns across neighboring questions; check alternating row backgrounds in both themes. |
| Reduced padding, gaps, corners and shadows | Compare the same original and alternative screenshots. Use **Mät rader** and compare full-row counts without changing scroll, filters or data. |
| Stable control positions | Compare questions with and without hierarchy badges. Desktop rows reserve a right-side slot. The drag handle and disclosure remain on the left. |
| Status icon plus text | Inspect active and archived rows in A/B/C. Status includes an icon and explicit text; color is not the only signal. |
| Matching drag preview | Drag DRF-KUF001 using its handle. Its floating preview uses the selected text/metadata layout and hierarchy slot. Release over another question in the same area. |
| Temporary question and answer reordering | Reorder using the handle with pointer or keyboard Up/Down. Refresh and verify saved order returns. No reorder write reaches the API. |
| Other saves disabled | Open a question editor, change text and save. A prototype message explains that saving is disabled; the stored question remains unchanged. |
| Expansion preserved | Expand two questions and change variant. Both remain expanded. Collapse them again before measuring density. |
| Hierarchy and visibility preserved | Open a hierarchy badge without expanding the row; close with Escape. Expand a conditional question and inspect its existing visibility editor. Saving remains disabled. |
| Existing search and filters | Search for DRF, filter by requirement area and by archived status. Confirm results and metadata remain correct in each variant. Reordering stays disabled under search/status filters. |
| Long text wraps | Toggle the long-text example and compare A/B/C. No fixed-height clipping or ellipsis is introduced. |
| Narrow layout | Resize to 320 CSS pixels. B/C stack their content, and hierarchy controls move below the question. Desktop is the design priority. |
| Keyboard variant switching | Left/Right cycles original → A → B → C with wraparound. Focus the search field and use Left/Right; it moves the caret instead. |
| Shareable variant URLs | Copy the URL after switching and reload it. It opens the same variant, with saved data restored. |
| Review panel and measurements | Open **Granska och visa tillstånd**; expand a question or reorder, then inspect the live state. Remeasure after resizing. |
| Real app context | Toggle the existing navigation rail and theme. The original page shell, filters, expanded content and question data remain in place. |
| Swedish and English labels | Change the URL locale to `en`. Prototype controls and metadata labels are translated; authored question content retains its source language. |
| Developer Mode markers | Enable Developer Mode and inspect the prototype notice, switcher, metadata, disclosure, reorder and hierarchy surfaces. |
| Development-only activation | The launcher enables the prototype flag only for its child process. Ordinary development runs keep the original rendering; production builds cannot enable the variants or switcher. |
| Separate worktree and server | Compare `git status` in the normal checkout and this worktree. Only the prototype branch contains these changes; stopping its terminal leaves other services running. |

<!-- markdownlint-enable MD013 -->

## Review result and limits

Browser measurements confirm the original first collapsed row is 90 CSS pixels.
Compare full-row counts, not just the first row: question length, condition
metadata, requirement area headings and navigation width affect density.

The following counts use the current 13-question development dataset, no
filters, collapsed questions and scroll at the top. Both themes and both
navigation states give the same counts in this capture:

| Variant  | First row | Rows at 1440 × 900 | Rows at 1920 × 1080 |
| -------- | --------- | ------------------ | ------------------- |
| original | 90 px     | 4                  | 6                   |
| A        | 61 px     | 6                  | 7                   |
| B        | 53 px     | 6                  | 8                   |
| C        | 56 px     | 6                  | 7                   |

Verification includes all 32 visual captures; browser checks for variant
switching, retained expansion, independent hierarchy access, search, keyboard
and pointer reordering, reload reset, and long text at 1440 and 320 pixels;
and a blocked question-save attempt. No API mutation requests occur during
those interaction checks. The 56 existing question-client/API-helper unit
tests pass with the prototype flag off. TypeScript, targeted formatting/lint,
target-size policy lint and Tailwind class lint also pass.

The prototype evaluates presentation. It does not implement #1356's expanded
control redesign or #1357's RFI redesign. There are no schema, database, API
contract or authorization changes. Normal GET requests still read the existing
development database. All non-read calls through the shared client API helper
are blocked while the prototype launcher is active. Reorder handlers update
component memory and return before their API calls.

No new production test suite or manual-case edits are part of this throwaway
branch. The implementation still needs the issue's regression coverage and
manual/Playwright synchronization after a design is selected. Geometry belongs
in automated checks, not manual cases. This review guide is for the prototype.

The next decision is to select A, B or C, or specify a combination. Capture that
decision on issue 1355 before rewriting the winner as production code.
