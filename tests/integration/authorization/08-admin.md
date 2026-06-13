<!-- cSpell:words AUTHZ -->

# Fas 8: Admin

Companion for [`08-admin.spec.ts`](08-admin.spec.ts).

Manual cases: `AUTH-06`, `AUTH-10`, `AUTH-11`.

## Flow

1. Sign in as `only.admin`.
1. Verify action-log reads and broad requirements specification reads are
   allowed.
1. Verify PrivacyOfficer-only erasure preview returns 403.
1. Verify Reviewer-only requirement lifecycle decisions return 403.
1. Verify Admin Center enables `Identitet`, `Behörighetsöversyn`, and
   `Åtgärdslogg`, while `Arkivering` and `Dataskydd` are disabled.
