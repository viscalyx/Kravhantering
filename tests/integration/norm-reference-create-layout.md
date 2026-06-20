# Norm Reference Create Layout Integration Tests

> Test flow documentation for
> [`norm-reference-create-layout.spec.ts`](./norm-reference-create-layout.spec.ts)

This suite verifies that the new norm-reference form stays compact on
desktop by using two columns, while remaining a single readable column on
mobile. It also checks the shared dirty-form close rule without saving data.

## Data Model

| Item | Purpose |
| --- | --- |
| Viewport matrix | Runs at `375x812` and `1280x720`. |
| Field boxes | Browser bounding boxes for the create-form inputs. |
| Row checks | Compare field positions to verify column layout. |
| Width checks | Confirm the ID override field spans the desktop form. |
| Dirty close | Uses a temporary name value and discards it before exit. |

## Overview Flowchart

```mermaid
flowchart TD
    A[Start viewport variant] --> B{Viewport}
    B -- 375x812 --> C[Open norm library]
    B -- 1280x720 --> C
    C --> D[Open new norm reference dialog]
    D --> E[Measure form field boxes]
    E --> F{Viewport}
    F -- Desktop --> G[Verify three two-column rows]
    G --> H[Verify ID field spans both columns]
    F -- Mobile --> I[Verify one-column stack]
    H --> J[Change one field]
    I --> J
    J --> K[Backdrop does not close]
    K --> L[Cancel discard keeps dialog open]
    L --> M[Confirm discard closes dialog]
```

## Test Setup

- The standard Playwright storage state supplies the authenticated admin
  session.
- The same test runs once per viewport variant through Playwright
  `test.use({ viewport })`.
- The test opens `/sv/requirements/stewardship?tab=norms` directly so it
  starts on the Normbibliotek tab.
- No fixed wait is used. The test waits through Playwright role and text
  assertions before measuring the input positions.

## lays out the new norm reference form responsively

### Purpose

This test validates that the create dialog grows horizontally on desktop
instead of only becoming taller, that the same form remains a safe
single-column layout on mobile, and that dirty close actions use the shared
discard confirmation.

### Step-by-Step Flow

1. Start the current viewport variant.
2. Open `/sv/requirements/stewardship?tab=norms`.
3. Assert that the page heading is `Normbibliotek`.
4. Click `Ny normreferens`.
5. Assert that the `Ny normreferens` dialog opens once.
6. Measure the input boxes for Benämning, Typ, Referens, Version,
   Utfärdare, URI, and Normreferens-ID.
7. On desktop, assert that Benämning/Typ, Referens/Version, and
   Utfärdare/URI share rows.
8. On desktop, assert that Normreferens-ID sits below the three rows and
   spans wider than one ordinary column.
9. On mobile, assert that every field aligns with Benämning on the same
   x-axis and appears in vertical order.
10. Assert `Spara` is disabled while the form is clean.
11. Enter a temporary Benämning and assert `Spara` is enabled.
12. Click outside the dialog and assert it remains open without a prompt.
13. Click `Avbryt`, cancel the discard prompt, and assert the temporary value
    remains.
14. Click `Avbryt` again, confirm discard, and assert the dialog closes.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant D as Dialog
    participant F as Form

    P->>P: Apply viewport variant
    U->>P: Open Normbibliotek tab
    Note over P: ✓ Heading is Normbibliotek
    U->>D: Click Ny normreferens
    D->>F: Render create form
    F->>F: Measure input boxes
    alt Desktop
        Note over F: ✓ Fields form three two-column rows
        Note over F: ✓ Normreferens-ID spans both columns
    else Mobile
        Note over F: ✓ Fields stay in one vertical column
    end
    Note over F: ✓ Clean Spara is disabled
    U->>F: Enter temporary Benämning
    Note over F: ✓ Spara is enabled
    U->>D: Click outside dialog
    Note over D: ✓ Dialog remains open
    U->>D: Click Avbryt
    D->>D: Show discard confirmation
    U->>D: Cancel discard
    Note over F: ✓ Temporary value remains
    U->>D: Click Avbryt, then Bekräfta
    Note over D: ✓ Dialog closes without saving
```
