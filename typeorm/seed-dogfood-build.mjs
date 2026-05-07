// Builder that appends the dogfood dataset (defined in seed-dogfood.mjs) to
// the base seed's SEED_DATA structure in-place.
//
// Public entry point: appendDogfoodSeed(SEED_DATA)
//
// This builder is intentionally pure: it never queries the database and never
// looks at I/O. It only mutates the in-memory SEED_DATA object so that the
// existing seedDatabase() runtime in seed.mjs picks up the new rows without
// further changes.

import {
  AREA_PREFIX_BY_ID,
  DOGFOOD_AREAS,
  DOGFOOD_KH_POC_INDEXES,
  DOGFOOD_KRAV,
  DOGFOOD_NEEDS_REFS,
  DOGFOOD_NORMS,
  DOGFOOD_OWNERS,
  DOGFOOD_REQUIREMENT_PACKAGES,
  DOGFOOD_SPECIFICATION_LOCALS,
  DOGFOOD_SPECIFICATIONS,
  ID,
  NEEDS_REF_ID_BASE,
  REQUIREMENT_ID_BASE,
  SEED_TS,
  SPEC_KH,
  SPEC_KH_POC,
  SPECIFICATION_ITEM_ID_BASE,
  SPECIFICATION_LOCAL_ID_BASE,
  VERSION_ID_BASE,
} from './seed-dogfood.mjs'

// Stable revision-token namespace so re-running the builder produces stable
// UUIDs for each Krav. We use a deterministic hash of (krav-index, version).
function deterministicUuid(seed) {
  // FNV-1a 32-bit hash over the seed string, expanded to 128 bits by
  // mixing with rotated constants. Not cryptographic — just deterministic.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const h2 = Math.imul(h ^ 0xdeadbeef, 0x01000193) >>> 0
  const h3 = Math.imul(h ^ 0xfeedface, 0x01000193) >>> 0
  const h4 = Math.imul(h ^ 0xcafef00d, 0x01000193) >>> 0
  const hex = n => n.toString(16).padStart(8, '0')
  // Stamp a UUIDv4-shaped string with version 4 + variant bits flipped.
  const a = hex(h)
  const b = hex(h2).slice(0, 4)
  const c = `4${hex(h2).slice(5, 8)}`
  const d =
    ((parseInt(hex(h3).slice(0, 2), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, '0') + hex(h3).slice(2, 4)
  const e = (hex(h3).slice(4, 8) + hex(h4)).slice(0, 12)
  return `${a}-${b}-${c}-${d}-${e}`
}

function ensureRow(table, row, pkCols) {
  // Append row only if no existing row matches on the PK column(s). This keeps
  // the builder idempotent if it is somehow invoked twice on the same
  // SEED_DATA structure.
  const idxs = pkCols.map(c => table.columns.indexOf(c))
  const matches = existing => idxs.every((i, k) => existing[i] === row[idxs[k]])
  if (!table.rows.some(matches)) table.rows.push(row)
}

function tableSection(SEED_DATA, name) {
  const t = SEED_DATA[name]
  if (!t) throw new Error(`Dogfood seed: missing base table '${name}'`)
  return t
}

export function appendDogfoodSeed(SEED_DATA) {
  // ---- Owners ------------------------------------------------------------
  const owners = tableSection(SEED_DATA, 'owners')
  for (const [id, first, last, email] of DOGFOOD_OWNERS) {
    ensureRow(owners, [id, first, last, email, SEED_TS, SEED_TS], ['id'])
  }

  // ---- Norm references ---------------------------------------------------
  const norms = tableSection(SEED_DATA, 'norm_references')
  for (const [
    id,
    normId,
    name,
    type,
    ref,
    version,
    issuer,
    uri,
  ] of DOGFOOD_NORMS) {
    ensureRow(
      norms,
      [id, normId, name, type, ref, version, issuer, SEED_TS, SEED_TS, uri],
      ['id'],
    )
  }

  // ---- Requirement packages -----------------------------------------------
  const requirementPackages = tableSection(SEED_DATA, 'requirement_packages')
  for (const [id, sv, en, dsv, den, ownerId] of DOGFOOD_REQUIREMENT_PACKAGES) {
    ensureRow(
      requirementPackages,
      [id, sv, en, dsv, den, ownerId, SEED_TS, SEED_TS],
      ['id'],
    )
  }

  // ---- Mint Krav, versions, junctions, and specifications ----------------------
  // Per-area Krav counts so we can patch the area's next_sequence at the end
  // (existing areas) and set it correctly on first creation (new areas).
  const dogfoodSeqUsed = {}
  // Map dogfood Krav index -> assigned (requirementId, versionId, areaSeqUsed)
  const minted = []
  const areas = tableSection(SEED_DATA, 'requirement_areas')
  const areaIdIdx = areas.columns.indexOf('id')
  const areaSeqIdx = areas.columns.indexOf('next_sequence')
  const existingAreaIds = new Set(areas.rows.map(r => r[areaIdIdx]))
  const nextSeqByArea = {}
  for (const row of areas.rows) {
    nextSeqByArea[row[areaIdIdx]] = row[areaSeqIdx]
  }
  for (const [id] of DOGFOOD_AREAS) {
    if (!existingAreaIds.has(id)) nextSeqByArea[id] = 1
  }

  for (let idx = 0; idx < DOGFOOD_KRAV.length; idx += 1) {
    const k = DOGFOOD_KRAV[idx]
    const seq = nextSeqByArea[k.area]
    if (seq === undefined) {
      throw new Error(`Dogfood seed: unknown area id ${k.area}`)
    }
    const prefix = AREA_PREFIX_BY_ID[k.area]
    const uniqueId = `${prefix}${String(seq).padStart(4, '0')}`
    const requirementId = REQUIREMENT_ID_BASE + idx + 1
    const versionId = VERSION_ID_BASE + idx + 1
    nextSeqByArea[k.area] = seq + 1
    dogfoodSeqUsed[k.area] = (dogfoodSeqUsed[k.area] || 0) + 1
    minted.push({ idx, requirementId, versionId, uniqueId, seq })
  }

  // ---- Requirement areas (new ones + bump existing next_sequence) --------
  // New areas
  for (const [id, prefix, name, description, ownerId] of DOGFOOD_AREAS) {
    if (existingAreaIds.has(id)) continue
    areas.rows.push([
      id,
      prefix,
      name,
      description,
      ownerId,
      nextSeqByArea[id],
      SEED_TS,
      SEED_TS,
    ])
  }
  // Bump existing-area next_sequence to reflect newly minted Krav
  const updIdx = areas.columns.indexOf('updated_at')
  for (const row of areas.rows) {
    const aId = row[areaIdIdx]
    const used = dogfoodSeqUsed[aId] || 0
    if (used > 0 && existingAreaIds.has(aId)) {
      row[areaSeqIdx] = nextSeqByArea[aId]
      row[updIdx] = SEED_TS
    }
  }

  // ---- requirements -------------------------------------------------------
  const requirements = tableSection(SEED_DATA, 'requirements')
  for (const m of minted) {
    const k = DOGFOOD_KRAV[m.idx]
    requirements.rows.push([
      m.requirementId,
      m.uniqueId,
      k.area,
      m.seq,
      0,
      SEED_TS,
    ])
  }

  // ---- requirement_versions ----------------------------------------------
  const versions = tableSection(SEED_DATA, 'requirement_versions')
  for (const m of minted) {
    const k = DOGFOOD_KRAV[m.idx]
    const row = [
      m.versionId,
      m.requirementId,
      1, // version_number
      k.desc,
      k.ac,
      k.cat,
      k.type,
      k.qc,
      ID.status.publicerad,
      k.test ? 1 : 0,
      k.vm,
      SEED_TS, // created_at
      SEED_TS, // edited_at
      SEED_TS, // published_at
      null, // archived_at
      'seed-dogfood',
      null, // archive_initiated_at
      k.risk,
    ]
    // The base table also includes a `revision_token` column. Look it up.
    if (versions.columns.includes('revision_token')) {
      const tokIdx = versions.columns.indexOf('revision_token')
      while (row.length <= tokIdx) row.push(null)
      row[tokIdx] = deterministicUuid(`dogfood-version-${m.versionId}`)
    }
    versions.rows.push(row)
  }

  // ---- requirement_version_norm_references -------------------------------
  const vNorms = tableSection(SEED_DATA, 'requirement_version_norm_references')
  for (const m of minted) {
    const k = DOGFOOD_KRAV[m.idx]
    for (const normId of k.norm) {
      vNorms.rows.push([m.versionId, normId])
    }
  }

  // ---- requirement_version_requirement_packages ---------------------------
  const vPackages = tableSection(
    SEED_DATA,
    'requirement_version_requirement_packages',
  )
  for (const m of minted) {
    const k = DOGFOOD_KRAV[m.idx]
    for (const packageId of k.pkg) {
      vPackages.rows.push([m.versionId, packageId])
    }
  }

  // ---- requirements_specifications ----------------------------------------------
  const specifications = tableSection(SEED_DATA, 'requirements_specifications')
  for (const p of DOGFOOD_SPECIFICATIONS) {
    // local_requirement_next_sequence will be patched after specification locals.
    specifications.rows.push([
      p.id,
      p.responsibility,
      p.impl,
      SEED_TS,
      SEED_TS,
      p.businessNeeds,
      p.uniqueId,
      p.name,
      p.lifecycle,
      1,
    ])
  }

  // ---- specification_needs_references ------------------------------------------
  const needsRefs = tableSection(SEED_DATA, 'specification_needs_references')
  const needsRefIds = []
  for (let i = 0; i < DOGFOOD_NEEDS_REFS.length; i += 1) {
    const nr = DOGFOOD_NEEDS_REFS[i]
    const id = NEEDS_REF_ID_BASE + i + 1
    needsRefIds.push(id)
    needsRefs.rows.push([id, nr.spec, nr.text, SEED_TS])
  }

  // ---- specification_local_requirements + their junctions -----------------------
  const locals = tableSection(SEED_DATA, 'specification_local_requirements')
  const localNorms = tableSection(
    SEED_DATA,
    'specification_local_requirement_norm_references',
  )
  const localPackages = tableSection(
    SEED_DATA,
    'specification_local_requirement_requirement_packages',
  )
  // Track per-specification local sequence
  const specLocalSeq = {}
  const specLocalRows = {}
  for (let i = 0; i < DOGFOOD_SPECIFICATION_LOCALS.length; i += 1) {
    const pl = DOGFOOD_SPECIFICATION_LOCALS[i]
    const k = DOGFOOD_KRAV[pl.kravIdx]
    if (!k) {
      throw new Error(
        `Dogfood seed: specification-local refers to unknown krav idx ${pl.kravIdx}`,
      )
    }
    const localId = SPECIFICATION_LOCAL_ID_BASE + i + 1
    specLocalSeq[pl.spec] = (specLocalSeq[pl.spec] || 0) + 1
    const seq = specLocalSeq[pl.spec]
    specLocalRows[pl.spec] = (specLocalRows[pl.spec] || 0) + 1
    const uniqueId = `KRAV${String(seq).padStart(4, '0')}`
    const needsRefId =
      pl.needsRefOffset != null && pl.needsRefOffset < needsRefIds.length
        ? needsRefIds[pl.needsRefOffset]
        : null
    locals.rows.push([
      localId,
      pl.spec,
      uniqueId,
      seq,
      k.area,
      k.desc + (pl.descSuffix || ''),
      k.ac + (pl.acSuffix || ''),
      k.cat,
      k.type,
      k.qc,
      k.risk,
      k.test ? 1 : 0,
      k.vm,
      needsRefId,
      pl.item,
      pl.note || null,
      SEED_TS,
      SEED_TS,
      SEED_TS,
    ])
    for (const normId of k.norm) {
      localNorms.rows.push([localId, normId])
    }
    for (const packageId of k.pkg) {
      localPackages.rows.push([localId, packageId])
    }
  }

  // Patch local_requirement_next_sequence on each specification row
  const specIdIdx = specifications.columns.indexOf('id')
  const specSeqIdx = specifications.columns.indexOf(
    'local_requirement_next_sequence',
  )
  for (const row of specifications.rows) {
    const id = row[specIdIdx]
    if (id === SPEC_KH || id === SPEC_KH_POC) {
      row[specSeqIdx] = (specLocalSeq[id] || 0) + 1
    }
  }

  // ---- requirements_specification_items -----------------------------------------
  // Every Krav gets linked to KH; a curated subset is also linked to KH-POC.
  const items = tableSection(SEED_DATA, 'requirements_specification_items')
  const pocIndexSet = new Set(DOGFOOD_KH_POC_INDEXES)
  // Needs-references are specification-scoped: an item's needs_reference_id must
  // belong to the same specification. Build per-specification lists.
  const khNeedsRefIds = []
  const khPocNeedsRefIds = []
  for (let i = 0; i < DOGFOOD_NEEDS_REFS.length; i += 1) {
    const id = needsRefIds[i]
    if (DOGFOOD_NEEDS_REFS[i].spec === SPEC_KH) khNeedsRefIds.push(id)
    else if (DOGFOOD_NEEDS_REFS[i].spec === SPEC_KH_POC)
      khPocNeedsRefIds.push(id)
  }
  let nextItemId = SPECIFICATION_ITEM_ID_BASE + 1
  for (let i = 0; i < minted.length; i += 1) {
    const m = minted[i]
    const k = DOGFOOD_KRAV[m.idx]
    items.rows.push([
      nextItemId++,
      SPEC_KH,
      m.requirementId,
      m.versionId,
      // Loosely tie a few items to a KH needs-ref to exercise that field
      i % 8 === 0 && khNeedsRefIds.length > 0
        ? khNeedsRefIds[(i / 8) % khNeedsRefIds.length]
        : null,
      null, // unused_1
      SEED_TS, // created_at
      k.item, // specification_item_status_id
      null, // note
      SEED_TS, // status_updated_at
    ])
  }
  for (const idx of DOGFOOD_KH_POC_INDEXES) {
    if (!pocIndexSet.has(idx)) continue
    const m = minted[idx]
    if (!m) {
      throw new Error(
        `Dogfood seed: KH-POC index ${idx} has no minted requirement`,
      )
    }
    items.rows.push([
      nextItemId++,
      SPEC_KH_POC,
      m.requirementId,
      m.versionId,
      null,
      null,
      SEED_TS,
      // For PoC we mark most items as "Inkluderad" since work hasn't started
      // there yet; the specification locals override with their own status.
      ID.itemStatus.inkluderad,
      null,
      SEED_TS,
    ])
  }

  return {
    requirementsAdded: minted.length,
    specificationsAdded: DOGFOOD_SPECIFICATIONS.length,
    specificationLocalsAdded: DOGFOOD_SPECIFICATION_LOCALS.length,
    specificationItemsAdded: minted.length + DOGFOOD_KH_POC_INDEXES.length,
    needsRefsAdded: DOGFOOD_NEEDS_REFS.length,
  }
}
