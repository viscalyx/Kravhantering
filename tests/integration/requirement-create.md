# Requirement Creation Integration Tests

> Test flow documentation for
> [`requirement-create.spec.ts`](requirement-create.spec.ts)

Validates that new requirements can be created via both the REST API and the
browser UI form, and that the resulting data persists correctly.

## Overview Flowchart

```mermaid
flowchart TD
    A[Test Suite] --> B[API creation test]
    A --> C[UI form test - mobile]
    A --> D[UI form test - desktop]
    B --> B1[GET /api/requirement-areas]
    B1 --> B2[POST /api/requirements]
    B2 --> B3[GET /api/requirements/:id]
    B3 --> B4[Assert persisted data matches]
    C --> E1[Set viewport 375x812]
    D --> E2[Set viewport 1280x800]
    E1 --> F[GET /api/requirement-areas]
    E2 --> F
    F --> G[Navigate to /sv/requirements/new]
    G --> H[Select area, fill description]
    H --> I[Click submit]
    I --> J[Wait for redirect to /sv/requirements]
    J --> K[Assert description visible in inline detail]
```

## Test Setup

- No shared `beforeEach` hooks; each test fetches its own area list.
- The API test uses Playwright's `request` context for direct HTTP calls.
- The UI tests use Playwright's `page` context and set viewport size per
  iteration.

## Test Cases

### POST /api/requirements persists a new requirement

**Purpose**: Verify the REST API create endpoint works end-to-end.

**Steps**:

1. `GET /api/requirement-areas` — retrieve available areas.
2. `POST /api/requirements` with `{ areaId, description, requiresTesting }`.
3. Assert `201` status and response contains `requirement.id`,
   `requirement.uniqueId`, `version.description`.
4. `GET /api/requirements/:id` — fetch the created requirement back.
5. Assert fetched `id` and `uniqueId` match the creation response.

```mermaid
sequenceDiagram
    participant T as Test
    participant API as /api
    T->>API: GET /api/requirement-areas
    API-->>T: { areas: [...] }
    T->>API: POST /api/requirements
    API-->>T: 201 { requirement, version }
    T->>API: GET /api/requirements/:id
    API-->>T: { id, uniqueId }
    T->>T: Assert data matches
```

### Form submit redirects to list with inline detail open (mobile / desktop)

**Purpose**: Verify the browser form creates a requirement and redirects to the
list view with the inline detail panel showing the new requirement. Runs at both
mobile (375 x 812) and desktop (1280 x 800) viewports.

**Steps**:

1. Set viewport to the target size.
2. `GET /api/requirement-areas` — retrieve available areas.
3. Navigate to `/sv/requirements/new`.
4. `selectOption('#areaId', areaId)` — pick the first area.
5. `fill('#description', 'Playwright UI test requirement')`.
6. `click('button[type="submit"]')`.
7. `waitForURL(/\/sv\/requirements(?:\?|$)/)` — confirm redirect.
8. Assert URL does not contain `undefined`.
9. Assert text *"Playwright UI test requirement"* is visible (inline detail
   panel).

```mermaid
sequenceDiagram
    participant T as Test
    participant API as /api
    participant Page as Browser
    T->>Page: setViewportSize(width, height)
    T->>API: GET /api/requirement-areas
    API-->>T: { areas: [...] }
    T->>Page: goto /sv/requirements/new
    T->>Page: selectOption #areaId
    T->>Page: fill #description
    T->>Page: click submit
    Page-->>T: redirect to /sv/requirements?selected=...
    T->>Page: assert description visible
```
