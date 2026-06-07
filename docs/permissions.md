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
