# Requirements Table Column Resizing Integration Tests

> Test flow documentation for [`requirements-table-resize.spec.ts`](tests/integration/requirements-table-resize.spec.ts)

This suite verifies that the Krav list keeps resizing responsive under
rapid pointer dragging on both mobile and desktop layouts, does not
fall into a React render loop while persisting the final width, and
clips resize-divider overlays around an expanded inline detail pane.

## Data Model

|Item|Purpose|
|---|---|
|Storage key constant|Swedish width override key.|
|`description` resize handle|Divider for `Beskrivning` resize.|
|`area` resize handle|Later divider used to verify live divider movement.|
|Expanded detail cell|`colSpan` row that must not contain resize segments.|
|Bottom resize segment|Pointer-only divider segment rendered below the detail pane.|
|Viewport matrix|Runs at `375x667` and `1280x720`.|

Keep the storage key constant in sync with
`getRequirementColumnWidthsStorageKey('sv')`.

```json
{
  "description": 520
}
```

## Overview Flowchart

```mermaid
flowchart TD
    A[Start viewport variant] --> B{Viewport}
    B -- 375x667 --> C[Open /sv/kravkatalog]
    B -- 1280x720 --> C
    C --> D{Scenario}
    D -- Rapid drag --> E[Wait for description resize handle]
    E --> F[Start drag and move divider right]
    F --> G[Verify later divider shifts before release]
    G --> H[Drag divider rapidly left and right]
    H --> I[Release pointer]
    I --> J[Persist width without render-loop errors]
    D -- Expanded row --> K[Open first requirement row]
    K --> L[Wait for expanded detail cell]
    L --> M[Verify top and bottom resize segments stay outside pane]
    M --> N[Drag top resize segment]
    N --> O[Persist width while row stays expanded]
    J --> P[Test passes]
    O --> P
```

## Test Setup

- Each test clears `localStorage` with `page.addInitScript(...)` so
  persisted manual widths from previous runs do not affect the baseline.
- The suite reruns the same interaction in nested Playwright `describe`
  blocks for `375x667` and `1280x720` screen sizes.
- The test scrolls the `description` resize handle into view before
  measuring it so the drag path works in the horizontal overflow layout.
- The test subscribes to both browser `console` errors and uncaught
  `pageerror` events before loading the page.
- The drag uses the full-height description divider rendered by the
  table, so the test exercises the same pointer path as a user resizing
  the list.
- The test also samples the `area` divider during an active drag to
  confirm later divider lines move with the previewed columns before the
  resize is committed.
- The expanded-row test uses `[data-expanded-detail-cell="true"]` and
  segmented resize-handle selectors to verify the divider overlay leaves
  a gap over the inline detail pane.
- No fixed wait is used for the commit. The assertions poll the DOM
  width and `localStorage` until the committed resize appears.

## resizes the description column during rapid dragging without render-loop errors

### Purpose: Expanded Detail Pane

This test validates the failure mode reported in the browser: repeated
left-right dragging of the `Beskrivning` divider must still resize the
table, move the later visible divider lines during the live preview, and
must not trigger React's "Maximum update depth exceeded" error in both
the mobile and desktop layouts.

### Flow: Expanded Detail Pane

1. Start the current viewport variant (`375x667` or `1280x720`).
2. Clear browser storage before navigation.
3. Start capturing console and page-level errors.
4. Open `/sv/kravkatalog`.
5. Scroll the `description` resize handle into view and record the
   initial description column width.
6. Record the initial position of the later `area` divider.
7. Begin the drag and move the description divider right once.
8. Assert that the `area` divider has already shifted right before mouse
   up.
9. Continue dragging back and forth with alternating left and right
   deltas.
10. Release the pointer to commit the resize.
11. Assert that the description column width differs from the starting
   value.
12. Assert that the Swedish column-width storage entry now contains a
   `description` override.
13. Assert that no captured error contains the render-loop signatures.

### Sequence Diagram: Expanded Detail Pane

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant T as Table
    participant S as Storage

    P->>P: Apply viewport variant
    U->>P: Open /sv/kravkatalog
    P->>T: Render Krav list and resize handles
    P->>T: Scroll description handle into view
    Note over T: ✓ Description divider is visible
    U->>T: Start drag and move divider right
    T->>T: Update preview widths during drag
    Note over T: ✓ Later divider lines shift before release
    U->>T: Drag divider left and right repeatedly
    U->>T: Release pointer
    T->>S: Persist final width override
    Note over T: ✓ Description column width changed
    Note over P: ✓ No maximum update depth error
```

## clips resize handles around an expanded detail pane and still resizes

### Purpose

This test validates the reported visual bug directly: once a
requirement row expands inline, the description divider must split into
top and bottom segments so no visible line or resize hit area overlaps
the detail pane, and resizing must still commit successfully while the
pane remains open.

### Step-by-Step Flow

1. Start the current viewport variant (`375x667` or `1280x720`).
2. Clear browser storage before navigation.
3. Open `/sv/kravkatalog`.
4. Wait for the first two table rows so the expanded row will have
   content below it.
5. Open the first row's inline detail pane.
6. Wait for `[data-expanded-detail-cell="true"]`,
   `[data-column-resize-handle="description"]`, and the description
   bottom segment to render.
7. Read the bounding boxes for the expanded detail cell, the top
   interactive resize handle, and the bottom pointer-only segment.
8. Assert that the top handle ends at or above the detail-pane top
   edge.
9. Assert that the bottom segment starts at or below the detail-pane
   bottom edge.
10. Record the current description column width.
11. Drag the bottom description resize segment to the right.
12. Release the pointer to commit the resize.
13. Assert that the description column width changed.
14. Assert that the Swedish width override in `localStorage` contains a
   `description` entry.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant T as Table
    participant D as Detail Pane
    participant S as Storage

    P->>P: Apply viewport variant
    U->>P: Open /sv/kravkatalog
    P->>T: Render list and divider overlay
    U->>T: Click first requirement row
    T->>D: Render inline detail pane
    Note over T,D: ✓ Divider overlay splits above and below pane
    U->>T: Drag bottom description segment right
    T->>T: Update column width
    U->>T: Release pointer
    T->>S: Persist final width override
    Note over D: ✓ No divider segment overlaps the pane
    Note over S: ✓ Stored value contains description
```
