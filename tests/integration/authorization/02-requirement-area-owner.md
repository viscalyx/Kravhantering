<!-- cSpell:words AUTHZ -->

# Fas 2: Kravområdesägare

Companion for
[`02-requirement-area-owner.spec.ts`](02-requirement-area-owner.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Create an isolated requirement area owned by `olle.areaowner`.
1. Sign in as `olle.areaowner`.
1. Update requirement-area metadata.
1. Open the separate co-author management modal and verify the assigned
   co-author is listed.
1. Read the requirement area's co-author list.
1. Verify the same user cannot read the Admin-only action log.
