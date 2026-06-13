# Fas 10: PrivacyOfficer

Companion for [`10-privacy-officer.spec.ts`](10-privacy-officer.spec.ts).

Manual cases: `AUTH-07`, `AUTH-11`.

## Flow

1. Sign in as `disa.privacy`.
1. Verify access-review and privacy erasure preview APIs are allowed.
1. Verify the Admin-only action log returns 403.
1. Verify Admin Center enables `Behörighetsöversyn`, `Arkivering`, and
   `Dataskydd`, while `Identitet` and `Åtgärdslogg` are disabled.
