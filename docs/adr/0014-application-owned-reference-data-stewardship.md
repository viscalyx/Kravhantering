# Application-Owned Reference Data Stewardship

Status: Accepted on 2026-06-05.

Kravhantering owns the `Referensdata` that shapes requirement work inside the
application. This includes requirement areas, categories, types, quality
characteristics, risk levels, lifecycle and usage statuses, governance object
types, implementation types, norm-reference records, requirement packages and
requirement-selection questions.

These catalogs are administered inside Kravhantering because they directly
affect requirement classification, filtering, selection, reporting, AI prompt
context and stewardship workflows. Some catalogs are Admin Center
responsibilities, while requirement packages and selection questions live in
requirements-library stewardship because package leads and requirement-area
stewards must be able to maintain them without broad administration access.

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
