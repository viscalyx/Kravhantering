# Requirements Specifications List Integration Tests

> Test flow documentation for
> [`specifications-list.spec.ts`](tests/integration/specifications-list.spec.ts)

This suite verifies that the requirements specifications list page renders correctly,
that compact static requirement-area pills are present, that the name filter
narrows the visible packages, that row actions render as icon-only buttons,
that overflowing requirement-area pills can be expanded on demand, and that the
clear-search action restores the full list. On desktop it additionally asserts
that the filter field and the create button are horizontally aligned.

## Overview Flowchart

```mermaid
flowchart TD
    A[Open /specifications] --> A1[Assert redirect to /sv/specifications]
    A1 --> B[Assert title, heading, and controls visible]
    B --> B1[Assert static requirement-area pill]
    B1 --> B2[Assert icon-only edit and delete actions]
    B2 --> C{Desktop?}
    C -- Yes --> D[Assert filter and button are aligned]
    C -- No --> B3[Force narrow pill column and toggle overflow]
    D --> B3
    B3 --> E[Fill name filter]
    E --> F[Assert filtered list]
    F --> G[Click clear search]
    G --> H[Assert full list restored]
    H --> I[Test passes]
```

## Test Setup

No `beforeEach` hooks. The suite iterates over two viewport definitions
(`375×812` mobile and `1280×720` desktop) so the same scenario runs at both
sizes.

## filters the table by package name and clears the search

### Purpose

Confirms that typing in the name filter hides non-matching packages and that
clicking the clear button restores all packages. On desktop it also verifies
that the filter input and the "Nytt kravunderlag" button share the same row.

### Step-by-Step Flow

1. Navigate to `/specifications`.
1. Assert the browser is on `/sv/specifications`.
1. Assert the page title contains "Kravunderlag".
1. Assert the `h1` "Kravunderlag" heading is visible.
1. Assert the name-filter text input and "Nytt kravunderlag" button are visible.
1. Assert the first requirement-area pill is a compact static `span`, not a
   link.
1. Assert the row edit/delete actions are icon-only buttons with accessible
   names.
1. *(Desktop only)* Assert that the bottom edges of the filter and button are
   within 6 px of each other and that the button starts to the right of the
   filter.
1. Force a narrow requirement-area pill list and assert the chevron toggle
   expands and collapses the hidden pills.
1. Type `e-tjänst` into the name filter.
1. Assert "Upphandling av e-tjänstplattform" link is visible.
1. Assert "Införande av säkerhetslyft Q2" link is hidden.
1. Click "Rensa sökning".
1. Assert the filter input value is empty.
1. Assert "Upphandling av e-tjänstplattform" is visible again.
1. Verify "Införande av säkerhetslyft Q2" is visible again.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant F as Filter

    U->>P: Open /specifications
    Note over P: ✓ Redirected to /sv/specifications
    Note over P: ✓ Title, heading, and controls visible
    Note over P: ✓ Requirement-area pill is static and compact
    Note over P: ✓ Edit and delete actions are icon-only
    U->>P: Toggle overflowing requirement-area pills
    Note over P: ✓ Hidden pills expand and collapse
    U->>F: Fill "e-tjänst"
    F->>P: Filter list
    Note over P: ✓ "Upphandling av e-tjänstplattform" visible
    Note over P: ✓ "Införande av säkerhetslyft Q2" hidden
    U->>F: Click clear search
    F->>P: Reset filter
    Note over P: ✓ Input empty
    Note over P: ✓ Both packages visible
```

### Supplementary Flowchart

```mermaid
flowchart LR
    A[Type filter text] --> B{Match?}
    B -- Yes --> C[Row visible]
    B -- No --> D[Row hidden]
    C --> E[Clear search]
    D --> E
    E --> F[All rows visible]
```
