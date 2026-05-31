# Manual Test Cases

This guide is for local and development manual QA against the seeded SQL Server
database and the local Keycloak realm. It uses English explanations, but keeps
the exact Swedish UI labels used by the seeded Playwright flows.

## Table of contents

- [Configured users](#configured-users)
- [General setup](#general-setup)
- [Authentication and authorization](#authentication-and-authorization)
  - [AUTH-01: sign in through Keycloak](#auth-01-sign-in-through-keycloak)
  - [AUTH-02: sign out and require login for protected pages](#auth-02-sign-out-and-require-login-for-protected-pages)
  - [AUTH-03: signed-out API request returns JSON 401](#auth-03-signed-out-api-request-returns-json-401)
  - [AUTH-04: session projection hides raw tokens](#auth-04-session-projection-hides-raw-tokens)
  - [AUTH-05: Admin-only page accepts Admin user](#auth-05-admin-only-page-accepts-admin-user)
  - [AUTH-06: privacy tab is disabled for Admin without PrivacyOfficer](#auth-06-privacy-tab-is-disabled-for-admin-without-privacyofficer)
  - [AUTH-07: PrivacyOfficer can use privacy without Admin powers](#auth-07-privacyofficer-can-use-privacy-without-admin-powers)
  - [AUTH-08: no-role user is denied privileged work](#auth-08-no-role-user-is-denied-privileged-work)
  - [AUTH-09: auth callback failure shows a browser error page](#auth-09-auth-callback-failure-shows-a-browser-error-page)
- [Requirements library](#requirements-library)
  - [REQ-01: library loads with seeded requirements](#req-01-library-loads-with-seeded-requirements)
  - [REQ-02: language switch keeps the library usable](#req-02-language-switch-keeps-the-library-usable)
  - [REQ-03: filter by requirement ID and clear filters](#req-03-filter-by-requirement-id-and-clear-filters)
  - [REQ-04: sort by a sortable column](#req-04-sort-by-a-sortable-column)
  - [REQ-05: column picker persists visible columns](#req-05-column-picker-persists-visible-columns)
  - [REQ-06: reset local library view preferences](#req-06-reset-local-library-view-preferences)
  - [REQ-07: resize a table column](#req-07-resize-a-table-column)
  - [REQ-08: sticky header and floating rail stay usable](#req-08-sticky-header-and-floating-rail-stay-usable)
  - [REQ-09: inline detail pane content order](#req-09-inline-detail-pane-content-order)
  - [REQ-10: library list report entrypoint works](#req-10-library-list-report-entrypoint-works)
  - [REQ-11: localized library error recovery](#req-11-localized-library-error-recovery)
  - [REQ-12: detail action menus are keyboard accessible](#req-12-detail-action-menus-are-keyboard-accessible)
  - [REQ-13: requirement-library stewardship manages packages and questions](#req-13-requirement-library-stewardship-manages-packages-and-questions)
- [Requirement creation and lifecycle](#requirement-creation-and-lifecycle)
  - [LIFE-01: create a requirement from the UI](#life-01-create-a-requirement-from-the-ui)
  - [LIFE-02: validate required fields on create](#life-02-validate-required-fields-on-create)
  - [LIFE-03: submit a draft for review](#life-03-submit-a-draft-for-review)
  - [LIFE-04: return a review requirement to draft](#life-04-return-a-review-requirement-to-draft)
  - [LIFE-05: approve and publish a reviewed requirement](#life-05-approve-and-publish-a-reviewed-requirement)
  - [LIFE-06: create a new draft version from a published requirement](#life-06-create-a-new-draft-version-from-a-published-requirement)
  - [LIFE-07: restore an archived requirement version](#life-07-restore-an-archived-requirement-version)
  - [LIFE-08: cancel archive initiation](#life-08-cancel-archive-initiation)
  - [LIFE-09: approve archiving after one cancelled approval](#life-09-approve-archiving-after-one-cancelled-approval)
  - [LIFE-10: cancel archiving after one cancelled cancellation](#life-10-cancel-archiving-after-one-cancelled-cancellation)
  - [LIFE-11: detail reports are available by status](#life-11-detail-reports-are-available-by-status)
- [Requirement detail collaboration](#requirement-detail-collaboration)
  - [COL-01: add a requirement to a specification](#col-01-add-a-requirement-to-a-specification)
  - [COL-02: register an improvement suggestion](#col-02-register-an-improvement-suggestion)
  - [COL-03: request review for an improvement suggestion](#col-03-request-review-for-an-improvement-suggestion)
  - [COL-04: resolve an improvement suggestion](#col-04-resolve-an-improvement-suggestion)
  - [COL-05: dismiss an improvement suggestion](#col-05-dismiss-an-improvement-suggestion)
  - [COL-06: suggestion history report includes suggestions](#col-06-suggestion-history-report-includes-suggestions)
  - [COL-07: metadata shows requirement area owner and reference data](#col-07-metadata-shows-requirement-area-owner-and-reference-data)
- [Requirements specifications](#requirements-specifications)
  - [SPEC-01: list, filter, and clear specifications](#spec-01-list-filter-and-clear-specifications)
  - [SPEC-02: create a new specification](#spec-02-create-a-new-specification)
  - [SPEC-03: edit a specification from detail title action](#spec-03-edit-a-specification-from-detail-title-action)
  - [SPEC-04: delete a specification with confirmation](#spec-04-delete-a-specification-with-confirmation)
  - [SPEC-05: split lists scroll independently](#spec-05-split-lists-scroll-independently)
  - [SPEC-06: add and remove a requirement in specification detail](#spec-06-add-and-remove-a-requirement-in-specification-detail)
  - [SPEC-07: create a unique requirement](#spec-07-create-a-unique-requirement)
  - [SPEC-08: update usage status](#spec-08-update-usage-status)
  - [SPEC-09: manage needs references](#spec-09-manage-needs-references)
  - [SPEC-10: generate specification list report](#spec-10-generate-specification-list-report)
  - [SPEC-11: reset specification column views](#spec-11-reset-specification-column-views)
  - [SPEC-12: answer requirement-selection questions](#spec-12-answer-requirement-selection-questions)
- [Deviations](#deviations)
  - [DEV-01: create a draft deviation](#dev-01-create-a-draft-deviation)
  - [DEV-02: request deviation review](#dev-02-request-deviation-review)
  - [DEV-03: cancel return to draft](#dev-03-cancel-return-to-draft)
  - [DEV-04: approve a deviation](#dev-04-approve-a-deviation)
  - [DEV-05: reject a deviation](#dev-05-reject-a-deviation)
  - [DEV-06: decided deviations are terminal](#dev-06-decided-deviations-are-terminal)
  - [DEV-07: no-role user cannot decide deviations](#dev-07-no-role-user-cannot-decide-deviations)
- [Admin Center](#admin-center)
  - [ADMIN-01: terminology changes apply to the library](#admin-01-terminology-changes-apply-to-the-library)
  - [ADMIN-02: requirement column defaults affect new library views](#admin-02-requirement-column-defaults-affect-new-library-views)
  - [ADMIN-03: reference-data CRUD page saves changes](#admin-03-reference-data-crud-page-saves-changes)
  - [ADMIN-04: browser back restores reference-data tab](#admin-04-browser-back-restores-reference-data-tab)
  - [ADMIN-05: mobile admin tabs and actions remain usable](#admin-05-mobile-admin-tabs-and-actions-remain-usable)
  - [ADMIN-06: action log filters and exports CSV](#admin-06-action-log-filters-and-exports-csv)
  - [ADMIN-07: access-review decision and export](#admin-07-access-review-decision-and-export)
  - [ADMIN-08: access-review validation rejects long comments](#admin-08-access-review-validation-rejects-long-comments)
  - [ADMIN-09: archiving retention preview is privacy-gated](#admin-09-archiving-retention-preview-is-privacy-gated)
  - [ADMIN-10: reference-data icons render across requirement surfaces](#admin-10-reference-data-icons-render-across-requirement-surfaces)
- [Privacy and data portability](#privacy-and-data-portability)
  - [PRIV-01: self-service privacy export](#priv-01-self-service-privacy-export)
  - [PRIV-02: PrivacyOfficer preview by HSA-ID](#priv-02-privacyofficer-preview-by-hsa-id)
  - [PRIV-03: preview target exports JSON and PDF](#priv-03-preview-target-exports-json-and-pdf)
  - [PRIV-04: duplicate-name privacy search uses HSA-ID only](#priv-04-duplicate-name-privacy-search-uses-hsa-id-only)
  - [PRIV-05: replacement-person switch action](#priv-05-replacement-person-switch-action)
  - [PRIV-06: anonymize and skip actions](#priv-06-anonymize-and-skip-actions)
  - [PRIV-07: stale preview is rejected](#priv-07-stale-preview-is-rejected)
  - [PRIV-08: privacy execution emits action-log evidence](#priv-08-privacy-execution-emits-action-log-evidence)
- [Developer and resilience surfaces](#developer-and-resilience-surfaces)
  - [DEVTOOLS-01: Developer Mode chip copies a reference](#devtools-01-developer-mode-chip-copies-a-reference)
  - [DEVTOOLS-02: Developer Mode persists across navigation](#devtools-02-developer-mode-persists-across-navigation)
  - [DEVTOOLS-03: specification report controls are annotated](#devtools-03-specification-report-controls-are-annotated)
  - [RES-01: English admin error recovery](#res-01-english-admin-error-recovery)
  - [RES-02: homepage smoke](#res-02-homepage-smoke)
  - [RES-03: readiness and build metadata](#res-03-readiness-and-build-metadata)

## Configured users

All configured users are seeded in
`dev/keycloak/realm-kravhantering-dev.json`. All passwords below are dev-only
and must not be reused outside local testing.

<!-- markdownlint-disable MD013 -->
| Username | Password | Display name | Roles | `employeeHsaId` | Testing purpose |
| --- | --- | --- | --- | --- | --- |
| `olle.areaowner` | `devpass` | Olle AreaOwner | None | `SE5560000001-areaowner1` | Requirement-area owner assignment checks. |
| `cora.coauthor` | `devpass` | Cora CoAuthor | None | `SE5560000001-areaco1` | Requirement-area co-author checks. |
| `linnea.areaowner` | `devpass` | Linnéa AreaOwner | None | `SE5560000001-linneab` | Broad privacy preview fixture and requirement area ownership checks. |
| `petra.specresp` | `devpass` | Petra SpecificationResp | None | `SE5560000001-specresp1` | Specification lead checks. |
| `paul.pkgcoauthor` | `devpass` | Paul PkgCoAuthor | None | `SE5560000001-pkgco1` | Requirement-package co-author checks. |
| `rita.reviewer` | `devpass` | Rita Reviewer | `Reviewer` | `SE5560000001-reviewer1` | Review and decision workflow checks. |
| `ada.admin` | `devpass` | Ada Admin | `Admin`, `PrivacyOfficer` | `SE5560000001-admin1` | Broad Admin and PrivacyOfficer happy path. |
| `only.admin` | `devpass` | Only Admin | `Admin` | `SE5560000001-admin2` | Admin-only checks where privacy must be disabled. |
| `disa.privacy` | `devpass` | Disa PrivacyOfficer | `PrivacyOfficer` | `SE5560000001-privacy1` | Privacy without Admin powers. |
| `kalle.one` | `devpass` | Kalle Svensson | None | `SE5560000001-kalle1` | Duplicate-name privacy and access-review principal checks. |
| `kalle.two` | `devpass` | Kalle Svensson | None | `SE5560000001-kalle2` | Duplicate-name privacy checks. |
| `noah.noroles` | `devpass` | Noah NoRoles | None | `SE5560000001-noroles1` | Negative permission testing. |
<!-- markdownlint-enable MD013 -->

## General setup

Use a clean local environment when a case mutates seeded data.

1. Start the local IdP if it is not already running: `npm run idp:up`.
1. Prepare SQL Server and seed data when a clean state is needed:
   `npm run db:setup`.
1. Start the app with `npm run dev`.
1. Open `http://localhost:3000`.
1. Sign out between role-sensitive cases so stale role claims do not affect
   the result.
1. If Keycloak users or roles look stale, reset the IdP as described in
   `docs/auth-developer-workflow.md`.
1. For authenticated HTTP checks, use `scripts/dev-curl.sh`; do not use plain
   `curl` against protected routes.

Useful seeded routes and identifiers:

- Main library: `/sv/requirements`.
- New requirement form: `/sv/requirements/new`.
- Specification list: `/sv/specifications`.
- Seeded specification detail: `/sv/specifications/ETJANST-UPP-2026`.
- Deviation lifecycle fixture:
  `/sv/specifications/PLAYWRIGHT-LIFECYCLE-2026`.
- Admin Center: `/sv/admin`.
- Privacy self-service: `/sv/privacy`.
- Common library fixture: `INT0001`.
- Deviation fixtures: `PWT0001`, `PWT0002`, `PWT0003`, `PWT0004`.
- Archive fixtures: `PWT0005` through `PWT0010`.

## Authentication and authorization

### AUTH-01: sign in through Keycloak

**Purpose:** Confirm the real OIDC redirect chain works.

**Users:** `ada.admin`.

**Prerequisites:** App and Keycloak are running.

**Steps:**

1. Open `/api/auth/login`.
1. Wait for the Keycloak login page.
1. Enter username `ada.admin` and password `devpass`.
1. Submit the form.
1. Open the user menu in the app header.

**Expected result:** The app returns from Keycloak, shows the signed-in user,
and the user menu displays the Admin role.

### AUTH-02: sign out and require login for protected pages

**Purpose:** Confirm authenticated pages do not stay accessible after logout.

**Users:** `ada.admin`.

**Prerequisites:** The user is signed in.

**Steps:**

1. Open the user menu.
1. Select the logout action.
1. Open `/sv/requirements`.

**Expected result:** The browser is redirected to `/api/auth/login` or the
Keycloak authorization URL.

### AUTH-03: signed-out API request returns JSON 401

**Purpose:** Confirm protected API routes reject anonymous callers.

**Users:** None; use a signed-out browser or private window.

**Prerequisites:** No active app session in the browser context.

**Steps:**

1. Open `/api/requirements` directly in the signed-out browser.
1. Inspect the response body.

**Expected result:** The response status is 401 and the JSON body contains
`"error": "Unauthorized"`.

### AUTH-04: session projection hides raw tokens

**Purpose:** Confirm `/api/auth/me` exposes only safe session fields.

**Users:** `ada.admin`.

**Prerequisites:** The user is signed in.

**Steps:**

1. Open `/api/auth/me`.
1. Check the returned JSON.

**Expected result:** The JSON includes identity fields such as `name`, `roles`,
and `hsaId`, but does not include raw tokens, authorization codes, `state`,
`nonce`, or verifier values.

### AUTH-05: Admin-only page accepts Admin user

**Purpose:** Confirm Admin users can reach the Admin Center.

**Users:** `only.admin`.

**Prerequisites:** Sign in as `only.admin`.

**Steps:**

1. Open `/sv/admin`.
1. Verify the page heading.
1. Open the `Referensdata` tab.
1. Open the `Kravområden` reference-data page.

**Expected result:** The Admin Center loads, `Referensdata` is usable, and the
reference-data page opens.

### AUTH-06: privacy tab is disabled for Admin without PrivacyOfficer

**Purpose:** Confirm the narrow privacy role is required.

**Users:** `only.admin`.

**Prerequisites:** Sign in as `only.admin`.

**Steps:**

1. Open `/sv/admin`.
1. Locate the `Dataskydd` and `Arkivering` tabs.
1. Try to select `Dataskydd`.

**Expected result:** The privacy and archiving tabs are disabled with a tooltip
that mentions `Dataskyddshandläggare`, and the active tab does not change.

### AUTH-07: PrivacyOfficer can use privacy without Admin powers

**Purpose:** Confirm privacy duties do not imply Admin-only permissions.

**Users:** `disa.privacy`.

**Prerequisites:** Sign in as `disa.privacy`.

**Steps:**

1. Open `/sv/admin?tab=privacy`.
1. Verify the `Dataskydd` panel is visible.
1. Open `/sv/admin/audit-log`.

**Expected result:** The privacy panel is usable, while the action log does not
load as an Admin page for this user.

### AUTH-08: no-role user is denied privileged work

**Purpose:** Confirm users without global roles cannot perform admin work.

**Users:** `noah.noroles`.

**Prerequisites:** Sign in as `noah.noroles`.

**Steps:**

1. Open `/sv/admin`.
1. Try to open a reference-data administration page such as
   `/sv/requirement-areas`.
1. Try a privileged action if the UI displays one.

**Expected result:** Admin-only surfaces are unavailable or fail with an
authorization error, and no data changes are saved.

### AUTH-09: auth callback failure shows a browser error page

**Purpose:** Confirm browser users do not see raw JSON when the OIDC callback
cannot find its short-lived login-state cookie.

**Users:** None; use a signed-out browser or private window.

**Prerequisites:** App is running.

**Steps:**

1. Open `/auth/error?code=login_state_cookie_missing&locale=sv`.
1. In a self-contained single-node deployment, repeat the check through the
   public application origin, for example
   `https://kravhantering.example.internal/auth/error?code=hsa_id_missing&locale=sv`.
1. Inspect the visible page and the primary action.

**Expected result:** The page explains that the sign-in could not be completed,
shows the supplied error code, and offers a sign-in retry. The single-node
check shows the Kravhantering error page, not the Keycloak 404 page.
In deployed or production-like environments, the server log for the original
callback failure should contain sanitized diagnostics for TLS, Secure-cookie
handling, and callback host configuration.

## Requirements library

### REQ-01: library loads with seeded requirements

**Purpose:** Confirm the main library renders a useful baseline.

**Users:** `ada.admin`.

**Prerequisites:** Seeded database is available.

**Steps:**

1. Open `/sv/requirements`.
1. Verify the page heading and table are visible.
1. Confirm `Krav-ID`, `Kravtext`, and at least one seeded row are visible.

**Expected result:** The library loads without error and shows seeded
requirements.

### REQ-02: language switch keeps the library usable

**Purpose:** Confirm locale navigation works from the library.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements` in a fresh browser context, or clear
the local storage entry `requirements.stewardship.tab`.

**Steps:**

1. Use the language control to switch to English.
1. Verify the URL changes to `/en/requirements`.
1. Switch back to Swedish.

**Expected result:** Labels change language and the requirements table remains
usable after each switch.

### REQ-03: filter by requirement ID and clear filters

**Purpose:** Confirm header filters narrow and restore the list.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Open the `Krav-ID` filter.
1. Enter `INT0001`.
1. Apply the filter.
1. Verify only matching rows remain.
1. Clear the filter.

**Expected result:** The table narrows to `INT0001` and returns to the full
list after clearing.

### REQ-04: sort by a sortable column

**Purpose:** Confirm table sorting works and toggles direction.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Click the `Krav-ID` header.
1. Note the first few visible IDs.
1. Click `Krav-ID` again.
1. Note the new order.

**Expected result:** The sort direction toggles and the row order changes
consistently.

### REQ-05: column picker persists visible columns

**Purpose:** Confirm personal column visibility preferences persist.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Open the floating column picker.
1. Enable `Kvalitetsegenskap`, `Kravpaket`, `Test krävs`, and `Version`.
1. Close the picker.
1. Verify that the `Kravpaket` column shows package names or `—`.
1. Select a `Kravpaket` chip filter option, then hide the `Kravpaket` column.
1. Verify that the chip stays selected and the list remains filtered.
1. Reload the page.

**Expected result:** The enabled columns remain visible after reload, header
filters tied to hidden columns are cleared, and the `Kravpaket` chip filter is
preserved independently of the optional column.

### REQ-06: reset local library view preferences

**Purpose:** Confirm the local reset restores admin-managed defaults.

**Users:** `ada.admin`.

**Prerequisites:** Complete REQ-05 or otherwise change visible columns.

**Steps:**

1. Open the column picker or library action rail.
1. Select the reset action.
1. Reload the page.

**Expected result:** Local visibility and width overrides return to the
organization defaults.

### REQ-07: resize a table column

**Purpose:** Confirm spreadsheet-style resizing works manually.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements` on desktop.

**Steps:**

1. Drag the resize divider after `Kravtext` to the right.
1. Verify the column grows while neighboring columns shift right.
1. Release the pointer.
1. Reload the page.

**Expected result:** The width change is visible during drag and persists after
reload.

### REQ-08: sticky header and floating rail stay usable

**Purpose:** Confirm scrolling affordances remain available.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements` with enough rows to scroll.

**Steps:**

1. Scroll down until the table header reaches the sticky navigation.
1. Verify the header remains visible.
1. Verify the floating column rail remains visible near the table.
1. Use the scroll-to-top action if it appears.

**Expected result:** Header labels and floating actions remain reachable while
scrolling, and the scroll-to-top action returns to the table header.

### REQ-09: inline detail pane content order

**Purpose:** Confirm requirement details prioritize requirement text.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Expand the row for `INT0001`.
1. Inspect the inline detail pane.
1. Check the first sections in order.

**Expected result:** Requirement text appears first, acceptance criteria second,
then metadata such as area, owner, references, and packages.

### REQ-10: library list report entrypoint works

**Purpose:** Confirm the visible list can be exported or printed.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Apply a simple filter such as `INT`.
1. Open the report or print menu from the library action rail.
1. Select the list report option.
1. Repeat with the PDF list report option.

**Expected result:** A report route opens or a generated PDF downloads for the
filtered requirements without losing the current list context or duplicating
the locale prefix in the route.

### REQ-11: localized library error recovery

**Purpose:** Confirm the Swedish recovery panel is understandable.

**Users:** `ada.admin`.

**Prerequisites:** App is running.

**Steps:**

1. Open `/sv/error-boundary-test`.
1. Review the recovery panel.
1. Select `Gå till kravbiblioteket`.

**Expected result:** The panel says `Något gick fel`, does not leak stack text,
and the recovery link returns to `/sv/requirements`.

### REQ-12: detail action menus are keyboard accessible

**Purpose:** Confirm detail-rail share and report menus expose accessible menu
behavior.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements` and expand a requirement row.

**Steps:**

1. Move focus to `Dela` and press Enter.
1. Use ArrowDown, ArrowUp, Home, and End to move between share options.
1. Press Escape.
1. Open `Skriv ut`, use the same arrow keys, then press Tab.
1. Reopen `Dela` and copy one link.

**Expected result:** Each menu opens with focus on the first option, arrow keys
cycle only through menu options, Escape returns focus to the trigger, Tab closes
the report menu without trapping focus, and the copy result is announced as
`Kopierad`.

### REQ-13: requirement-library stewardship manages packages and questions

**Purpose:** Confirm package stewardship and requirement-selection question
management live outside Admin Center.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Verify the header navigation contains `Kravbiblioteksförvaltning`.
1. Click `Kravbiblioteksförvaltning` and verify it opens `Kravpaket` when no
   previous stewardship tab has been selected.
1. Verify the page content shows `Kravpaket` as the only page heading, without
   a separate `Kravbiblioteksförvaltning` heading above it.
1. Verify `Kravbiblioteksförvaltning` expands the header downward and shows
   the inline `Kravpaket` and `Kravurvalsfrågor` links centered directly under
   the parent button inside the same surrounding background.
1. Click `Kravunderlag` and verify the inline subnavigation closes. Click
   `Kravbiblioteksförvaltning` again, then click `Kravbibliotek` and verify the
   inline subnavigation closes.
1. Click `Kravbiblioteksförvaltning` once more to return to `Kravpaket`.
1. On `Kravpaket`, use the floating `Nytt kravpaket` pill and verify the new
   package form opens as a modal.
1. Create or edit a package with `Namn`, `Beskrivning`, `HSA-ID` and
   `Visningsnamn`.
1. Switch to `Kravurvalsfrågor`, verify that title is now the page heading, and
   use the floating `Skapa kravurvalsfråga` pill.
1. Verify the new question form opens as a modal and create a question for a
   requirement area.
1. Open `/sv/requirements`, click `Kravbiblioteksförvaltning`, and verify the
   parent navigation returns to `Kravurvalsfrågor`.
1. Add a normal answer linked to a package or requirement.
1. Add an `Utan kravurval` answer and verify links are cleared for that answer.
1. Use the question search and filters to narrow by question text, requirement
   area, and active/archived status.
1. Edit the question text and an answer text, then verify the edited values are
   shown without creating duplicate rows.
1. Expand an answer preview and verify it lists matching published requirements
   and flags `Saknar kravurval` when no published requirement currently matches.
1. Reload the page.

**Expected result:** The last stewardship tab is restored, only the active
stewardship view title is shown as the page heading, package leads use direct
HSA-ID/display-name fields, the question gets a stable `KUF` code, questions
have no required/mandatory setting, and active answers without links remain
editable as action-required health items.

## Requirement creation and lifecycle

### LIFE-01: create a requirement from the UI

**Purpose:** Confirm the new requirement form creates and opens a requirement.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements/new`.

**Steps:**

1. Select a value in `Kravområde`.
1. Enter unique test text in `Kravtext`.
1. Fill other required fields if marked.
1. Submit the form.

**Expected result:** The app redirects to `/sv/requirements`, opens the new
requirement inline, and the entered text is visible.

### LIFE-02: validate required fields on create

**Purpose:** Confirm empty required fields are rejected.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements/new`.

**Steps:**

1. Leave `Kravområde` or `Kravtext` empty.
1. Submit the form.
1. Review the validation feedback.

**Expected result:** The form stays open, required-field feedback is shown, and
no requirement is created.

### LIFE-03: submit a draft for review

**Purpose:** Confirm the requirement lifecycle enters review.

**Users:** `ada.admin`.

**Prerequisites:** Create or open a Draft requirement.

**Steps:**

1. Open the requirement detail.
1. Select the lifecycle action that moves the draft to `Granskning`.
1. Confirm the action if prompted.

**Expected result:** The status stepper shows `Granskning`, and the library row
updates to Review. In the inline library detail pane, the page stays close to
the workflow stepper instead of jumping down to `Förbättringsförslag`.

### LIFE-04: return a review requirement to draft

**Purpose:** Confirm review can be cancelled back to draft.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** Open a requirement in `Granskning`.

**Steps:**

1. Select the return-to-draft lifecycle action.
1. Cancel the first confirmation if shown.
1. Verify the requirement remains in `Granskning`.
1. Select the action again and confirm.

**Expected result:** Cancelling keeps the review state; confirming returns the
requirement to `Utkast`. In the inline library detail pane, the page stays close
to the workflow stepper instead of jumping down to `Förbättringsförslag`.

### LIFE-05: approve and publish a reviewed requirement

**Purpose:** Confirm the happy path to Published.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** Open a requirement in `Granskning`.

**Steps:**

1. Select the approve or publish lifecycle action.
1. Confirm the action.
1. Return to the library.

**Expected result:** The requirement version status is `Publicerad`, with published
date information recorded in the detail view or version history.

### LIFE-06: create a new draft version from a published requirement

**Purpose:** Confirm editing Published content creates a pending version.

**Users:** `ada.admin`.

**Prerequisites:** Open a `Publicerad` requirement.

**Steps:**

1. Start editing the requirement.
1. Change the requirement text or acceptance criteria.
1. Save the edit.
1. Inspect the version history.

**Expected result:** The published version remains visible and a newer
`Utkast` version is created for review.

### LIFE-07: restore an archived requirement version

**Purpose:** Confirm restore starts a new draft.

**Users:** `ada.admin`.

**Prerequisites:** Open a requirement with an archived version.

**Steps:**

1. Select an archived version in the version history.
1. Use the restore action.
1. Confirm the action.

**Expected result:** The restored content appears as a new `Utkast` version and
must go through review before publication.

### LIFE-08: cancel archive initiation

**Purpose:** Confirm cancelling archive initiation keeps Published state.

**Users:** `ada.admin`.

**Prerequisites:** Open fixture `PWT0009` or another `Publicerad` requirement.

**Steps:**

1. Select `Arkivera`.
1. In the confirmation dialog, select `Avbryt`.
1. Inspect the status stepper.

**Expected result:** The requirement remains `Publicerad` and no archive review
starts.

### LIFE-09: approve archiving after one cancelled approval

**Purpose:** Confirm the two-step archive happy path.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** Open fixture `PWT0005` or another `Publicerad` requirement.

**Steps:**

1. Select `Arkivera` and confirm.
1. Verify the status is `Arkiveringsgranskning`.
1. Select `Godkänn arkivering`.
1. Cancel the confirmation.
1. Verify status remains `Arkiveringsgranskning`.
1. Select `Godkänn arkivering` again and confirm.

**Expected result:** The requirement becomes `Arkiverad` and leaves the active
library list.

### LIFE-10: cancel archiving after one cancelled cancellation

**Purpose:** Confirm an archive review can return to Published.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** Open fixture `PWT0007` or another `Publicerad` requirement.

**Steps:**

1. Select `Arkivera` and confirm.
1. Verify the status is `Arkiveringsgranskning`.
1. Select `Avbryt arkivering`.
1. Cancel the confirmation.
1. Verify status remains `Arkiveringsgranskning`.
1. Select `Avbryt arkivering` again and confirm.

**Expected result:** The requirement returns to `Publicerad`.

### LIFE-11: detail reports are available by status

**Purpose:** Confirm report menu options match requirement state.

**Users:** `ada.admin`.

**Prerequisites:** Open requirements in Draft, Review, Published, and Archived
states when available.

**Steps:**

1. Open the report menu in each requirement detail view.
1. Check the history report option.
1. For a Review requirement, check the review change report option.
1. Generate one report.

**Expected result:** History is available for all statuses, review reports are
limited to Review, and the report opens or downloads successfully.

## Requirement detail collaboration

### COL-01: add a requirement to a specification

**Purpose:** Confirm a requirement can be linked to a requirements
specification.

**Users:** `ada.admin`.

**Prerequisites:** Open a requirement detail page.

**Steps:**

1. Select the add-to-specification action.
1. Choose an available requirements specification.
1. Confirm the addition.
1. Open the specification detail.

**Expected result:** The requirement appears in `Krav i underlaget`.

### COL-02: register an improvement suggestion

**Purpose:** Confirm suggestions can be drafted from the detail pane.

**Users:** `ada.admin`.

**Prerequisites:** Open a requirement detail.

**Steps:**

1. Open the improvement suggestion section.
1. Select the action to add a suggestion.
1. Enter a clear suggestion text.
1. Save it.

**Expected result:** The suggestion appears with Draft status.

### COL-03: request review for an improvement suggestion

**Purpose:** Confirm suggestion review state can be requested.

**Users:** `ada.admin`.

**Prerequisites:** A Draft suggestion exists.

**Steps:**

1. Open the suggestion actions.
1. Select the request-review action.
1. Confirm if prompted.

**Expected result:** The suggestion status changes to review requested.

### COL-04: resolve an improvement suggestion

**Purpose:** Confirm a review-requested suggestion can be resolved.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** A suggestion has review requested.

**Steps:**

1. Open the suggestion actions.
1. Select the resolve action.
1. Enter resolution text.
1. Submit.

**Expected result:** The suggestion is marked resolved with resolver and date
information.

### COL-05: dismiss an improvement suggestion

**Purpose:** Confirm a review-requested suggestion can be dismissed.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** A suggestion has review requested.

**Steps:**

1. Open the suggestion actions.
1. Select the dismiss action.
1. Enter a dismissal reason.
1. Submit.

**Expected result:** The suggestion is marked dismissed and remains visible in
history.

### COL-06: suggestion history report includes suggestions

**Purpose:** Confirm suggestion history reporting works.

**Users:** `ada.admin`.

**Prerequisites:** Open a requirement with one or more suggestions.

**Steps:**

1. Open the report menu.
1. Select the improvement suggestion history report.
1. Inspect the generated report.

**Expected result:** Suggestions are grouped by requirement version and include
status, author, date, and resolution details.

### COL-07: metadata shows requirement area owner and reference data

**Purpose:** Confirm detail metadata is complete and readable.

**Users:** `ada.admin`.

**Prerequisites:** Open a seeded requirement with requirement area, package,
and norm reference data.

**Steps:**

1. Expand the requirement detail.
1. Check the requirement area metadata and owner text.
1. Check requirement packages.
1. Check norm references.

**Expected result:** Requirement area owner, packages, and references are shown
without moving above the primary requirement text sections.

## Requirements specifications

### SPEC-01: list, filter, and clear specifications

**Purpose:** Confirm the specification list can be searched and restored.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications`.

**Steps:**

1. Verify the heading `Kravunderlag` is visible.
1. Type `e-tjänst` in the name filter.
1. Verify `Upphandling av e-tjänstplattform` remains visible.
1. Verify unrelated rows are hidden.
1. Select `Rensa sökning`.

**Expected result:** Filtering narrows the list and clearing restores all
visible specifications.

### SPEC-02: create a new specification

**Purpose:** Confirm requirements specifications can be created.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications`.

**Steps:**

1. Select the floating `Nytt kravunderlag` pill.
1. Fill name, specification lifecycle status, governance object type, and
   implementation type.
1. Add a business need reference if required.
1. Save.

**Expected result:** The new specification appears in the list with a stable
slug and selected metadata.

### SPEC-03: edit a specification from detail title action

**Purpose:** Confirm the detail title edit action opens a prefilled form.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications/ETJANST-UPP-2026`.

**Steps:**

1. Verify heading `Upphandling av e-tjänstplattform`.
1. Select `Redigera kravunderlag`.
1. Check the edit form.

**Expected result:** The form heading says `Redigera kravunderlag` and the name
field is prefilled with the current specification name.

### SPEC-04: delete a specification with confirmation

**Purpose:** Confirm delete requires confirmation and removes the item.

**Users:** `ada.admin`.

**Prerequisites:** Create a disposable specification for this case.

**Steps:**

1. Open `/sv/specifications`.
1. Select the delete action for the disposable row.
1. Cancel the first confirmation.
1. Verify the row remains.
1. Select delete again and confirm.

**Expected result:** Cancel leaves the row unchanged; confirm removes it from
the list.

### SPEC-05: split lists scroll independently

**Purpose:** Confirm the specification detail panels have independent scroll.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications/ETJANST-UPP-2026` on desktop.

**Steps:**

1. Ensure `Krav i underlaget` and `Tillgängliga krav` are visible.
1. Scroll inside the right panel.
1. Check that the left panel and page scroll position stay fixed.
1. Verify the sticky title bar remains visible.

**Expected result:** Only the scrolled panel moves and its title bar remains
attached to that panel.

### SPEC-06: add and remove a requirement in specification detail

**Purpose:** Confirm list membership can be maintained from the detail page.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail with available requirements.

**Steps:**

1. Select one requirement in `Tillgängliga krav`.
1. Add it to the specification.
1. Verify it appears in `Krav i underlaget`.
1. Remove the same requirement.

**Expected result:** The requirement moves between the available and included
lists as expected.

### SPEC-07: create a unique requirement

**Purpose:** Confirm a unique requirement can be created.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail page.

**Steps:**

1. Select the unique requirement creation action.
1. Confirm the form does not show the `Kravområde` field.
1. Fill the unique requirement text and metadata.
1. Save.
1. Expand the new unique row.

**Expected result:** The unique requirement appears only inside the current
specification, shows `-` in the `Kravområde` column, and has a local item
reference.

### SPEC-08: update usage status

**Purpose:** Confirm usage status can be changed inline.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail with included requirements.

**Steps:**

1. Ensure the usage status column is visible in `Krav i underlaget`.
1. Change a row from `Inkluderad` to `Pågående`.
1. Reload the page.

**Expected result:** The status change is saved and remains after reload.

### SPEC-09: manage needs references

**Purpose:** Confirm specification-local needs references can be pre-registered,
edited, inspected, and assigned to requirement rows.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail with included requirements.

**Steps:**

1. Open the `Behovsreferenser` tab in the left panel.
1. Verify the tab is in the left list header and that the right-side action
   pills change from requirement-list actions to the new-reference action.
1. Create a new needs reference with a description.
1. Create another needs reference without a description.
1. Verify the row without a description shows a completion warning.
1. Expand a needs-reference row and inspect linked requirements.
1. Return to `Krav i underlaget`.
1. Change one row's `Behovsreferens` dropdown to the created reference.
1. Select multiple rows so the bulk needs-reference dropdown appears.
1. Open the help button next to the bulk needs-reference dropdown.
1. Apply a needs reference through the bulk dropdown.
1. Return to `Behovsreferenser` and try deleting a used reference.
1. Delete an unused reference.

**Expected result:** URL state can reopen the `Behovsreferenser` tab, linked
counts update after assignments, the bulk dropdown help explains the batch
assignment, used references cannot be deleted, and unused pre-registered
references can be deleted intentionally.

### SPEC-10: generate specification list report

**Purpose:** Confirm specification-scoped reporting works.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail with included requirements.

**Steps:**

1. Select one or more requirements in `Krav i underlaget`.
1. Open the report menu.
1. Generate the specification list report.

**Expected result:** The report includes specification metadata and the chosen
library or unique requirement rows.

### SPEC-11: reset specification column views

**Purpose:** Confirm each specification table restores its own default view.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications/ETJANST-UPP-2026`.

**Steps:**

1. In `Krav i underlaget`, open the column picker.
1. Hide `Behovsreferens` and show one or more library-only columns.
1. Select `Återställ standardvy`.
1. Repeat from `Tillgängliga krav` after showing extra columns.

**Expected result:** `Krav i underlaget` resets to `Krav-ID`, `Kravtext`,
`Kravområde`, and `Behovsreferens`. `Tillgängliga krav` resets to `Krav-ID`,
`Kravtext`, and `Kravområde`; it does not use the Kravbibliotek default column set.

### SPEC-12: answer requirement-selection questions

**Purpose:** Confirm optional requirement-selection answers filter available
requirements and appear in reports.

**Users:** `ada.admin`.

**Prerequisites:** Open a specification detail with active
requirement-selection questions.

**Steps:**

1. In the right panel, switch from `Tillgängliga krav` to `Kravurvalsfrågor`.
1. Filter the question tab by text, requirement area, and unanswered questions.
1. Answer one single-choice question and one multiple-choice question.
1. For a multiple-choice question, choose `Utan kravurval`.
1. Return to `Tillgängliga krav`.
1. Verify manual filters were cleared, sort/column choices remain, and the
   filter controls can be deliberately reopened.
1. Choose an answer that should match requirements but currently matches no
   published requirements, if such a fixture exists.
1. Generate the specification list report.
1. Clear one saved answer.

**Expected result:** Progress updates without blocking unanswered questions,
`Utan kravurval` is exclusive and does not narrow available requirements on its
own, active non-empty answers filter available requirements, empty published
matches show a neutral warning, the report shows the selection context with
question, answer, status, change timestamp, and actor snapshot before the
requirement table, and clearing an answer returns that question to unanswered.

## Deviations

### DEV-01: create a draft deviation

**Purpose:** Confirm a deviation can be registered for a requirement application.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications/PLAYWRIGHT-LIFECYCLE-2026`.

**Steps:**

1. Expand fixture `PWT0001` or another included requirement row.
1. Select `Begär ett avsteg`.
1. Fill the motivation.
1. Select `Registrera avsteg`.

**Expected result:** A deviation appears with workflow step `Utkast`.

### DEV-02: request deviation review

**Purpose:** Confirm a draft deviation can move to review requested.

**Users:** `ada.admin`.

**Prerequisites:** A Draft deviation exists.

**Steps:**

1. Open the deviation controls.
1. Select `Granskning`.
1. Reopen the row if the panel refreshes.

**Expected result:** The active step is `Granskning begärd`.

### DEV-03: cancel return to draft

**Purpose:** Confirm the confirmation dialog protects review state.

**Users:** `ada.admin`.

**Prerequisites:** A deviation is in `Granskning begärd`.

**Steps:**

1. Select the return-to-draft action.
1. In the confirmation dialog, select `Avbryt`.
1. Inspect the deviation stepper.

**Expected result:** The deviation remains in `Granskning begärd`.

### DEV-04: approve a deviation

**Purpose:** Confirm deviation approval records a decision.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** A deviation is in `Granskning begärd`.

**Steps:**

1. Select `Registrera beslut`.
1. Choose `Godkänn`.
1. Fill decision motivation.
1. Submit.

**Expected result:** The stepper shows `Beslutad`, the pill says `Godkänd`,
and decision motivation is visible.

### DEV-05: reject a deviation

**Purpose:** Confirm deviation rejection records a decision.

**Users:** `rita.reviewer` or `ada.admin`.

**Prerequisites:** A deviation is in `Granskning begärd`.

**Steps:**

1. Select `Registrera beslut`.
1. Choose `Avslå`.
1. Fill decision motivation.
1. Submit.

**Expected result:** The stepper shows `Beslutad`, the pill says `Avslagen`,
and decision motivation is visible.

### DEV-06: decided deviations are terminal

**Purpose:** Confirm decided deviations cannot be reopened or edited.

**Users:** `ada.admin`.

**Prerequisites:** A deviation is approved or rejected.

**Steps:**

1. Open the decided deviation.
1. Look for edit, delete, or reopen actions.
1. Try to change the decision if an action is visible.

**Expected result:** Terminal deviations cannot be edited, deleted, or reopened.

### DEV-07: no-role user cannot decide deviations

**Purpose:** Confirm review decisions require a reviewer-capable actor.

**Users:** `noah.noroles`.

**Prerequisites:** A deviation is in `Granskning begärd`.

**Steps:**

1. Sign in as `noah.noroles`.
1. Open the relevant requirement application.
1. Try to register a deviation decision.

**Expected result:** Decision controls are unavailable or the server rejects
the mutation without changing deviation state.

## Admin Center

### ADMIN-01: terminology changes apply to the library

**Purpose:** Confirm terminology saves and affects visible labels.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/admin`.

**Steps:**

1. On `Terminologi`, change the singular label for categories.
1. Select `Spara`.
1. Open `/sv/requirements`.
1. Inspect the table headers.

**Expected result:** The changed label appears in the library and remains after
reload.

### ADMIN-02: requirement column defaults affect new library views

**Purpose:** Confirm admin-managed column order and defaults are saved.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/admin`.

**Steps:**

1. Open the `Kolumner` tab.
1. Move `Kategori` above or below `Kravområde`.
1. Verify that `Kravpaket` is available as a hidden-by-default column.
1. Select `Spara`.
1. Open `/sv/requirements` in a fresh browser context.

**Expected result:** The library uses the saved organization-wide column order.

### ADMIN-03: reference-data CRUD page saves changes

**Purpose:** Confirm reference-data pages can create and edit rows.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/admin?tab=referenceData`.

**Steps:**

1. Open `Kravområden`.
1. Create a disposable requirement area with a unique prefix.
1. Edit its name.
1. Delete it if deletion is allowed.
1. Open a reference-data page with no rows, or remove the disposable row if that
   leaves the table empty.

**Expected result:** Create and edit actions persist, and delete either removes
the row or shows a clear dependency message. Empty reference-data tables show a
localized empty-state row; tables with an existing create flow include a `Ny`
CTA that opens the same create form.

### ADMIN-04: browser back restores reference-data tab

**Purpose:** Confirm Admin Center tab state survives navigation.

**Users:** `ada.admin`.

**Prerequisites:** Open `/en/admin`.

**Steps:**

1. Select the `Reference data` tab.
1. Open the requirement areas card.
1. Use browser Back.

**Expected result:** The browser returns to `/en/admin?tab=referenceData`, and
the `Reference data` tab remains selected.

### ADMIN-05: mobile admin tabs and actions remain usable

**Purpose:** Confirm small screens can access Admin Center controls.

**Users:** `ada.admin`.

**Prerequisites:** Use a mobile viewport such as 375 by 812.

**Steps:**

1. Open `/sv/admin`.
1. Horizontally scroll the tab list.
1. Select `Referensdata`.
1. Select `Kolumner`.
1. Check `Återställ standardvy` and `Spara`.

**Expected result:** Tabs and buttons are visible, selectable, and large enough
to operate by touch.

### ADMIN-06: action log filters and exports CSV

**Purpose:** Confirm Admin action-log evidence can be reviewed.

**Users:** `ada.admin`.

**Prerequisites:** Seeded action-log events exist, or create a requirement first.

**Steps:**

1. Open `/sv/admin/audit-log`.
1. Enter `requirement.create` in `Åtgärd`.
1. Select `Filtrera`.
1. Select `Exportera CSV`.

**Expected result:** The URL includes the action filter, matching events remain
visible, and the CSV contains headers such as `occurredAt;actorKind`.

### ADMIN-07: access-review decision and export

**Purpose:** Confirm Admin users can decide and export access reviews.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/admin?tab=accessReview`.

**Steps:**

1. Open a run containing `Kalle Svensson`.
1. Enter decision comment `Fortsatt uppdrag`.
1. Mark the row approved.
1. Export JSON.
1. Export PDF.

**Expected result:** The row shows `Godkänd`, the comment remains visible, and
both exports are available.

### ADMIN-08: access-review validation rejects long comments

**Purpose:** Confirm client validation prevents invalid decision payloads.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/admin?tab=accessReview`.

**Steps:**

1. Open a pending access-review row.
1. Enter a comment longer than 10,000 characters.
1. Try to save a decision.

**Expected result:** The panel shows a validation message and does not save the
row.

### ADMIN-09: archiving retention preview is privacy-gated

**Purpose:** Confirm retention tools are restricted to PrivacyOfficer users.

**Users:** `ada.admin`, `only.admin`, and `disa.privacy`.

**Prerequisites:** Sign out between users.

**Steps:**

1. As `ada.admin`, open `/sv/admin?tab=archiving`.
1. Verify retention controls are visible.
1. Sign in as `only.admin` and open the same URL.
1. Sign in as `disa.privacy` and open the same URL.

**Expected result:** `ada.admin` and `disa.privacy` can use archiving privacy
tools; `only.admin` is redirected to the default tab or sees disabled access.

### ADMIN-10: reference-data icons render across requirement surfaces

**Purpose:** Confirm admins can assign and clear icons from the installed
Lucide catalog, and that labels remain visible wherever icons are rendered.

**Users:** `ada.admin`.

**Prerequisites:** Use seeded data with at least one published requirement such
as `INT0001`.

**Steps:**

1. Open `/sv/requirement-statuses`.
1. Edit `Granskning`, search for `wifi`, choose icon `Wifi`, save, and confirm
   the table preview shows the icon plus the label.
1. Edit the same row again, select `Rensa`, save, and confirm the table keeps
   the label without an icon.
1. Restore `Eye`, then open `/sv/risk-levels` and
   `/sv/specification-item-statuses` and verify each form has the same
   searchable icon picker.
1. Open `/sv/requirements`, then open a requirement detail page and version
   history.
1. Use the report menu to open a print report and download a PDF report.
1. Confirm the PDF download either starts quickly or shows the temporary
   `Genererar PDF...` dialog if generation takes longer than a few seconds.
1. Switch dark mode on and repeat the table/detail visual check.

**Expected result:** Lucide catalog icons can be selected, clearing stores no
icon, labels remain readable, the configured icons appear consistently in
tables, badges, the status stepper, version history, print reports, and PDF
reports, and the browser console has no Content Security Policy or WebAssembly
errors while downloading the PDF.

## Privacy and data portability

### PRIV-01: self-service privacy export

**Purpose:** Confirm signed-in users can export their own personal data.

**Users:** `ada.admin`.

**Prerequisites:** Sign in as `ada.admin`.

**Steps:**

1. Open `/sv/privacy`.
1. Verify heading `Export av personuppgifter`.
1. Select `Exportera JSON`.

**Expected result:** The export is generated for the signed-in user's HSA-ID
without entering a target HSA-ID.

### PRIV-02: PrivacyOfficer preview by HSA-ID

**Purpose:** Confirm privacy preview uses exact HSA-ID matching.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Open `/sv/admin?tab=privacy`.

**Steps:**

1. Enter `SE5560000001-linneab` in `HSA-ID att söka efter`.
1. Select `Förhandsgranska`.
1. Review the preview groups.

**Expected result:** Preview rows appear for Linnéa-related assignments,
creator snapshots, decisions, access reviews, and audit actor snapshots.

### PRIV-03: preview target exports JSON and PDF

**Purpose:** Confirm data portability works after a privacy preview.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Complete PRIV-02.

**Steps:**

1. Select `Exportera JSON`.
1. Save or inspect the generated response.
1. Select `Exportera PDF`.

**Expected result:** Both exports target `SE5560000001-linneab`; PDF delivery
downloads a binary PDF response, and filenames use a fingerprint rather than
the raw HSA-ID.

### PRIV-04: duplicate-name privacy search uses HSA-ID only

**Purpose:** Confirm duplicate names do not cause overbroad matching.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Open `/sv/admin?tab=privacy`.

**Steps:**

1. Preview `SE5560000001-kalle1`.
1. Note the affected rows.
1. Preview `SE5560000001-kalle2`.
1. Compare the affected rows.

**Expected result:** The two `Kalle Svensson` users produce distinct HSA-ID
matches; name alone does not join their records.

### PRIV-05: replacement-person switch action

**Purpose:** Confirm live assignments can be switched to a replacement.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Use disposable or resettable seed data before execution.

**Steps:**

1. Open `/sv/admin?tab=privacy`.
1. Enter a target HSA-ID with live assignments.
1. Enter replacement display name and replacement HSA-ID.
1. Select `Förhandsgranska`.
1. Choose switch actions where available.
1. Execute the erasure.

**Expected result:** Switchable live assignments move to the replacement person
and historical snapshots follow their configured policy.

### PRIV-06: anonymize and skip actions

**Purpose:** Confirm row-level action choices are applied correctly.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Use resettable seed data before execution.

**Steps:**

1. Preview a target with several row groups.
1. Choose `Anonymisera` for one historical snapshot row.
1. Choose `Hoppa över` for another row.
1. Execute the erasure.

**Expected result:** The anonymized row is marked complete, skipped rows remain
unchanged, and the receipt explains each result.

### PRIV-07: stale preview is rejected

**Purpose:** Confirm execution recomputes matches before changing data.

**Users:** `ada.admin` or `disa.privacy`.

**Prerequisites:** Use two browser tabs or mutate the target between preview
and execution.

**Steps:**

1. Preview a target in tab A.
1. Change one affected assignment in tab B.
1. Return to tab A and execute the old preview.

**Expected result:** The execution is rejected as stale or unsafe, and no
partial unexpected changes are made.

### PRIV-08: privacy execution emits action-log evidence

**Purpose:** Confirm privacy actions produce reviewable evidence.

**Users:** `ada.admin`.

**Prerequisites:** Execute a privacy action in a resettable environment.

**Steps:**

1. Complete a small privacy execution.
1. Open `/sv/admin/audit-log`.
1. Filter for privacy-related action names.
1. Inspect the details.

**Expected result:** The action-log event includes counts and target fingerprint,
but does not expose the raw target HSA-ID in details.

## Developer and resilience surfaces

### DEVTOOLS-01: Developer Mode chip copies a reference

**Purpose:** Confirm annotated UI elements can be inspected.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/requirements`.

**Steps:**

1. Filter to `INT0001`.
1. Expand the row.
1. Press `Control+Alt+Shift+H`.
1. Hover the requirement text section.
1. Click the Developer Mode chip.

**Expected result:** The Developer Mode badge is visible, the chip identifies
the detail section, and a toast shows the copied reference path.

### DEVTOOLS-02: Developer Mode persists across navigation

**Purpose:** Confirm Developer Mode remains active during client navigation.

**Users:** `ada.admin`.

**Prerequisites:** Developer Mode is enabled on `/sv/requirements`.

**Steps:**

1. Navigate to `/sv/admin`.
1. Verify the Developer Mode badge remains visible.
1. Hover an Admin Center tab.

**Expected result:** A Developer Mode chip appears on the Admin Center page
without pressing the shortcut again.

### DEVTOOLS-03: specification report controls are annotated

**Purpose:** Confirm Developer Mode covers specification report controls.

**Users:** `ada.admin`.

**Prerequisites:** Open `/sv/specifications/ETJANST-UPP-2026`.

**Steps:**

1. Enable Developer Mode.
1. Expand a requirement application if needed.
1. Hover the specification report control.

**Expected result:** A chip appears with a useful specification-context
reference.

### RES-01: English admin error recovery

**Purpose:** Confirm localized admin error recovery works.

**Users:** `ada.admin`.

**Prerequisites:** App is running.

**Steps:**

1. Open `/en/admin/error-boundary-test`.
1. Review the recovery panel.
1. Select `Go to admin`.

**Expected result:** The panel says `Something went wrong`, does not leak stack
text, and links back to `/en/admin`.

### RES-02: homepage smoke

**Purpose:** Confirm the app root responds.

**Users:** Any signed-in user, or signed out if the route allows redirect.

**Prerequisites:** App is running.

**Steps:**

1. Open `/`.
1. Check the browser title.

**Expected result:** The page responds with a non-empty title or a valid login
redirect.

### RES-03: readiness and build metadata

**Purpose:** Confirm runtime probes and build metadata are available.

**Users:** Any signed-in user for the UI check; API probe does not require a
session.

**Prerequisites:** App is running with SQL Server and Keycloak reachable.

**Steps:**

1. Request `/api/health`.
1. Request `/api/ready`.
1. Open `/sv/requirements`.
1. Hover the app title in the header.

**Expected result:** `/api/health` returns `{ "status": "ok" }`,
`/api/ready` returns `{ "status": "ready" }`, and the header title tooltip
shows the generated app version when build metadata exists.
