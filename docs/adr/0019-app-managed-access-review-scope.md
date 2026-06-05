# App-Managed Access Review Scope

Status: Accepted on 2026-06-05.

Kravhantering's in-app `Behörighetsöversyn` covers the authorization
assignments the application owns and can snapshot: requirement-area owners,
requirement-area co-authors, specification leads, specification co-authors and
assignment-bound AI-assisted authoring permissions. Each review run stores a
point-in-time evidence snapshot, so later assignment changes do not rewrite
what was reviewed.

Global IdP roles such as `Admin`, `Reviewer` and `PrivacyOfficer`, source-code
repository access, platform permissions and externally provisioned MCP or
client access remain reviewed in the systems where those permissions are
assigned. Kravhantering may record an external evidence reference for those
reviews, but it does not pretend that an in-app review is authoritative for
permissions the application does not own.

## Considered Options

- Review every permission inside Kravhantering: rejected because IdP roles,
  repository access, platform permissions and external client access are not
  assigned by Kravhantering and cannot be authoritatively inventoried there.
- Review only global IdP roles: rejected because app-owned assignments and
  assignment-bound AI permissions need resource-context review inside
  Kravhantering.
- Recompute historical review evidence from live assignments: rejected because
  `Behörighetsöversyn` must preserve what was actually reviewed at the time.
