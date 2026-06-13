<!-- cSpell:words AUTHZ specco -->

# Fas 5: Kravunderlagsmedförfattare

Companion for
[`05-specification-coauthor.spec.ts`](05-specification-coauthor.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirements specification and assign
   `signe.speccoauthor` as kravunderlagsmedförfattare.
1. Sign in as `signe.speccoauthor`.
1. Read the specification and verify content editing and AI use are allowed.
1. Update a safe content metadata field.
1. Verify the co-author cannot change the co-author list.
1. Verify the co-author cannot change the kravunderlagsansvarig.
