<!-- cSpell:words AUTHZ noroles -->

# Fas 1: Autentiserad användare utan globala roller och utan uppdrag

Companion for
[`01-no-global-roles-no-assignments.spec.ts`](01-no-global-roles-no-assignments.spec.ts).

Manual cases: `AUTH-03`, `AUTH-08`, `AUTH-10`, `AUTH-11`, `REQ-10`,
`LIFE-11`, `SPEC-10`.

## Flow

1. Create an isolated authorization fixture.
1. Verify anonymous API access to `/api/requirements-specifications` returns
   JSON 401.
1. Sign in as `noah.noroles`.
1. Verify `/api/auth/me` has no roles.
1. Verify published requirements are readable.
1. Verify a published requirement detail response projects no lifecycle or
   mutation permissions for the unassigned user.
1. Verify the requirements specification list is empty for an unassigned user.
1. Verify direct access to an existing unassigned specification returns 403 and
   a missing specification returns 404.
1. Verify the published requirement list PDF remains available and returns a
   PDF response for an ordinary authenticated user.
1. Verify requirement history, review, suggestion-history, and combined review
   PDF routes return 403 when the actor lacks requirement history access.
1. Verify an unassigned specification profile PDF route returns 403 before
   exposing report data.
1. Verify Admin-only action-log and unauthorized AI model, credit, and
   generation requests return 403 before provider access.
1. Verify the forbidden specification UI shows safe denial details on mobile
   and desktop without exposing content actions.
1. Verify the published requirement detail UI shows the read-only notice, hides
   lifecycle mutation controls, and keeps non-mutating sharing available.
