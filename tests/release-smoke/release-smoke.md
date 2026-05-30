# Release Smoke Container Flow Tests

> Test flow documentation for [`release-smoke.spec.ts`](release-smoke.spec.ts)

This suite is the narrow Playwright proof for the container stack. It runs
against `https://kravhantering.test` after the Podman Compose stack is already
started, signs in through Keycloak via nginx, and verifies the release-critical
path without duplicating the full integration suite.

## Data Model

<!-- markdownlint-disable MD013 -->
| Property | Source | Purpose |
| --- | --- | --- |
| `storageState` | `tests/release-smoke/global-setup.ts` | Reuses the `release-smoke-user` browser session. |
| `RELEASE_SMOKE_RUN_ID` | Environment | Optional stable prefix for created smoke requirements. |
| `build.json` | `/build.json` | Public build metadata embedded in the app image. |
<!-- markdownlint-enable MD013 -->

Example build metadata shape:

```json
{
  "version": "0.1.0",
  "commitSha": "abc123",
  "builtAt": "2026-05-22T12:00:00.000Z",
  "imageTag": "localhost/kravhantering/app-runtime:local"
}
```

## Overview Flowchart

```mermaid
flowchart TD
    A[Release smoke config] --> B[Global setup]
    B --> C[Login via nginx /auth]
    C --> D[Store release-smoke-user storageState]
    D --> E[GET /api/auth/me]
    E --> F[Open /sv/requirements]
    F --> G[Verify seeded SQL Server data]
    G --> H[Verify Next static assets]
    H --> I[Attach screenshot]
    I --> J[GET /build.json]
    J --> K[Attach build metadata]
    K --> L[POST /api/requirements]
    L --> M[GET /api/requirements/:id]
```

## Test Setup

- `playwright.release-smoke.config.ts` points at
  `https://kravhantering.test`, writes output to `test-results/release-smoke`,
  and does not start a web server.
- The runner must trust `tmp/container-tls/ca.crt` for both Node and Chromium
  so the suite uses regular HTTPS verification. In the devcontainer,
  `npm run container:release-smoke:up` runs
  `.devcontainer/trust-container-ca.sh` after generating the CA.
- `global-setup.ts` signs in as `release-smoke-user` with the committed
  non-production password from the container Keycloak realm.
- The config adds same-origin and `X-Requested-With` headers so API mutations
  exercise the same CSRF path as the browser UI.

## proves HTTPS, auth, SQL Server reads and writes, assets, and build metadata

### Purpose

This test verifies that the externally visible container route can serve the
app over HTTPS, authenticate through Keycloak, read seeded SQL Server data,
serve static image contents, expose build metadata, and persist one small
CSRF-protected requirement mutation.

### Step-by-Step Flow

1. Request `/api/auth/me` with the stored session and verify
   `release-smoke-user` is authenticated with the expected HSA-ID.
2. Open `/sv/requirements` and wait for the app to fetch
   `/api/requirements`.
3. Assert at least one seeded requirement is returned and visible in the page.
4. Assert at least one `/_next/static/` resource loaded with HTTP 200.
5. Attach a full-page screenshot as release smoke evidence.
6. Request `/build.json`, validate all metadata fields, and attach the JSON.
7. Request `/api/requirement-areas` and choose the first requirement area.
8. POST `/api/requirements` with a description beginning
   `release-smoke-<run-id>`.
9. GET the created requirement by id and verify it matches the POST result.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant PW as Playwright
    participant N as nginx
    participant KC as Keycloak
    participant APP as App
    participant DB as SQL Server

    PW->>N: GET /api/auth/login
    N->>APP: Forward login request
    APP-->>PW: Redirect/login form through /auth
    PW->>N: Submit Keycloak credentials
    N->>KC: Forward /auth request
    KC-->>PW: Callback to /api/auth/callback
    PW->>APP: Store authenticated storageState
    PW->>APP: GET /api/auth/me
    Note over PW,APP: ✓ release-smoke-user is authenticated
    PW->>APP: GET /sv/requirements
    APP->>DB: Read seeded requirements
    DB-->>APP: Requirement rows
    Note over PW,APP: ✓ seeded data and static assets are visible
    PW->>APP: GET /build.json
    Note over PW,APP: ✓ build metadata is valid and attached
    PW->>APP: GET /api/requirement-areas
    APP->>DB: Read requirement areas
    DB-->>APP: Requirement area rows
    Note over PW,APP: Select first requirement area
    PW->>APP: POST /api/requirements release-smoke-<run-id>
    APP->>DB: Persist release-smoke-<run-id> requirement
    PW->>APP: GET /api/requirements/:id
    APP->>DB: Read created requirement
    Note over PW,DB: ✓ SQL Server write path is proven
```
