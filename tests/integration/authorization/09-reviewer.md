# Fas 9: Reviewer

Companion for [`09-reviewer.spec.ts`](09-reviewer.spec.ts).

Manual cases: `AUTH-10`, `AUTH-11`.

## Flow

1. Sign in as `rita.reviewer`.
1. Verify the user can read requirements specifications broadly.
1. Verify access-review Admin Center APIs return 403.
1. Verify the Admin-only action log returns 403.
