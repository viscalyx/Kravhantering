# Privacy Data Subject Access Export

Kravhantering supports data subject access export for one registered HSA-ID.
The JSON payload is the source of truth and remains the machine-readable
format. PDF export returns a server-rendered report that presents the same
collected scope in plain Swedish or English for a person who wants to
understand how their personal data is used.

## Entry Points

- Signed-in users can export their own data at `/{locale}/privacy`.
- Users with `PrivacyOfficer` can preview an HSA-ID in the Admin Center
  `Privacy` tab and export that preview target as JSON or PDF.
- The API route is `POST /api/privacy/data-subject-export`.

The request body is:

```json
{
  "delivery": "json",
  "target": { "hsaId": "SE5560000001-example" }
}
```

`target` is optional. When it is omitted, the server derives the subject from
the signed-in actor's verified session HSA-ID. A target matching the actor is
allowed. Exporting any other HSA-ID requires `PrivacyOfficer`.

## Export Schema

`delivery: "json"` returns JSON with `Cache-Control: no-store`;
`delivery: "pdf"` returns `application/pdf` with attachment headers and
`Cache-Control: no-store`. The current JSON schema version is
`privacy-data-subject-export.v1`. The schema applies to JSON. The PDF is not a
second technical schema or a field-by-field dump; it is a localized readable
presentation of the collected data.

Top-level fields:

- `schemaVersion`
- `generatedAt`
- `subject` with the raw HSA-ID and a non-reversible target fingerprint
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
assignments, co-authoring and AI access, historical traces, access reviews,
action log entries, and important limitations.

The report uses the requested locale. Swedish exports use plain Swedish labels
such as `Aktiva uppdrag`, `Kravområde`, `Skapad av`, `Ja` and `Nej`. English
exports use the corresponding English labels. Unknown technical values are not
printed raw in the PDF; the report points to the JSON export for
machine-readable details instead.

## Covered Sources

The collector reuses the privacy-erasure source registry so erasure preview and
data subject access export stay aligned for HSA-ID-backed fields. Current
sources include:

- owners
- requirement versions
- deviations and specification-local deviations
- improvement suggestions
- specification lead
- requirement-area and specification co-authors
- requirement-area and package owner references
- current auth session claims for self-export only

Matching is exact HSA-ID matching only. Names and email addresses are never used
to find a subject.

## Limits

Free-text fields are excluded because product policy tells users not to enter
person-identifying data there. Platform security-audit logs are operational logs
outside the application database and are documented as a limitation of this
export. Database action-audit actor snapshots are included through
`action_audit_events.actor`, but raw audit details and action-audit client IP
values are not exported. Direct transfer to another controller is not
implemented in this slice.

## Action Log And Filenames

Successful export generation records
`privacy.data_subject_export.generated` with delivery, item count, source count,
and target fingerprint. Action-log detail must not include the raw target HSA-ID.

Downloaded filenames use the target fingerprint and generation date rather than
the raw HSA-ID.

## API Contract Status

This route is intentionally kept out of the OpenAPI/Schemathesis contract for
now, aligned with the deferred privacy-route policy in
[api-security.md](./api-security.md). It should be added only when the contract
work includes privacy role-matrix checks, self-export behavior, no-store header
assertions, HSA-ID-only generated examples, and audit-redaction assertions.
