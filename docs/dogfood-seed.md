# Dogfood seed: Kravhantering för Kravhantering

This document describes the dogfood dataset that is appended to the base seed
in `typeorm/seed.mjs`. The dataset captures the Krav that the Kravhantering
application places on itself — technical, functional, UX, deployment and
development requirements — and the two Kravpaket that group them.

The data lives in two pure ES modules:

- [typeorm/seed-dogfood.mjs](../typeorm/seed-dogfood.mjs) — inventory: areas,
  owners, norm references, usage scenarios and the `DOGFOOD_KRAV` list.
- [typeorm/seed-dogfood-build.mjs](../typeorm/seed-dogfood-build.mjs) — the
  builder `appendDogfoodSeed(SEED_DATA)` that mutates the base `SEED_DATA`
  shape (`{ table: { columns, rows } }`) in place. `seed.mjs` calls it once at
  module top-level, so the runtime in `seedDatabase()` does not need any
  changes.

Unit coverage lives in
[tests/unit/dogfood-seed.test.ts](../tests/unit/dogfood-seed.test.ts).

## ID ranges

To avoid colliding with the base seed, the dogfood module reserves these
ranges:

| Entity                       | Base IDs | Dogfood IDs              |
| ---------------------------- | -------- | ------------------------ |
| `owners`                     | 1–3      | 1001–1005                |
| `requirement_areas`          | 1–10     | 1001–1006 (new)          |
| `norm_references`            | 1–6      | 1001–1006                |
| `usage_scenarios`            | 1–3      | 1001–1012                |
| `requirement_packages`       | 1–10     | 1001 (KH), 1002 (KH-POC) |
| `package_needs_references`   | 1–23     | 1001–1006                |
| `package_local_requirements` | 1–2      | 1001–1002                |
| `requirements`               | 1–367    | 10001–10059              |
| `requirement_versions`       | 1–~498   | 10001–10059              |
| `requirement_package_items`  | 1–~38    | 10001+                   |

Existing `requirement_areas.next_sequence` is bumped by the number of dogfood
Krav added to that area, so newly minted `unique_id` values continue without
gaps (e.g. `INT0040`, `SÄK0042`, `ANV0038` …).

## Areas

Existing areas (INT, SÄK, PRE, ANV, LAG, BEH, IDN, LOG, DRF, DAT) are reused
where the krav fit. Six new areas are introduced for dimensions the base seed
does not cover:

| Prefix | Name                | Owner             |
| ------ | ------------------- | ----------------- |
| TIL    | Tillgänglighet      | Linnéa Bergström  |
| KVA    | Kvalitetssäkring    | Emma Lindqvist    |
| SPR    | Språkstöd           | Linnéa Bergström  |
| RAP    | Rapportering        | Sara Holm         |
| UTV    | Utvecklingsmiljö    | Oscar Nilsson     |
| ARK    | Arkitektur          | Sara Holm         |

## Krav inventory

`DOGFOOD_KRAV` contains 59 Krav, each anchored to a real file or feature in
the repository (e.g. `app/api/mcp/route.ts`, `lib/dal/`, `scripts/dev-curl.sh`,
`docker-compose.sqlserver.yml`, `.github/instructions/`). All Krav are stored
as version 1 with status **Publicerad**. Distribution per area:

| Area | Krav |
| ---- | ---- |
| ARK  | 4    |
| INT  | 5    |
| SÄK  | 5    |
| IDN  | 3    |
| BEH  | 3    |
| PRE  | 3    |
| ANV  | 5    |
| TIL  | 3    |
| LAG  | 3    |
| LOG  | 3    |
| DRF  | 5    |
| DAT  | 4    |
| KVA  | 5    |
| SPR  | 2    |
| RAP  | 3    |
| UTV  | 3    |

Every Krav fills `description`, `acceptance_criteria`, `verification_method`,
`requirement_category_id`, `requirement_type_id`, `quality_characteristic_id`,
`risk_level_id`, `is_testing_required`, and at least one usage scenario. Norm
references are optional and added only where a Krav maps to an applicable law,
standard or framework.

## Kravpaket

### `KH` — Kravhantering (lifecycle: Utveckling)

The main package containing all 59 Krav from the dogfood inventory. Each item
gets a status that reflects current implementation: most are **Verifierad**,
some **Implementerad**, and a few that describe newer features remain
**Pågående**.

### `KH-POC` — Kravhantering PoC införande (lifecycle: Införande)

A smaller curated subset (17 Krav) that demonstrates the *Införande*
lifecycle. All items default to **Inkluderad**. Two `package_local_requirements`
sit on top of this package to demonstrate PoC-specific divergence from the
shared Krav (one **Avviken**, one **Pågående**). They reuse the originating
Krav's category/type/quality-characteristic and append PoC-specific text to
the description and acceptance criteria.

## How it is wired in

`typeorm/seed.mjs` ends its literal `SEED_DATA` declaration and immediately
calls:

```js
const { appendDogfoodSeed } = await import('./seed-dogfood-build.mjs')
appendDogfoodSeed(SEED_DATA)
```

The mutation happens before `seedDatabase()` is exported, so the existing
runtime in `scripts/db-sqlserver-admin.mjs` picks up the augmented dataset
without any further changes. Re-running `appendDogfoodSeed` on the same
`SEED_DATA` object is idempotent for primary-keyed lookup tables, but the
function is intended to run exactly once (which is what `seed.mjs` does).
