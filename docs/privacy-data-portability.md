# Privacy Data Portability

Kravhantering supports GDPR Article 20 data portability through a JSON export
for one registered HSA-ID. The JSON payload is the source of truth. PDF export
is a readable client-side rendering of the same payload.

## Entry Points

- Signed-in users can export their own data at `/{locale}/privacy`.
- Users with `PrivacyOfficer` can preview an HSA-ID in the Admin Center
  `Privacy` tab and export that preview target as JSON or PDF.
- The API route is `POST /api/privacy/data-subject-export`.

The request body is:

```json
{
  "delivery": "json",
  "target": { "hsaId": "SE2321000032-example" }
}
```

`target` is optional. When it is omitted, the server derives the subject from
the signed-in actor's verified session HSA-ID. A target matching the actor is
allowed. Exporting any other HSA-ID requires `PrivacyOfficer`.

## Export Schema

The route always returns JSON with `Cache-Control: no-store`. The current schema
version is `privacy-data-subject-export.v1`.

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

## Covered Sources

The collector reuses the privacy-erasure source registry so erasure preview and
data portability stay aligned for HSA-ID-backed fields. Current sources include:

- owners
- requirement versions
- deviations and specification-local deviations
- improvement suggestions
- requirement specification responsibility
- requirement-area and specification co-authors
- requirement-area and package owner references
- current auth session claims for self-export only

Matching is exact HSA-ID matching only. Names and email addresses are never used
to find a subject.

## Limits

Free-text fields are excluded because product policy tells users not to enter
person-identifying data there. Platform security-audit logs are operational logs
outside the application database and are documented as a limitation of this
export. Direct transfer to another controller is not implemented in this slice.

## Audit And Filenames

Successful export generation records
`privacy.data_subject_export.generated` with delivery, item count, source count,
and target fingerprint. Audit detail must not include the raw target HSA-ID.

Downloaded filenames use the target fingerprint and generation date rather than
the raw HSA-ID.

## API Contract Status

This route is intentionally kept out of the OpenAPI/Schemathesis contract for
now, aligned with the deferred privacy-route policy in
[api-security.md](./api-security.md). It should be added only when the contract
work includes privacy role-matrix checks, self-export behavior, no-store header
assertions, HSA-ID-only generated examples, and audit-redaction assertions.
