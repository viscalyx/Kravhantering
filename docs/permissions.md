# Permissions

This page explains which roles let you use sensitive parts of Kravhantering.
It is written for people who use or support the service.

## Roles

Your organization gives roles to your user account. A role decides what kind
of work you can do in Kravhantering. If you need a role that you do not have,
contact your local administrator or identity support contact.

Being listed as an owner, author, reviewer, or contact person inside
Kravhantering is not the same as having one of these account roles.

| Role | What it lets you do |
| --- | --- |
| `Admin` | Manage shared administration and review the action log. |
| `PrivacyOfficer` | Work with privacy, archiving, and access reviews. |
| `Reviewer` | Take part in review work; no privileged Admin Center tabs. |

## Assignment-Based Permissions

Kravhantering also uses HSA-id based assignments that belong to a specific
resource. These assignments are different from account roles. They decide who
can change a requirement area, requirement package, or requirements
specification.

<!-- markdownlint-disable MD013 -->
| Assignment | Scope | What it controls |
| --- | --- | --- |
| Requirement area owner | One requirement area | Main responsibility for requirements and selection questions in that area. |
| Requirement area co-author | One requirement area | Authoring support for requirements and selection questions in that area. |
| Specification lead | One requirements specification | Main responsibility for the specification and its local content. |
| Specification co-author | One requirements specification | Authoring support for the specification and its local content. |
<!-- markdownlint-enable MD013 -->

## Requirement Specifications

A requirements specification is controlled by its own specification
assignments, not by the requirement areas whose requirements are used in the
specification.

The specification lead, specification co-authors, and `Admin` can change the
specification content. This includes metadata, needs references, requirement
selection answers, adding or removing published library requirements,
specification-local requirements, and deviations. Separate decision steps can
still require another role, such as `Reviewer` for review decisions.

A requirement area owner or requirement area co-author does not automatically
get write access to a specification just because the specification uses
requirements from that area. If that person should help change a specific
specification, the specification lead or an administrator must add them as a
specification co-author.

Specification co-authors can change specification content, but they cannot
delegate access. Only the specification lead and `Admin` can change the
specification lead or manage specification co-authors.

## Library Requirements In Specifications

Users who can change a specification can add published library requirements
from any requirement area. Adding a published library requirement records that
the requirement is used in the specification; it does not change the library
requirement or the requirement area.

When a specification-local requirement is promoted to the Requirements
Library, the actor needs permission in both places:

- specification lead, specification co-author, or `Admin` access to the source
  specification
- requirement area owner, requirement area co-author, or `Admin` access to the
  target requirement area

Requirement area assignments do not grant full read access to every
specification where the area's requirements are used. Usage can be exposed
through reports, statistics, or requirement traceability without exposing the
whole specification context.

This assignment policy is the target for the remaining RBAC rollout. Some
routes already use assignment checks, and the remaining API, MCP, report, and
UI enforcement work is tracked in
[issue #270](https://github.com/viscalyx/Kravhantering/issues/270).

## Admin Center

The Admin Center shows privileged tabs even when you cannot use them. Tabs
that you cannot use are dimmed and cannot be selected. This makes it clear
that the function exists and which role is needed.

| Tab | Who can use it |
| --- | --- |
| Kolumner | Users who can open the Admin Center. |
| Taxonomi | Users who can open the Admin Center. |
| Statusar och arbetsflöden | Users who can open the Admin Center. |
| Behörighetsöversyn | Users with `Admin` or `PrivacyOfficer`. |
| Arkivering | Users with `PrivacyOfficer`. |
| Dataskydd | Users with `PrivacyOfficer`. |
| Åtgärdslogg | Users with `Admin`. |

## Dimmed Tabs

When a tab is dimmed, your account does not currently have the role needed for
that work. A short message explains which role is required. Selecting the tab
does not change the page.

If someone sends you a direct link to a tab that you cannot use, Kravhantering
opens the Admin Center on a tab you are allowed to see instead.

## Access Review

`Behörighetsöversyn` is available only to users with `Admin` or
`PrivacyOfficer`. Being assigned as a reviewer is not enough on its own.

This means a user who only has `Reviewer` can still take part in ordinary
review work, but cannot open or decide access reviews in the Admin Center.

## Privacy Work

`Dataskydd` and `Arkivering` are available to users with `PrivacyOfficer`.
These areas can include sensitive personal data work, so Kravhantering checks
the role again when the user previews, exports, saves, or performs an action.

The dimmed tab is therefore only a helpful signpost. The service still stops
the action if the required role is missing.
