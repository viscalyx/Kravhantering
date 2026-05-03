import { describe, expect, it } from 'vitest'
import {
  AREA_PREFIX_BY_ID,
  DOGFOOD_AREAS,
  DOGFOOD_KH_POC_INDEXES,
  DOGFOOD_KRAV,
  DOGFOOD_NORMS,
  DOGFOOD_OWNERS,
  DOGFOOD_PACKAGE_LOCALS,
  DOGFOOD_PACKAGES,
  DOGFOOD_SCENARIOS,
  ID,
  PKG_KH,
  PKG_KH_POC,
} from '../../typeorm/seed-dogfood.mjs'
import { appendDogfoodSeed } from '../../typeorm/seed-dogfood-build.mjs'

function emptySeed() {
  return {
    owners: {
      columns: [
        'id',
        'first_name',
        'last_name',
        'email',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    norm_references: {
      columns: [
        'id',
        'norm_reference_id',
        'name',
        'type',
        'reference',
        'version',
        'issuer',
        'created_at',
        'updated_at',
        'uri',
      ],
      pk: ['id'],
      rows: [],
    },
    usage_scenarios: {
      columns: [
        'id',
        'name_sv',
        'name_en',
        'description_sv',
        'description_en',
        'owner_id',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_areas: {
      columns: [
        'id',
        'prefix',
        'name',
        'description',
        'owner_id',
        'next_sequence',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [
        [1, 'INT', 'Integration', 'desc', 1, 39, 't', 't'],
        [2, 'SÄK', 'Säkerhet', 'desc', 2, 41, 't', 't'],
        [3, 'PRE', 'Prestanda', 'desc', 1, 38, 't', 't'],
        [4, 'ANV', 'Användbarhet', 'desc', 3, 37, 't', 't'],
        [5, 'LAG', 'Lagring', 'desc', 1, 38, 't', 't'],
        [6, 'BEH', 'Behörighet', 'desc', 2, 37, 't', 't'],
        [7, 'IDN', 'Identitet', 'desc', 2, 37, 't', 't'],
        [8, 'LOG', 'Loggning', 'desc', 1, 38, 't', 't'],
        [9, 'DRF', 'Drift', 'desc', 3, 36, 't', 't'],
        [10, 'DAT', 'Data', 'desc', 1, 36, 't', 't'],
      ],
    },
    requirements: {
      columns: [
        'id',
        'unique_id',
        'requirement_area_id',
        'sequence_number',
        'is_archived',
        'created_at',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_versions: {
      columns: [
        'id',
        'requirement_id',
        'version_number',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'requirement_status_id',
        'is_testing_required',
        'verification_method',
        'created_at',
        'edited_at',
        'published_at',
        'archived_at',
        'created_by',
        'archive_initiated_at',
        'risk_level_id',
      ],
      pk: ['id'],
      rows: [],
    },
    requirement_version_norm_references: {
      columns: ['requirement_version_id', 'norm_reference_id'],
      pk: ['requirement_version_id', 'norm_reference_id'],
      rows: [],
    },
    requirement_version_usage_scenarios: {
      columns: ['requirement_version_id', 'usage_scenario_id'],
      pk: ['requirement_version_id', 'usage_scenario_id'],
      rows: [],
    },
    requirement_packages: {
      columns: [
        'id',
        'package_responsibility_area_id',
        'package_implementation_type_id',
        'created_at',
        'updated_at',
        'business_needs_reference',
        'unique_id',
        'name',
        'package_lifecycle_status_id',
        'local_requirement_next_sequence',
      ],
      pk: ['id'],
      rows: [],
    },
    package_needs_references: {
      columns: ['id', 'package_id', 'text', 'created_at'],
      pk: ['id'],
      rows: [],
    },
    package_local_requirements: {
      columns: [
        'id',
        'package_id',
        'unique_id',
        'sequence_number',
        'requirement_area_id',
        'description',
        'acceptance_criteria',
        'requirement_category_id',
        'requirement_type_id',
        'quality_characteristic_id',
        'risk_level_id',
        'is_testing_required',
        'verification_method',
        'needs_reference_id',
        'package_item_status_id',
        'note',
        'status_updated_at',
        'created_at',
        'updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
    package_local_requirement_norm_references: {
      columns: ['package_local_requirement_id', 'norm_reference_id'],
      pk: ['package_local_requirement_id', 'norm_reference_id'],
      rows: [],
    },
    package_local_requirement_usage_scenarios: {
      columns: ['package_local_requirement_id', 'usage_scenario_id'],
      pk: ['package_local_requirement_id', 'usage_scenario_id'],
      rows: [],
    },
    requirement_package_items: {
      columns: [
        'id',
        'requirement_package_id',
        'requirement_id',
        'requirement_version_id',
        'needs_reference_id',
        'unused_1',
        'created_at',
        'package_item_status_id',
        'note',
        'status_updated_at',
      ],
      pk: ['id'],
      rows: [],
    },
  }
}

describe('dogfood seed inventory', () => {
  it('every Krav fills all required properties', () => {
    expect(DOGFOOD_KRAV.length).toBeGreaterThanOrEqual(50)
    for (const k of DOGFOOD_KRAV) {
      expect(typeof k.area).toBe('number')
      expect(AREA_PREFIX_BY_ID[k.area]).toBeTruthy()
      expect(k.desc).toBeTruthy()
      expect(k.ac).toBeTruthy()
      expect(k.vm).toBeTruthy()
      expect(typeof k.cat).toBe('number')
      expect(typeof k.type).toBe('number')
      expect(typeof k.qc).toBe('number')
      expect(typeof k.risk).toBe('number')
      expect(typeof k.test).toBe('boolean')
      expect(Array.isArray(k.scn)).toBe(true)
      expect(Array.isArray(k.norm)).toBe(true)
      expect(typeof k.item).toBe('number')
    }
  })

  it('Krav descriptions and acceptance criteria meet minimum lengths', () => {
    for (const k of DOGFOOD_KRAV) {
      expect(k.desc.length).toBeGreaterThan(20)
      expect(k.ac.length).toBeGreaterThan(20)
    }
  })

  it('areas, owners, norms and scenarios have expected sizes', () => {
    expect(DOGFOOD_OWNERS).toHaveLength(5)
    expect(DOGFOOD_AREAS).toHaveLength(6)
    expect(DOGFOOD_NORMS).toHaveLength(6)
    expect(DOGFOOD_SCENARIOS).toHaveLength(12)
    expect(DOGFOOD_PACKAGES).toHaveLength(2)
  })

  it('package-local entries reference Krav that are also in KH-POC', () => {
    const poc = new Set(DOGFOOD_KH_POC_INDEXES)
    for (const pl of DOGFOOD_PACKAGE_LOCALS) {
      expect(poc.has(pl.kravIdx)).toBe(true)
      expect(DOGFOOD_KRAV[pl.kravIdx]).toBeDefined()
    }
  })
})

describe('appendDogfoodSeed', () => {
  it('produces KH and KH-POC packages with expected items and all v1 Publicerad', () => {
    const seed = emptySeed()
    const summary = appendDogfoodSeed(seed)

    expect(summary.requirementsAdded).toBe(DOGFOOD_KRAV.length)
    expect(summary.packagesAdded).toBe(2)

    const pkgs = seed.requirement_packages.rows
    const kh = pkgs.find(r => r[0] === PKG_KH)
    const khPoc = pkgs.find(r => r[0] === PKG_KH_POC)
    expect(kh).toBeDefined()
    expect(khPoc).toBeDefined()
    expect(kh?.[6]).toBe('KH')
    expect(khPoc?.[6]).toBe('KH-POC')
    expect(kh?.[8]).toBe(ID.pkgLifecycle.utveckling)
    expect(khPoc?.[8]).toBe(ID.pkgLifecycle.inforande)

    const items = seed.requirement_package_items.rows
    expect(items.filter(r => r[1] === PKG_KH)).toHaveLength(DOGFOOD_KRAV.length)
    expect(items.filter(r => r[1] === PKG_KH_POC)).toHaveLength(
      DOGFOOD_KH_POC_INDEXES.length,
    )

    // All dogfood requirement_versions are v1 + Publicerad
    const versions = seed.requirement_versions.rows
    expect(versions).toHaveLength(DOGFOOD_KRAV.length)
    for (const v of versions) {
      expect(v[2]).toBe(1) // version_number
      expect(v[8]).toBe(ID.status.publicerad) // requirement_status_id
      expect(v[13]).toBeTruthy() // published_at
      expect(v[14]).toBeNull() // archived_at
    }

    // Every package item points to a published v1
    const versionById = new Map(versions.map(v => [v[0], v]))
    for (const it of items) {
      const v = versionById.get(it[3])
      expect(v).toBeDefined()
      expect(v?.[8]).toBe(ID.status.publicerad)
    }

    // Existing area's next_sequence is bumped by the krav count for that area
    const intArea = seed.requirement_areas.rows.find(r => r[0] === 1)
    const intCount = DOGFOOD_KRAV.filter(k => k.area === 1).length
    expect(intArea?.[5]).toBe(39 + intCount)

    // Package locals appended for KH-POC only
    const locals = seed.package_local_requirements.rows
    expect(locals.filter(r => r[1] === PKG_KH)).toHaveLength(0)
    expect(locals.filter(r => r[1] === PKG_KH_POC)).toHaveLength(
      DOGFOOD_PACKAGE_LOCALS.length,
    )
  })

  it('mints unique IDs from current area next_sequence rows', () => {
    const seed = emptySeed()
    const intArea = seed.requirement_areas.rows.find(r => r[0] === ID.area.INT)
    if (!intArea) throw new Error('Expected INT area in test seed')

    intArea[5] = 99
    appendDogfoodSeed(seed)

    const intRequirements = seed.requirements.rows.filter(
      r => r[2] === ID.area.INT,
    )
    const intCount = DOGFOOD_KRAV.filter(k => k.area === ID.area.INT).length
    expect(intRequirements[0]?.[1]).toBe('INT0099')
    expect(intRequirements[0]?.[3]).toBe(99)
    expect(intArea[5]).toBe(99 + intCount)
  })
})
