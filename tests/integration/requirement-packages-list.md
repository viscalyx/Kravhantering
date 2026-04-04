# Requirement Packages List Integration Tests

> Test flow documentation for
> [`requirement-packages-list.spec.ts`](tests/integration/requirement-packages-list.spec.ts)

This suite verifies that the requirement packages list page renders correctly,
that the name filter narrows the visible packages, and that the clear-search
action restores the full list. On desktop it additionally asserts that the
filter field and the create button are horizontally aligned.

## Overview Flowchart

```mermaid
flowchart TD
    A[Open /sv/requirement-packages] --> B[Assert heading and controls visible]
    B --> C{Desktop?}
    C -- Yes --> D[Assert filter and button are aligned]
    C -- No --> E[Fill name filter]
    D --> E
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
that the filter input and the "Nytt kravpaket" button share the same row.

### Step-by-Step Flow

1. Navigate to `/sv/requirement-packages`.
2. Assert the `h1` "Kravpaket" heading is visible.
3. Assert the name-filter text input and "Nytt kravpaket" button are visible.
4. *(Desktop only)* Assert that the bottom edges of the filter and button are
   within 6 px of each other and that the button starts to the right of the
   filter.
5. Type `Behörighet` into the name filter.
6. Assert "Behörighet och IAM" link is visible.
7. Assert "Säkerhetslyft Q2" link is hidden.
8. Click "Rensa sökning".
9. Assert the filter input value is empty.
10. Assert "Behörighet och IAM" is visible again.
11. Assert "Säkerhetslyft Q2" is visible again.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant F as Filter

    U->>P: Open /sv/requirement-packages
    Note over P: ✓ Heading and controls visible
    U->>F: Fill "Behörighet"
    F->>P: Filter list
    Note over P: ✓ "Behörighet och IAM" visible
    Note over P: ✓ "Säkerhetslyft Q2" hidden
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
