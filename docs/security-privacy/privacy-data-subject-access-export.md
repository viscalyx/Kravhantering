# Privacy Data Subject Access Export

This guide helps privacy officers assess the scope of a data subject access
export and API consumers request and interpret it. Kravhantering exports data
for one registered HSA-id.
The JSON payload is the source of truth and remains the machine-readable
format. PDF export returns a server-rendered report that presents the same
collected scope in plain Swedish or English for a person who wants to
understand how their personal data is used.

## Entry Points

- Signed-in users can export their own data at `/{locale}/privacy`.
- Users with `PrivacyOfficer` can preview an HSA-id in the Admin Center
  `Privacy` tab and export that preview target as JSON or PDF.
- The API route is `POST /api/privacy/data-subject-export`.

The request body is:

```json
{
  "delivery": "json",
  "locale": "sv",
  "target": { "hsaId": "SE5560000001-example" }
}
```

`target` is optional. When it is omitted, the server derives the subject from
the signed-in actor's verified session HSA-id. A target matching the actor is
allowed. Exporting any other HSA-id requires `PrivacyOfficer`. The optional
`locale` accepts `sv` or `en` and defaults to `sv`; it controls PDF language
and the filename. Requests require an authenticated human actor with HSA-id
and the normal mutation-route CSRF protection; see
[API security](./api-security.md).

## Export Schema

`delivery: "json"` returns JSON with attachment, exact `Content-Length`, and
`Cache-Control: no-store` headers; `delivery: "pdf"` returns
`application/pdf` with the same bounded-download headers. The current JSON
schema version is
`privacy-data-subject-export.v1`. The schema applies to JSON. The PDF is not a
second technical schema or a field-by-field dump; it is a localized readable
presentation of the collected data.

Top-level fields:

- `schemaVersion`
- `generatedAt`
- `subject` with the raw HSA-id and a non-reversible target fingerprint
- `generatedBy`
- `summary`
- `sources`
- `limitations`

Every exported item includes a stable source key, logical table/source, field
name, value, relation to the registered person, optional timestamp, and a safe
related-object reference where one is available.

## PDF Presentation

The PDF report hides raw database field names, table names, schema identifiers,
source keys, relation keys, and target fingerprints. It groups the collected
data into human-readable sections such as identity and contact details, active
assignments, co-authoring, historical traces, access reviews, action log
entries, and important limitations.

The report uses the requested locale. Swedish exports use plain Swedish labels
such as `Aktiva uppdrag`, `Kravområde`, `Skapad av`, `Ja` and `Nej`. English
exports use the corresponding English labels. Unknown technical values are not
printed raw in the PDF; the report points to the JSON export for
machine-readable details instead.

## Covered Sources

The collector reuses the privacy-erasure source registry so erasure preview and
data subject access export stay aligned for HSA-id-backed fields. Current
sources include:

- requirement versions
- deviations and specification-local deviations
- improvement suggestions
- specification lead
- requirement-area and specification co-authors
- requirement-area and package owner references
- local requirement responsibility person identity rows, including standalone
  rows until retention deletes them
- access review assignments and decisions, and action-log actor snapshots
- AI forensic capture-window actors and evidence actor metadata, excluding
  captured evidence content
- RFI assessment authors and agreement actors, described below
- current auth session claims for self-export only
- short-lived MCP import validation-session metadata and principal creation-rate
  metadata, matched by the exact keyed principal fingerprint
- short-lived HSA verification quota kind, count, and timestamps, matched by
  the exact keyed actor-subject or target fingerprint
- export and report actor-quota creation, release, and expiry timestamps,
  matched by the exact actor fingerprint

Matching uses HSA-id identity fields or fingerprints derived from HSA-id.
Names and email addresses are never used to find a subject. MCP sources derive
the same purpose-separated keyed HMAC used
at session creation and never query those tables with raw HSA-id. They export
only destination kind, reserved bytes, aggregate successful creations and
timestamps; tokens/hashes, payloads, validation/execution JSON, destination
IDs/names, session/row IDs and issue arrays are excluded.

HSA verification quota sources derive the same purpose-separated target
fingerprint as verification. They match rows where the person is the actor or
target, but export only bucket kind, consumed count, window start, and expiry.
The other party's fingerprint and the complete actor-context fingerprint are
never exported.

## Limits

Both delivery modes apply the shared export and report actor quota before
collection, then check server capacity. One aggregate item limit covers session
claims and all database sources. Exceeding a limit rejects the complete export;
the service does not return a truncated collection.

JSON uses the Admin Center CSV/structured-export item, file-size, timeout, and
per-node concurrency settings. PDF uses the PDF item, file-size, timeout,
concurrency, and worker-memory settings. Files finish generation before download
headers are returned. Browser JSON downloads include a UTF-8 BOM; API JSON is
BOM-free.

API consumers should handle these failures:

- `422 output_limit_exceeded`: the item or file-size limit is exceeded.
- `429 actor_rate_limit` or `capacity_busy`: wait for the response's
  `Retry-After` interval before retrying.
- `429 actor_concurrency_limit`: finish or cancel an active export or report
  before retrying.
- `503`: generation timed out, the PDF worker failed or exhausted memory,
  temporary storage is unavailable, or the actor quota cannot be checked.

## Export Limitations

Free text is not scanned to discover a subject. Selected contextual text,
including an RFI assessment reason, can still appear in a record matched by
its actor HSA-id. Platform security-audit logs are operational logs
outside the application database and are documented as a limitation of this
export. Database action-audit actor snapshots are included through
`action_audit_events.actor`, but raw audit details and action-audit client IP
values are not exported. Direct transfer to another controller is not
implemented. Session claims are available only for self-export; an officer
exporting another person’s data cannot retrieve that person’s browser session.

## Security Log And Filenames

Successful export generation records a security-log event,
`privacy.data_subject_export.generated` with delivery, item count, source count,
and target fingerprint. The event detail excludes the raw target HSA-id.

Downloaded filenames use the target fingerprint and generation date rather than
the raw HSA-id.

## RFI assessment authors

The explicit source `specification_rfi_assessments.created_by` matches the
assessment author's HSA-id. It exports that author's identity snapshot,
assessment outcome, reason, document reference, link and timestamp, with the
specification code and question version as context. Duplicate display names do
not match another person's records. Free text mentioning other people is not
automatically discovered.

## Agreement actors

Register extracts include agreement creation, confirmation, cancellation and end
actors, binding creation actors, and actors who authorize or cancel deviation
ending plans. Each source matches the exact HSA identity and references the
stored business record. Correction actors are exported from their own retained
business history, separately from the action log. The extract contains actor
HSA-id and display-name snapshots with a reference to the business record; it
does not export the agreement content.
Generating an extract does not anonymize or delete the source records.
