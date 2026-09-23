# Issue 1360: compare the import entry layouts

This guide is for the person reviewing the visual design. The question is:
**Which layout makes selecting a requirement area and providing JSON the
main task, while keeping schema and instructions visible?**

This is a throwaway prototype, preserved on branch
[`prototype/issue-1360-import-layout`](https://github.com/viscalyx/Kravhantering/tree/prototype/issue-1360-import-layout)
based on `daaf0d50`.
No variant is approved. Production implementation remains a separate step.

## Open it

From the prototype worktree:

```sh
npm run prototype:import
```

Or, from any directory:

<!-- markdownlint-disable MD013 -->
```sh
npm --prefix /mnt/krav-azure-dev-data/.worktrees/issue-1360-import-layout run prototype:import
```
<!-- markdownlint-enable MD013 -->

1. Sign in to the existing development app at
   [localhost:3000](http://localhost:3000) in the same browser.
   The usual development administrator is `ada.admin` / `devpass`.
2. Open the [interactive comparison](http://localhost:3136/sv/requirements?prototype=import&variant=A).
3. Use the dark floating bar to choose a variant. Left/right buttons and
   arrow keys cycle through the four choices, including wrapping around.
   Arrow keys inside text fields and selects keep their normal behavior.
4. If using a remote development container, forward port **3136** in the
   editor's Ports view. Use `localhost` for both apps so the existing login
   cookie is available on both ports. Ports 3000 and 8080 retain their normal
   roles in sign-in.

The launcher reads existing development settings without editing them. On
first launch it copies the already installed dependencies into this worktree;
this can take several minutes. It starts a separate Next.js process with its
own build output, using the existing SQL Server and Keycloak services.
It does not start, stop, reset, or reseed those services. Ctrl+C stops the
prototype server. `PROTOTYPE_PORT` can select another unused port.

## Compare the designs

<!-- markdownlint-disable MD013 -->
| Variant | Visible changes | How to assess it |
| --- | --- | --- |
| `baseline` | Reconstructs the 576 px entry form, downloads first and a single vertical input stack. | Establish the reference. It is a reconstruction, not a pixel-exact snapshot of production. |
| `A` | 960 px dialog; requirement area and stacked input on the left; downloads and explanatory text in a quieter right sidebar. | Check whether support remains easy to find without competing with the task. |
| `B` | 760 px dialog; compact horizontal upload target; one continuous form; support below the primary action. | Check whether the narrower reading path is preferable, and whether support is still discoverable. |
| `C` | 1,040 px dialog; requirement area above side-by-side upload and paste surfaces; support and primary action below. | Check whether both input methods are understandable as alternatives and whether the extra width helps. |
<!-- markdownlint-enable MD013 -->

All alternatives use the application's colors, fonts, primary-button style,
real requirements page, navigation, and available requirement areas. If no
authorable areas load, a clearly reported demo fallback keeps the layout
review runnable. The **Tillstånd** inspector reports which source is in use.

Start with A, then compare B and C before choosing. A is a useful first
candidate because support stays visible beside the form. That is a design
hypothesis, not a validated usability result.

## Verify every visible change

Use browser responsive mode at **1440 × 900** and **1920 × 1080**, with
browser zoom at 100%. Preserve the same data while switching variants.

<!-- markdownlint-disable MD013 -->
| Change or control | Verification steps | Expected result |
| --- | --- | --- |
| Dialog width and hierarchy | Switch `baseline`, A, B, C with empty input. | Width and structure match the comparison table; input is the main area in A/B/C. |
| Secondary support treatment | Locate both download controls and all explanatory text in each variant. | Support remains visible without expanding a section. Clicks download clearly named placeholder files. |
| Title and long destination | Click **Fyll exempel**, then **Lång text**. | A/B/C titles wrap; the dialog remains usable. Baseline deliberately retains the old truncation treatment. |
| Form spacing and boundaries | Compare labels, field borders, upload target, support separator, and primary action. | Related input controls form a coherent group; support is separated with lighter treatment. |
| Theme | Click **Mörkt tema**, then **Ljust tema**. | Text, borders, fields, upload surface, and status feedback remain readable. |
| Navigation context | Click **Dölj dialog**, expand/collapse the real left navigation, then **Visa dialog**. | The layout can be compared against either real navigation state. |
| Select requirement area | Choose an available area. | The selected destination appears in the title; preview still needs valid sample input. |
| Paste | Click **Fyll exempel**, then edit the JSON. | Text stays editable and persists across variant switches. |
| File chooser | Click **Exempelfil**, then select that file through the upload surface. | The file name and its content appear; no import is saved. |
| Drag and drop | Drag the downloaded sample onto the upload surface. | The file replaces the JSON content, exactly as selection does. |
| Preview blocker | Click **Återställ**, then try invalid JSON after selecting an area. | Preview is disabled; a visible status explains the blocker. |
| Simulated preview | Click **Fyll exempel**, then **Förhandsgranska krav**. | A clearly labelled simulation shows the candidate count. It does not open real review or execute an import. |
| Keyboard | Tab through the dialog and toolbar; use Shift+Tab, Escape, and variant arrows. | Focus remains visible and cycles through the prototype; Escape closes, and reopening focuses Close. |
| Variant URL | Select C, copy the URL, then reload. | C remains selected; input state resets because it is in memory. |
| Full relevant state | Click **Tillstånd**, then change variant, input, destination, theme, and preview. | The inspector exposes the current values, file name, validation, preview, and source of areas. Close it for layout screenshots. |
| Small viewport | Use 390 × 844 and 320 × 844; scroll the dialog body. | Multi-column alternatives stack; controls remain reachable. Desktop remains the main design target. |
| English | Open `/en/requirements?prototype=import&variant=B`. | Prototype labels and controls use English. Real area names remain domain data. |
| Developer Mode | Focus a button and press Ctrl+Alt+Shift+H (Command+Option+Shift+H on macOS). | Curated English markers identify the prototype dialog, support panel, and controls. |
| No import mutation | In DevTools Network, filter for `/import/` while trying input and preview. | No import POST request is sent. Other existing page reads still occur. |
<!-- markdownlint-enable MD013 -->

The floating toolbar is evaluation tooling, not part of a proposed product
layout. It reserves space below the dialog. Close the state inspector before
judging proportions. The real navigation retains its existing preference
behavior; import state is never persisted. Prototype theme changes are
temporary and do not update the stored theme preference.

## Screenshots and repeatable walkthrough

Open the [screenshot gallery](http://localhost:3136/sv/prototype-1360/index.html).
Click a screenshot to inspect its full resolution. The gallery's image files
and index also work locally without a running server.

To regenerate the screenshots and browser verification evidence, keep the
prototype server running and use a second terminal in this worktree:

```sh
npm run prototype:import:capture
```

The walkthrough uses the existing developer login and Chromium. It compares
all four variants at both desktop sizes, both themes, and both navigation
states. Additional images show long labels, simulated preview, invalid input,
responsive layouts, English, and the actual unchanged import dialog at both
desktop sizes. The generated `measurements.json` records
dialog geometry, browser exceptions, and import mutation requests.

The recorded run passes with 47 screenshots, 44 measured prototype frames,
no browser exceptions, and no import mutation requests. TypeScript checking,
focused Biome checks, Markdown lint, and spelling checks also pass. The
walkthrough covers variant switching, retained input, reload reset, file
selection, drag and drop, invalid JSON, simulated preview, placeholder
downloads, keyboard focus, and both requested desktop viewports. At 320 px,
the evaluation toolbar has extra reserved space so it does not overlap the
dialog; the dialog body scrolls to expose the remaining controls.

This is a prototype walkthrough, not a replacement for production integration
tests. Before implementing an approved design, verify the real import contract
and update the existing automated and manual coverage for REQ-17.

## Complete file inventory

Paths below are relative to the prototype worktree.

<!-- markdownlint-disable MD013 -->
| File | Change | Verification |
| --- | --- | --- |
| `app/[locale]/requirements/requirements-client.tsx` | Development-only query gate mounts the prototype on the existing route. | Open with `?prototype=import`; remove it to use the normal page and dialog. |
| `components/ImportLayoutPrototype.tsx` | Four layouts, in-memory controls, simulated actions, keyboard switcher, focus handling, state inspector, Developer Mode markers. | Use the interaction checklist above. |
| `components/ImportLayoutPrototype.module.css` | Isolated layout widths, grid/stack structures, support hierarchy, theme and responsive styles. | Compare screenshots and viewport sizes. |
| `messages/en.json`, `messages/sv.json` | Prototype-only translation namespace. | Compare the `/en` and `/sv` URLs. |
| `package.json` | Adds `prototype:import` and `prototype:import:capture`. | Run both commands. |
| `scripts/prototype-import-layout.mjs` | Launches this worktree on its own port with existing settings. | Port 3136 opens; the original app on port 3000 remains available. |
| `scripts/prototype-import-capture.mjs` | Repeatable browser walkthrough and screenshot gallery generation. | Run capture; inspect its exit status, gallery, and measurements. |
| `public/sv/prototype-1360/` | Screenshots, gallery, and geometry evidence. | Open the gallery and full-size images. |
| `app/[locale]/requirements/import-layout-prototype.md` | This launch, change, and verification guide. | Follow the instructions from a new browser session. |
| `app/[locale]/requirements/import-layout-prototype-issue-note.md` | Prepared context pointer for issue #1360. | Links the branch, design question, and pending verdict. |
<!-- markdownlint-enable MD013 -->

No production import component, API, database schema, or environment file is
modified. Downloaded schema/instruction files are placeholders; JSON checks
only inspect version and nonempty candidate descriptions. Server-side schema
validation, permissions, budgets beyond the sample file-size check, later
review steps, and persistence are outside this prototype's evidence.

## Decision to record after review

Record the preferred variant or combination, what made the task clearer, and
any problems at the required sizes. Then implement the selected design with
the real import component and its existing behavior and test contracts.
Keep these alternatives on the throwaway branch as the primary source.
