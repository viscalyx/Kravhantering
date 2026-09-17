# Dogfood seed: Kravhantering för Kravhantering

This document describes the dogfood dataset that is appended to the optional
demo seed profile in `typeorm/seed.mjs`. The required production seed profile
lives separately in `typeorm/seed-required.mjs` and does not import this
dataset. The dogfood dataset captures the Krav that the Kravhantering
application places on itself — technical, functional, UX, deployment and
development requirements — and the two Kravunderlag that group them.

To load the dataset into a development database, follow the
[SQL Server developer workflow](sql-server-developer-workflow.md) and run
`npm run db:seed:demo` after migrations. This command clears non-required
data before loading the complete demo profile, including dogfood; it is not
an additive import into an existing working dataset.

## Kravunderlag

### `KH` — Kravhantering (lifecycle: Utveckling)

The main specification contains all 59 Krav from the dogfood inventory. Most
items are seeded as **Verifierad**, some as **Implementerad**, and one as
**Pågående**. These are fixture statuses, not live verification results.

### `KH-INFOR` — Kravhantering kontrollerat införande (lifecycle: Införande)

A smaller curated subset (17 Krav) that demonstrates the *Införande*
lifecycle. All items default to **Inkluderad**. Two specification-local
requirements sit on top of this specification to demonstrate controlled-introduction
divergence from the shared Krav (one **Avviken**, one **Pågående**). They reuse
the originating Krav's category/type/quality-characteristic and append
test and development-specific text to the description and acceptance criteria.
They do not receive a requirement area; ownership stays in the specification
context.

## Additional fixtures appended by the builder

The demo profile also includes requirement-selection questions, conditional
visibility rules, and saved answers. Use these to exercise current and
historical answers and answers that select no requirements.

Manual-case automation fixtures cover lifecycle, reports, traceability and
CSV export scenarios. They are separate from the core dogfood requirements;
use `PWT_MANUAL_SEED` from
[typeorm/seed-playwright-manual-cases-build.mjs](../../typeorm/seed-playwright-manual-cases-build.mjs)
when locating them in tests.

## Maintaining the dataset

Edit the inventory in
[typeorm/seed-dogfood.mjs](../../typeorm/seed-dogfood.mjs): requirement areas,
person fixtures, norm references, packages, requirements and specifications.
The core requirements are seeded as version 1 with status **Publicerad**.
Norm references are optional and added only where a Krav maps to an applicable
law, standard or framework.

Use the ID constants in that module and check the complete `SEED_DATA` in
[typeorm/seed.mjs](../../typeorm/seed.mjs) before allocating new fixture IDs.
Other demo builders add rows too. Person fixture IDs are inventory keys;
area and package ownership is resolved to HSA-id values by the builder.

The builder
[typeorm/seed-dogfood-build.mjs](../../typeorm/seed-dogfood-build.mjs)
allocates Krav-ID values from each area's `next_sequence` and advances the
sequence for subsequent requirements. Entries in `DOGFOOD_KH_INFOR_INDEXES`
and `DOGFOOD_SPECIFICATION_LOCALS` refer to zero-based `DOGFOOD_KRAV` indexes;
update those references if you reorder or remove requirements.

Call `appendDogfoodSeed` exactly once per `SEED_DATA` object, as `seed.mjs`
does. Some lookup inserts guard against duplicate keys, but requirements,
versions and specification rows are appended unconditionally, and area
sequences advance again on a second call. To reload database fixtures, use
the demo seed command and account for its reset behavior described above.

Validate inventory and builder changes with the focused unit suite:

```bash
npx vitest run tests/unit/dogfood-seed.test.ts
```
