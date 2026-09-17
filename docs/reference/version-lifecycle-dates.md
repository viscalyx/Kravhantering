# Version Lifecycle Dates

This reference is for developers implementing or interpreting requirement
version dates, retention rules, and status filters. Each
`requirement_versions` row carries six lifecycle timestamps and one retention
marker for requirements-specification history. For user workflows, see
[Lifecycle Workflow](../governance/lifecycle-workflow.md).

## Columns

<!-- markdownlint-disable MD013 -->
| Column | Type | Description |
| --- | --- | --- |
| `created_at` | DATETIME2 NOT NULL | When the version row was first created |
| `edited_at` | DATETIME2 NULL | When the version was created or last saved through content editing |
| `published_at` | DATETIME2 NULL | When the version was published (status → 3) |
| `archive_initiated_at` | DATETIME2 NULL | When archiving review was initiated (status → 2 with flag) |
| `archived_at` | DATETIME2 NULL | When the version was archived (status → 4) |
| `status_updated_at` | DATETIME2 NULL | When `requirement_status_id` last changed; set at creation and on every status transition |
| `has_specification_item_history` | BIT NOT NULL | Retention marker set to true when the version has ever been linked to a requirements specification |
<!-- markdownlint-enable MD013 -->

## Statuses

| ID | Swedish    | English   |
| -- | ---------- | --------- |
| 1  | Utkast     | Draft     |
| 2  | Granskning | Review    |
| 3  | Publicerad | Published |
| 4  | Arkiverad  | Archived  |

## When New Versions Are Created

New version rows are created by these operations:

- **Creating a requirement** (`createRequirement`) — inserts v1
  as Draft. Batch creation and graduation of a specification-local requirement
  into the library also create a new requirement with a Draft v1.
- **Editing content while Published** (`editRequirement`) —
  inserts a new Draft version with incremented version number.
  When the current version is Draft, the existing row is updated
  in place instead.
- **Restoring an old version** (`restoreVersion`) — inserts a new
  Draft version that copies the old version's content.
  If the requirement is archived, `requirements.is_archived`
  stays `true` until the restored replacement version is
  published.

Status transitions **never** create new version rows. They update
the existing row in place.

The database enforces two storage-level lifecycle uniqueness
rules with SQL Server filtered unique indexes: only one version
per requirement may be Published, and only one version per
requirement may have `archive_initiated_at` set.

New version rows start with `status_updated_at = created_at` and
`has_specification_item_history = false`. The history marker is set to true
when the version is linked into a requirements specification and remains true
even if that specification link is later deleted.

Editing is **not allowed** when the current version is in Review
or Archived status. Publication review must first be moved back to Draft;
archiving review must be cancelled before editing the Published version.
Archived versions must be restored, which creates a new Draft version.

Edit requests must include the `baseVersionId` and
`baseRevisionToken` values that were current when editing started.
The server treats those normalized fields as optimistic concurrency
preconditions and rejects the save with `409 Conflict` if another save
has changed the latest version row before the request arrives.

## When `edited_at` Is Updated

`edited_at` starts at creation time and is updated by content saves.
Editable content includes:

- description
- acceptance criteria
- category, type, quality characteristic
- priority
- requirement packages and norm references
- verifiable and verification method

The DAL updates `edited_at` on each accepted edit request; it does not compare
old and new content to detect a no-op save. Do not interpret this field as proof
that a particular value changed.

`edited_at` is **never** updated by:

- Status transitions (`transitionStatus`)
- Archiving functions (`initiateArchiving`, `approveArchiving`, `cancelArchiving`)
- System-controlled date changes (`published_at`, `archived_at`,
  `archive_initiated_at`)

`status_updated_at` is the complementary lifecycle field: it changes on status
transitions but not on content-only edits. Admin Archiving uses it to identify
Draft and Review versions that have stayed in that status longer than the
approved retention policy. Draft retention also checks `edited_at`, so a
recent content save prevents a draft from qualifying solely because its status
is old. Archiving review is excluded from stale publication-review retention.

## Rules by Status

### Utkast (1) — Draft

- `created_at` — set at creation time.
- `edited_at` — set at creation time. Updated when content fields
  are saved.
- `status_updated_at` — set when the row enters Draft. It is unchanged by
  content edits.
- `published_at` — always `NULL`.
- `archived_at` — always `NULL`.

### Granskning (2) — Review (publishing flow)

Reached via in-place transition from Draft. No new version row.
For the archiving-review path (Published → Review) see
[Archiving Review](#archiving-review-published--review) below.

- `created_at` — unchanged from Draft.
- `edited_at` — unchanged from Draft. **Not** updated by the
  status transition.
- `status_updated_at` — set when the version transitions to Review.
- `published_at` — `NULL` (not yet published).
- `archived_at` — always `NULL`.

### Publicerad (3) — Published

Reached via in-place transition from Review. No new version row.

- `created_at` — unchanged.
- `edited_at` — unchanged. **Not** updated by the status
  transition.
- `published_at` — set when the version transitions to Published.
  Cancelling archiving preserves the original publication timestamp.
- `status_updated_at` — set when the version transitions to Published.
- `archive_initiated_at` — always `NULL`.
- `archived_at` — always `NULL`.

When a version is published and a previously published version of
the same requirement exists, the old version is automatically
archived: its `statusId` is set to 4 and `archived_at` is set to
the same timestamp as the new version's `published_at`. The archived
predecessor's `status_updated_at` is set to the same timestamp.

### Archiving Review (Published → Review)

Reached via `initiateArchiving` from Published status. The
version status moves back to Review (2) with `archive_initiated_at`
set. This is an in-place update — no new version row is created.

- `created_at` — unchanged.
- `edited_at` — unchanged. **Not** updated by the operation.
- `published_at` — unchanged from when the version was published.
- `archive_initiated_at` — set when `initiateArchiving` is called.
- `status_updated_at` — set when `initiateArchiving` moves the version back to
  Review.
- `archived_at` — always `NULL`.

From archiving review, there are two possible transitions:

- **`approveArchiving`**: sets `statusId` to 4 (Archived),
  sets `archived_at`, clears `archive_initiated_at` to `NULL`,
  sets `status_updated_at`, and sets `requirements.is_archived` to `true`.
- **`cancelArchiving`**: returns `statusId` to 3 (Published),
  clears `archive_initiated_at` to `NULL` and sets `status_updated_at`.
  `published_at` remains intact.

### Arkiverad (4) — Archived

Reached via the two-step archiving process (Published →
Review with `archive_initiated_at` set → Archived), or via
auto-archive when a newer version is published.

- `created_at` — unchanged.
- `edited_at` — unchanged. **Not** updated by the status
  transition.
- `published_at` — unchanged from when the version was published.
- `archive_initiated_at` — `NULL`. Cleared by `approveArchiving`;
  never set by auto-archive.
- `archived_at` — set when the version transitions to Archived.
- `status_updated_at` — set when the version transitions to Archived, including
  auto-archive during publication of a newer version.

## Chronological Order

The operations occur in lifecycle order: creation, content editing,
publication, then optional archiving review and archiving. Their timestamps
come from the application clock; the write paths do not enforce strict
inequalities. Separate operations can receive the same timestamp, so do not
use strict date comparisons to determine status or version order.

`created_at` and `edited_at` start equal. When a replacement is published,
its `published_at` equals the predecessor's `archived_at` and
`status_updated_at` because the same timestamp is used for both writes.

`archive_initiated_at` is a pending-review marker, not permanent history. It is
cleared on approval or cancellation, so a completed row does not retain all
six dates together.

`status_updated_at` reflects the latest status transition for the current row.
It can equal `created_at`, `published_at`, `archive_initiated_at`,
`archived_at`, or the time a Review version returned to Draft.

## Specification History Marker

`has_specification_item_history` is used only for retention decisions. It is
set when a version is linked into `requirements_specification_items` and is not
cleared when the link is removed. This makes it possible to distinguish
"never used in a requirements specification" from "used historically but no
longer linked" before Admin Archiving deletes old versions.

## Effective Requirement Status (Filtering)

When listing requirements the system computes an
**effective requirement status** for each requirement using the
following priority order (highest priority first):

<!-- markdownlint-disable MD013 -->
| Priority | Condition | Effective Requirement Status |
| -------- | --------- | ---------------- |
| 1 | Any version has `requirement_status_id = 3` | Published |
| 2 | No Published version and `requirements.is_archived = true` | Archived |
| 3 | No Published, not archived, any version has `requirement_status_id = 2` | Review |
| 4 | Otherwise | Draft |
<!-- markdownlint-enable MD013 -->

Each filter option shows only requirements whose effective
requirement status matches. This means:

- **Draft** — requirements with no Published or Review version and
  `is_archived = false`; older Archived versions do not prevent this result.
- **Review** — requirements whose highest-priority status
  is Review, with `is_archived = false`.
- **Published** — requirements that have at least one
  Published version.
- **Archived** — requirements that are archived
  (`is_archived = true`) and have no Published version,
  even while a newer Draft or Review replacement version
  exists.

The effective requirement status is computed at query time; it is not stored
as a column. It may differ from the newest version's status.

## Deleting Draft Versions

The delete-draft operation targets the latest version and requires it to be
Draft, regardless of whether earlier versions exist. Deletion removes that
version and its package/reference links, and clears the implementing-version
link on improvement suggestions that refer to it. Other versions are unchanged.

If no versions remain after deletion, the requirement itself is
also deleted.

## UI Display

The version history pills show the relevant date per status:

<!-- markdownlint-disable MD013 -->
| Status | Date shown in pill |
| --- | --- |
| Draft | `edited_at` |
| Publication review | None |
| Archiving review | Original `published_at` |
| Published | `published_at` |
| Archived | `archived_at` |
<!-- markdownlint-enable MD013 -->
