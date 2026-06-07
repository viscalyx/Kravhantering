# Requirement Selection Questions Detail Integration Tests

> Test flow documentation for
> [`requirement-selection-questions-detail.spec.ts`](./requirement-selection-questions-detail.spec.ts)

This suite verifies that a requirement opened from `Krav i urvalet` in the
requirement-selection answer modal uses the same content-card layout as the
requirements library inline detail, while staying read-only inside the modal.

## Overview Flowchart

```mermaid
flowchart TD
    A[Open requirement-selection questions] --> B[Expand SÄK-KUF001]
    B --> C[Find seeded answer]
    C --> D[Open edit answer modal]
    D --> E[Expand SAK0042 in Krav i urvalet]
    E --> F[Assert the detail card is visible]
    F --> G[Assert Kravtext and seeded content]
    G --> H[Assert no repeated ID heading]
    H --> I[Assert no archive action]
```

## Test Setup

- The standard Playwright global setup provides an authenticated admin session.
- The test uses the seeded `SÄK-KUF001` question and the
  `Grundskydd för intern information` answer.
- The linked `SÄK0042` requirement is expanded from the answer modal preview.
- Assertions use web-first locators scoped from the expanded requirement row and
  visible localized content. Prodlike builds intentionally no-op Developer Mode
  attributes.

## opens a library-style read-only requirement detail card from the answer modal

### Purpose

Protects the visible contract that answer-modal requirement details reuse the
library inline detail content order and stay read-only inside the answer editing
workflow.

### Step-by-Step Flow

1. Navigate to `/sv/requirements/stewardship?tab=questions`.
1. Assert the `Kravurvalsfrågor` heading is present.
1. Expand the seeded `SÄK-KUF001` question row.
1. Locate the seeded `Grundskydd för intern information` answer row.
1. Click `Redigera` for that answer.
1. Assert the `Redigera kravurvalsvar` dialog is open.
1. Click `Öppna kravdetaljer SÄK0042`.
1. Assert the row reports `aria-expanded="true"`.
1. Scope the detail assertions from the expanded `SÄK0042` requirement row.
1. Assert the rendered detail content exposes exactly one `Kravtext` section.
1. Assert the expanded row contains the seeded `SÄK0042` requirement text.
1. Assert there is no repeated `SÄK0042` heading in the card.
1. Assert no `Arkivera` action is present in the dialog.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant Q as Questions page
    participant M as Answer modal
    participant D as Detail card

    U->>Q: Open Kravurvalsfrågor
    Q-->>U: Show collapsed question rows
    U->>Q: Expand SÄK-KUF001
    Q-->>U: Show seeded answers
    U->>Q: Click Redigera
    Q->>M: Open answer modal
    U->>M: Expand SÄK0042
    M->>D: Render matched requirement detail
    D-->>U: Show shared card layout
    D-->>U: Keep lifecycle actions hidden
```

### Supplementary Flowchart

```mermaid
flowchart LR
    A[Matched requirement row] --> B{Expanded?}
    B -- No --> C[Show row summary only]
    B -- Yes --> D[Fetch requirement detail]
    D --> E[Render shared content card]
    E --> F[Hide lifecycle controls]
```
