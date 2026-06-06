# Application-Owned Reference Data Boundaries

Status: Accepted on 2026-06-05.

Kravhantering owns the `Referensdata` that shapes requirement work inside the
application. This includes requirement areas, categories, types, quality
characteristics, risk levels, requirement version statuses, usage statuses,
specification lifecycle statuses, specification item statuses, governance
object types, implementation types and norm-reference records.

These catalogs are administered inside Kravhantering because they directly
affect requirement classification, filtering, reporting, AI prompt context and
stewardship workflows. They are reachable through Admin Center as a curated
navigation surface for application-owned lookup and taxonomy rows.

Requirement-area ownership is stored directly on each requirement area as the
owner's HSA-ID. It is an operational responsibility assignment, not a standalone
reference-data catalog and not an in-app personnel record.

Requirement packages and requirement-selection questions are
requirements-library stewardship content, not Admin Center reference data. They
support selection and filtering, but package leads and requirement-area stewards
must be able to maintain them without broad administration access.

Kravhantering does not treat external IdP roles, platform logs, source legal
texts, organizational personnel master data or formal information ownership as
application-owned reference data. The app may store local references,
snapshots, labels, ordering, icons and assignments for its workflows, but those
records do not replace the external source of authority.

## Considered Options

- Keep all reference data in seed files only: rejected because stewards and
  administrators need to adjust classification and selection support without a
  deployment.
- Treat all surrounding organizational data as in-app reference data: rejected
  because identity, platform logging, personnel data and formal ownership have
  external owners and governance processes.
- Put every catalog behind Admin-only CRUD: rejected because requirement
  packages and selection questions are part of requirements-library
  stewardship, not generic system administration.
