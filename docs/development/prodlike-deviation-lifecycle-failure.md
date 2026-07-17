# Prodlike Deviation Lifecycle Failures

## `tests/integration/deviations/lifecycle.spec.ts`

### Status

The specification-local deviation lifecycle is blocked by two production
defects. The library-requirement lifecycle cases pass after correcting their
expected validation status from HTTP 409 to HTTP 400.

### Command

```bash
npm run test:integration:prodlike -- --chunk prodlike-deviations
```

### Failure evidence

The specification-local draft is created and displayed with its motivation and
the pending `Väntande` pill, but the detail pane has no
`Steg i avstegsarbetsflödet` group and therefore no active `Utkast` step.

The same local workflow is also unable to request review or record a decision
when a library deviation has the same numeric identity. The local endpoint
returns HTTP 400:

```text
Ambiguous deviation target
```

The authorization lookup queries both `deviations` and
`specification_local_requirement_deviations` by the unqualified numeric ID. It
rejects the request when both tables contain that ID, even though the
`/api/specification-local-deviations/...` route already identifies the target
kind. The seeded and runtime-created identities make this collision
deterministic in the prodlike deviations chunk.

### Suspected production files and symbols

- `components/SpecificationLocalRequirementDetailClient.tsx`
  - `deviationStep`
  - specification-local detail rendering around `DeviationPill`
- `lib/requirements/assignment-authorization.ts`
  - `SqlRequirementsAssignmentLookup.resolveDeviationTarget`
  - `RequirementsAssignmentAuthorizer.assertCanManageDeviation`
- `app/api/specification-local-deviations/[id]/request-review/route.ts`
  - `requirementsMutationPolicy`
- `app/api/specification-local-deviations/[id]/decision/route.ts`
  - `requirementsMutationPolicy`
- Other specification-local deviation mutation routes that authorize only by
  numeric `deviationId`

### Required behavior changes

Render `DeviationStepper` for specification-local requirements using the
existing `deviationStep`, matching the documented three-stage workflow:
`Utkast` → `Granskning begärd` → `Beslutad`.

Make deviation authorization preserve the route's target kind. A
specification-local route must resolve its ID only in
`specification_local_requirement_deviations`, while a library route must
resolve only in `deviations`. Equal numeric IDs in the independent tables must
not make either legitimate target ambiguous. Keep the existing role and
specification-assignment checks unchanged.

### Blocked checks

- Mobile specification-local approval in
  `tests/integration/deviations/lifecycle.spec.ts`, blocked first by the missing
  workflow stepper and then by ambiguous mutation authorization.
- Desktop specification-local approval in the same file, blocked during
  cleanup by ambiguous mutation authorization.
- `npm run test:integration:prodlike -- --chunk prodlike-deviations`
- The selected full prodlike suite, because its deviations chunk cannot pass.
