# Requirement Selection Drag-and-Drop Integration Tests

> Test flow documentation for
> [`requirement-selection-answer-dnd.spec.ts`](./requirement-selection-answer-dnd.spec.ts)

This suite verifies that requirement-selection questions and expanded answers can
be reordered from their drag handles in Chromium, that question drag shows a
visible floating row preview and destination drop marker while moving, and that
the affected destination rows slide into adjacent slots before the order is
persisted without a page refresh.

## Overview Flowchart

```mermaid
flowchart TD
    A[Open requirement-selection questions] --> B[Reset Drift question order]
    B --> C[Drag first question handle to second question row]
    C --> D[Assert question drag preview appears]
    D --> E[Assert destination drop marker appears]
    E --> F[Assert destination row slides into the adjacent slot]
    F --> G[Assert question order stays stable while dragging]
    G --> H[Assert visible question order changes after release]
    H --> I[Reset DRF-KUF001 answer order]
    I --> J[Expand DRF-KUF001]
    J --> K[Drag first answer handle to second answer row]
    K --> L[Assert visible answer order changes]
    L --> M[Reset seeded order]
```

## Test Setup

- The standard Playwright global setup provides an authenticated admin session.
- The tests use the seeded Drift (`DRF`) questions and the seeded `DRF-KUF001`
  operational-mode answers.
- Seeded question and answer orders are reset through the same update APIs used
  by the UI.
- The suite runs serially because it temporarily mutates shared seeded order.
- The question drag uses real mouse sequences in Chromium. The answer drag arms
  the handle and dispatches native drag events so the HTML drag-and-drop path is
  covered without depending on Chromium's mouse drag timing.

## reorders collapsed requirement-selection questions by dragging the question handle

### Question Purpose

Protects the regression where a collapsed question handle could show active
feedback without actually moving the question row.

### Question Flow

1. Navigate to `/sv/requirements/stewardship?tab=questions`.
1. Assert the `Kravurvalsfrågor` heading is present.
1. Reset Drift questions to the seeded order.
1. Reload the page.
1. Assert `DRF-KUF001` is first and `DRF-KUF002` is second.
1. Drag the first question handle to the second question row with Playwright
   mouse events.
1. Assert the floating drag preview is visible and shows `DRF-KUF001`.
1. Assert the destination drop marker is visible over `DRF-KUF002`.
1. Assert `DRF-KUF002` slides into the previous slot while the pointer is down.
1. Assert `DRF-KUF001` remains first and `DRF-KUF002` remains second while the
   pointer is still down.
1. Assert `DRF-KUF002` is first and `DRF-KUF001` is second.
1. Reset Drift questions back to the seeded order.

## reorders expanded requirement-selection answers by dragging the answer handle

### Answer Purpose

Protects the regression where the answer drag handle could receive focus or hover
feedback while the expanded answer still could not be dragged.

### Answer Flow

1. Navigate to `/sv/requirements/stewardship?tab=questions`.
1. Assert the `Kravurvalsfrågor` heading is present.
1. Reset `DRF-KUF001` answers to the seeded order.
1. Reload the page and expand `DRF-KUF001`.
1. Assert `Egen drift/on-premises` is first and `Molndrift` is second.
1. Arm the first answer handle and drop the first answer row over the second
   answer row with native drag events.
1. Assert `Molndrift` is first and `Egen drift/on-premises` is second.
1. Reset `DRF-KUF001` answers back to the seeded order.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant Q as Questions page
    participant H as Drag handle
    participant API as Update API

    U->>Q: Open Kravurvalsfrågor
    Q->>API: Reset seeded order
    U->>H: Drag first handle
    H->>Q: Preview reordered rows
    U->>H: Release over second row
    Q->>API: Persist sort order
    Q-->>U: Show reordered rows without refresh
```
