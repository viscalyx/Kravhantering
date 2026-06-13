<!-- cSpell:words AUTHZ specresp -->

# Fas 4: Kravunderlagsansvarig

Companion for
[`04-specification-responsible.spec.ts`](04-specification-responsible.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirements specification owned by `petra.specresp`.
1. Sign in as `petra.specresp`.
1. Read the specification and verify `canEditContent`,
   `canManageAssignments`, and `canUseAi`.
1. Update a safe metadata field.
1. Read the specification co-author list.
