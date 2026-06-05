# Current Authorization Boundaries Before RBAC

Status: Accepted on 2026-06-05.

Kravhantering currently authorizes from the verified actor context described in
ADR 0007, using canonical IdP roles such as `Admin`, `Reviewer` and
`PrivacyOfficer`, plus HSA-ID matching where a workflow has an assigned actor.
`Admin` gates Admin Center and reference-data mutations, `PrivacyOfficer` gates
privacy and retention workflows, and access-review runs are managed by Admins
while assigned reviewers may decide their own review items by verified HSA-ID.

Requirement-library, requirement-specification, deviation, suggestion, report
and live AI-assisted authoring authorization is intentionally not documented
here as a finished assignment-based RBAC model. Those workflows have an
authorization service boundary and some route-level authentication or role
gates today, but
resource-scoped fail-closed decisions based on requirement-area ownership,
co-author assignments, specification responsibility, specification co-authors
and AI permission flags remain planned in
[issue #270](https://github.com/viscalyx/Kravhantering/issues/270).

When issue #270 is implemented, this ADR should either be superseded by a new
assignment-based authorization ADR or updated if the implemented policy is a
direct refinement of this current-state boundary.

## Considered Options

- Document the issue #270 target matrix as current architecture: rejected
  because it would overstate what the running application enforces today.
- Freeze the final RBAC policy in this ADR: rejected because issue #270 still
  tracks open implementation choices around owner lifecycle, selection-question
  stewardship, report visibility, MCP enforcement and live AI-assisted
  authoring.
- Leave authorization undocumented until RBAC is complete: rejected because
  the present boundary is security-relevant and easy to misunderstand.
