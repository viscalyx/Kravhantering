# Functional Archiving And Retention Disposal

Status: Accepted on 2026-06-05.

Kravhantering separates functional `Arkivering` from retention-driven
`Gallring`. Functional archiving decides whether a requirement version,
selection question, answer or related business object remains actively usable;
retention decides what information may remain in active Kravhantering, when it
may be disposed of, and whether an `Arkivexport` is required before disposal.

Retention decisions are made per information asset, using business criteria
such as lifecycle or status age, active references, kravunderlag history, legal
hold and operational exceptions. Personal data erasure and data subject access
export remain separate privacy workflows, even when the same information
categories contain personal data.

The architecture therefore records the policy boundaries, eligibility criteria
and blockers for gallring, while preview, export confirmation, deletion
mechanics and admin presentation are implementation details.

## Considered Options

- Treat lifecycle archive as deletion eligibility: rejected because archived
  requirements and requirement versions can still be needed for traceability.
- Use one retention rule for all data: rejected because requirement library
  content, specifications, access reviews, owners, taxonomy and audit evidence
  have different business-history needs.
- Mix personal data erasure with retention disposal: rejected because
  data-subject rights and business-retention policy have different mandates,
  triggers and evidence requirements.
