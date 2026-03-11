# Requirements Table Column Resizing Integration Tests

> Test flow documentation for [`requirements-table-resize.spec.ts`](/workspace/tests/integration/requirements-table-resize.spec.ts)

This suite verifies that the Krav list keeps resizing responsive under
rapid pointer dragging on both mobile and desktop layouts and does not
fall into a React render loop while persisting the final width.

## Data Model

|Item|Purpose|
|---|---|
|Storage key constant|Swedish width override key.|
|`description` resize handle|Divider for `Beskrivning` resize.|
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
    C --> D[Wait for description resize handle]
    D --> E[Drag divider rapidly left and right]
    E --> F[Release pointer]
    F --> G{Outcome}
    G -- Width changed --> H[Description column committed]
    G -- No render-loop errors --> I[Console remains clean]
    H --> J[Test passes]
    I --> J
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
- No fixed wait is used for the commit. The assertions poll the DOM
  width and `localStorage` until the committed resize appears.

## resizes the description column during rapid dragging without render-loop errors

### Purpose

This test validates the failure mode reported in the browser: repeated
left-right dragging of the `Beskrivning` divider must still resize the
table and must not trigger React's "Maximum update depth exceeded"
error in both the mobile and desktop layouts.

### Step-by-Step Flow

1. Start the current viewport variant (`375x667` or `1280x720`).
2. Clear browser storage before navigation.
3. Start capturing console and page-level errors.
4. Open `/sv/kravkatalog`.
5. Scroll the `description` resize handle into view and record the
   initial description column width.
6. Drag the divider back and forth several times with alternating left
   and right deltas.
7. Release the pointer to commit the resize.
8. Assert that the description column width differs from the starting
   value.
9. Assert that the Swedish column-width storage entry now contains a
   `description` override.
10. Assert that no captured error contains the render-loop signatures.

### Sequence Diagram

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
    U->>T: Drag divider left and right repeatedly
    T->>T: Update preview widths during drag
    U->>T: Release pointer
    T->>S: Persist final width override
    Note over T: ✓ Description column width changed
    Note over P: ✓ No maximum update depth error
```
