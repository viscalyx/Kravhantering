# Version Lifecycle Dates

Each `requirement_version` row carries five timestamp columns
that track its lifecycle. The values depend on the version's
**status** and the operations performed on it.

## Columns

<!-- markdownlint-disable MD013 -->
| Column | Type | Description |
| --- | --- | --- |
| `created_at` | TEXT NOT NULL | When the version row was first created |
| `edited_at` | TEXT NULL | When the version content was last edited |
| `published_at` | TEXT NULL | When the version was published (status → 3) |
| `archive_initiated_at` | TEXT NULL | When archiving review was initiated (status → 2 with flag) |
| `archived_at` | TEXT NULL | When the version was archived (status → 4) |
<!-- markdownlint-enable MD013 -->

## Statuses

| ID | Swedish    | English   |
|----|------------|-----------|
| 1  | Utkast     | Draft     |
| 2  | Granskning | Review    |
| 3  | Publicerad | Published |
| 4  | Arkiverad  | Archived  |

## When New Versions Are Created

New version rows are created **only** by these operations:

- **Creating a requirement** (`createRequirement`) — inserts v1
  as Draft.
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

Editing is **not allowed** when the current version is in Review
or Archived status. Review must first be moved back to Draft;
Archived must be restored (which creates a new Draft version).

## When `edited_at` Is Updated

`edited_at` is set **only** when user-initiated content fields
change:

- description
- acceptance criteria
- category, type, type category
- risk level
- scenarios
- requires-testing

`edited_at` is **never** updated by:

- Status transitions (`transitionStatus`)
- Archiving functions (`initiateArchiving`, `approveArchiving`, `cancelArchiving`)
- System-controlled date changes (`published_at`, `archived_at`, `archive_initiated_at`)

## Rules by Status

### Utkast (1) — Draft

- `created_at` — set at creation time.
- `edited_at` — set at creation time. Updated when content fields
  change. Must be **≥** `created_at`.
- `published_at` — always `NULL`.
- `archived_at` — always `NULL`.

### Granskning (2) — Review (publishing flow)

Reached via in-place transition from Draft. No new version row.
For the archiving-review path (Published → Review) see
[Archiving Review](#archiving-review-published--review) below.

- `created_at` — unchanged from Draft.
- `edited_at` — unchanged from Draft. **Not** updated by the
  status transition.
- `published_at` — `NULL` (not yet published).
- `archived_at` — always `NULL`.

### Publicerad (3) — Published

Reached via in-place transition from Review. No new version row.

- `created_at` — unchanged.
- `edited_at` — unchanged. **Not** updated by the status
  transition.
- `published_at` — set when the version transitions to Published.
  Must be **after** `edited_at`.
- `archive_initiated_at` — always `NULL`.
- `archived_at` — always `NULL`.

When a version is published and a previously published version of
the same requirement exists, the old version is automatically
archived: its `statusId` is set to 4 and `archived_at` is set to
the same timestamp as the new version's `published_at`.

### Archiving Review (Published → Review)

Reached via `initiateArchiving` from Published status. The
version status moves back to Review (2) with `archive_initiated_at`
set. This is an in-place update — no new version row is created.

- `created_at` — unchanged.
- `edited_at` — unchanged. **Not** updated by the operation.
- `published_at` — unchanged from when the version was published.
- `archive_initiated_at` — set when `initiateArchiving` is called.
- `archived_at` — always `NULL`.

From archiving review, there are two possible transitions:

- **`approveArchiving`**: sets `statusId` to 4 (Archived),
  sets `archived_at`, clears `archive_initiated_at` to `NULL`,
  and sets `requirements.is_archived` to `true`.
- **`cancelArchiving`**: returns `statusId` to 3 (Published),
  clears `archive_initiated_at` to `NULL`. `published_at`
  remains intact.

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
  Must be **after** `published_at`.

## Chronological Order

When all timestamps are present, they follow this order:

```text
created_at  ≤  edited_at  <  published_at  <  archive_initiated_at  <  archived_at
```

`created_at` and `edited_at` may be equal (both set at creation
time before any user edits).

## Rules Relative to Version Numbering

### Older version (previously published, now archived)

When a newer version is published, the older published version
is archived at the same time. The life cycles overlap:

```text
v(n):   created ── edited ── published ─ ─ ─ ─ ─ archived
                                   │                  ║
v(n+1):                      created ── edited ── published
```

- `v(n).archived_at` = `v(n+1).published_at`
  (same timestamp)

### Current published version

```text
created_at  ≤  edited_at  <  published_at
```

`archived_at` is `NULL`.

### Newer draft version

A draft being worked on after a version was published:

```text
v(n):   created ── edited ── published
                                   │
v(n+1):                      created ── edited
```

- `v(n+1).created_at` > `v(n).published_at`
- `v(n+1).created_at` ≤ `v(n+1).edited_at`
- `v(n+1).published_at` and `v(n+1).archived_at` are both
  `NULL`.

## Effective Status (Filtering)

When listing requirements the system computes an
**effective status** for each requirement using the
following priority order (highest priority first):

<!-- markdownlint-disable MD013 -->
| Priority | Condition | Effective Status |
| -------- | --------- | ---------------- |
| 1 | Any version has `requirement_status_id = 3` | Published |
| 2 | No Published version and `requirements.is_archived = true` | Archived |
| 3 | No Published, not archived, any version has `requirement_status_id = 2` | Review |
| 4 | Otherwise | Draft |
<!-- markdownlint-enable MD013 -->

Each filter option shows only requirements whose effective
status matches. This means:

- **Draft** — requirements that have **only** Draft
  versions and are not archived (`is_archived = false`).
- **Review** — requirements whose highest-priority status
  is Review, with `is_archived = false`.
- **Published** — requirements that have at least one
  Published version.
- **Archived** — requirements that are archived
  (`is_archived = true`) and have no Published version,
  even while a newer Draft or Review replacement version
  exists.

The effective status is a **query-time computation** (a SQL
`CASE` expression in `buildRequirementListConditions`). It
is not stored as a column.

## Deleting Draft Versions

A Draft version can **always** be deleted, regardless of whether
earlier versions exist. Deletion removes only that version row
(and its references/scenarios). Other versions are never changed.

If no versions remain after deletion, the requirement itself is
also deleted.

## UI Display

The version history pills show the relevant date per status:

| Status     | Date shown in pill |
|------------|--------------------|
| Utkast     | `edited_at`        |
| Granskning | —                  |
| Publicerad | `published_at`     |
| Arkiverad  | `archived_at`      |

## DAL Behavior

- **Creating a requirement** (`createRequirement`): Sets
  `created_at` and `edited_at` to the current time.
  `published_at` and `archived_at` are `NULL`.
- **Editing a requirement** (`editRequirement`): When the current
  version is Draft, updates the existing row in place with
  `edited_at` set to the current time. When the current version
  is Published, creates a new Draft version with `edited_at` set
  to the current time. **Not allowed** when the current version
  is in Review or Archived status.
- **Transitioning status** (`transitionStatus`): In-place
  `UPDATE` on the existing version row. Sets `statusId` to the
  target status. Sets `published_at` or `archived_at` when
  transitioning to Published or Archived respectively.
  **Never** touches `edited_at`. **Never** creates a new version
  row. When publishing, auto-archives any previously published
  version of the same requirement. For archived requirements
  with a pending Draft or Review replacement, `is_archived`
  stays `true` until that replacement version is published.
- **Initiating archiving** (`initiateArchiving`): In-place
  `UPDATE` on the existing version row. Sets `statusId` to
  Review and `archive_initiated_at` to the current time.
  **Never** touches `edited_at`. **Never** creates a new
  version row. Does **not** set `is_archived`.
- **Approving archiving** (`approveArchiving`): In-place
  `UPDATE` on the existing version row. Sets `statusId` to
  Archived and `archived_at` to the current time. Sets
  `is_archived = true`. **Never** touches `edited_at`.
  **Never** creates a new version row.
- **Cancelling archiving** (`cancelArchiving`): In-place
  `UPDATE` on the existing version row. Sets `statusId`
  back to Published and clears `archive_initiated_at`.
  **Never** touches `edited_at`. **Never** creates a new
  version row.
- **Restoring a version** (`restoreVersion`): Creates a new
  Draft copy of the selected historical version. If the
  requirement was archived, `is_archived` remains `true`
  until the restored replacement version is published.
