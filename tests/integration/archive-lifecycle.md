# Archive Lifecycle Integration Tests

> Test flow documentation for
> [`archive-lifecycle.spec.ts`](tests/integration/archive-lifecycle.spec.ts)

This suite verifies the requirement archive workflow in the real UI. It covers
cancelling archive initiation, approving archiving after an approval-dialog
cancel, and cancelling archiving after a cancellation-dialog cancel.

## Data Model

<!-- markdownlint-disable MD013 -->
| Fixture | Purpose |
| --- | --- |
| `PWT0005` / `PWT0006` | Approve-archiving fixtures for desktop and mobile. |
| `PWT0007` / `PWT0008` | Cancel-archiving fixtures for desktop and mobile. |
| `PWT0009` / `PWT0010` | Archive-initiation cancel fixtures for desktop and mobile. |
<!-- markdownlint-enable MD013 -->

Each fixture starts from a seeded Published version. The local-rerun helper
repairs mutated fixtures through public app APIs only:

```json
{
  "isArchived": false,
  "versions": [
    {
      "archiveInitiatedAt": null,
      "status": 3,
      "versionNumber": 1
    }
  ]
}
```

## Overview Flowchart

```mermaid
flowchart TD
    A[Open seeded requirement inline detail] --> B{Archive scenario}
    B -- Cancel initiation --> C[Click Archive]
    C --> D[Cancel confirmation]
    D --> E[Assert Published]
    B -- Approve archiving --> F[Initiate archiving]
    F --> G[Assert Archiving Review]
    G --> H[Click Approve Archiving]
    H --> I[Cancel confirmation]
    I --> J[Click Approve Archiving again]
    J --> K[Confirm and assert Archived API state]
    B -- Cancel archiving --> L[Initiate archiving]
    L --> M[Assert Archiving Review]
    M --> N[Click Cancel Archiving]
    N --> O[Cancel confirmation]
    O --> P[Click Cancel Archiving again]
    P --> Q[Confirm and assert Published]
```

## Test Setup

- The suite runs at mobile (`375x812`) and desktop (`1280x720`) viewports.
- The tests open requirements through `/sv/requirements?selected={uniqueId}`
  so the catalog inline detail stays actionable when a Published version enters
  archiving review.
- `ensurePublishedRequirement()` repairs local reruns with a test-only SQL reset
  of the seeded PWT fixture: the newest version becomes Published, archive flags
  are cleared, and older history is kept Archived. The reset reads
  `.env.prodlike` and `.env.sqlserver` when the Playwright runner process does
  not already have SQL Server variables exported, and passes that resolved env
  into the SQL Server DataSource so local certificate settings are honored in
  pruned prod-like runs.
- After archive initiation, the spec waits for the API state and catalog row to
  show `Granskning`, then `selectLatestVersion()` clicks the newest
  `Arkiveringsgranskning` version pill. This keeps assertions on the review
  version when a rerun fixture also has older archived history.
- `assertActiveStepperStep()` verifies the active requirement lifecycle step
  via `[aria-current="step"]`.
- Final state is asserted through `/api/requirements/{uniqueId}`.

## cancels archive initiation without changing Published state

### Purpose: Initiation Cancel

Validates that dismissing the initial archive confirmation leaves the
requirement Published and does not set `archiveInitiatedAt`.

### Step-by-Step Flow: Initiation Cancel

1. Repair the fixture to Published if a previous local run mutated it.
2. Open `PWT0009` on desktop or `PWT0010` on mobile in the catalog inline
   detail.
3. Assert the active lifecycle step is "Publicerad".
4. Click "Arkivera".
5. Assert the confirmation text asks to start the archive process.
6. Click "Avbryt".
7. Assert the active lifecycle step is still "Publicerad".
8. Assert the API state is Published, not archived, and has no archive flag.

### Sequence Diagram: Initiation Cancel

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant API as API

    API->>API: Repair fixture to Published
    U->>P: Open catalog inline detail
    Note over P: ✓ Step = Publicerad
    U->>P: Click Arkivera
    U->>P: Click Avbryt in confirmation
    Note over P: ✓ Step = Publicerad
    P->>API: GET requirement
    Note over API: ✓ status = 3, archiveInitiatedAt = null
```

## approves archiving after cancelling the approval once

### Purpose: Archive Approval

Validates the two-step archive happy path and proves that cancelling the first
approval confirmation leaves the requirement in archiving review.

### Step-by-Step Flow: Archive Approval

1. Repair the fixture to Published if needed.
2. Open `PWT0005` on desktop or `PWT0006` on mobile in the catalog inline
   detail.
3. Click "Arkivera" and confirm.
4. Wait for the API and catalog row to show archiving review, then select the
   latest "Arkiveringsgranskning" version pill.
5. Assert the active lifecycle step is "Arkiveringsgranskning".
6. Click "Godkänn arkivering".
7. Click "Avbryt" in the confirmation.
8. Assert the requirement is still in archiving review through UI and API.
9. Click "Godkänn arkivering" again and confirm.
10. Assert the inline detail closes after the archived requirement leaves the
   active list.
11. Assert the API state is Archived and no archive flag remains.

### Sequence Diagram: Archive Approval

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant API as API

    API->>API: Repair fixture to Published
    U->>P: Open catalog inline detail
    U->>P: Start archiving and confirm
    P->>API: Poll until archiving review is persisted
    Note over API: ✓ status = 2, archive flag set
    Note over P: ✓ Catalog row = Granskning
    U->>P: Select latest Arkiveringsgranskning version
    Note over P: ✓ Step = Arkiveringsgranskning
    U->>P: Click Godkänn arkivering
    U->>P: Click Avbryt
    P->>API: GET requirement
    Note over API: ✓ status = 2, archive flag set
    U->>P: Approve archiving and confirm
    P->>API: GET requirement
    Note over API: ✓ status = 4, isArchived = true
```

## cancels archiving after cancelling the cancellation once

### Purpose: Archive Cancellation

Validates that cancelling the cancellation dialog keeps archiving review active,
then confirms the user can return the requirement to Published.

### Step-by-Step Flow: Archive Cancellation

1. Repair the fixture to Published if needed.
2. Open `PWT0007` on desktop or `PWT0008` on mobile in the catalog inline
   detail.
3. Click "Arkivera" and confirm.
4. Wait for the API and catalog row to show archiving review, then select the
   latest "Arkiveringsgranskning" version pill.
5. Assert the active lifecycle step is "Arkiveringsgranskning".
6. Click "Avbryt arkivering".
7. Click "Avbryt" in the confirmation.
8. Assert the requirement is still in archiving review through UI and API.
9. Click "Avbryt arkivering" again and confirm.
10. Assert the active lifecycle step returns to "Publicerad".
11. Assert the API state is Published, not archived, and has no archive flag.

### Sequence Diagram: Archive Cancellation

```mermaid
sequenceDiagram
    participant U as User
    participant P as Page
    participant API as API

    API->>API: Repair fixture to Published
    U->>P: Open catalog inline detail
    U->>P: Start archiving and confirm
    P->>API: Poll until archiving review is persisted
    Note over API: ✓ status = 2, archive flag set
    Note over P: ✓ Catalog row = Granskning
    U->>P: Select latest Arkiveringsgranskning version
    Note over P: ✓ Step = Arkiveringsgranskning
    U->>P: Click Avbryt arkivering
    U->>P: Click Avbryt
    P->>API: GET requirement
    Note over API: ✓ status = 2, archive flag set
    U->>P: Cancel archiving and confirm
    Note over P: ✓ Step = Publicerad
    P->>API: GET requirement
    Note over API: ✓ status = 3, archiveInitiatedAt = null
```
