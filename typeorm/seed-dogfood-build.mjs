// Builder that appends the dogfood dataset (defined in seed-dogfood.mjs) to
// the base seed's SEED_DATA structure in-place.
//
// Public entry point: appendDogfoodSeed(SEED_DATA)
//
// This builder is intentionally pure: it never queries the database and never
// looks at I/O. It only mutates the in-memory SEED_DATA object so that the
// seedDemoDatabase() runtime in seed.mjs picks up the new rows without further
// changes.

import {
  AREA_PREFIX_BY_ID,
  DOGFOOD_AREAS,
  DOGFOOD_KH_INFOR_INDEXES,
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
  SPEC_KH_INFOR,
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

const DOGFOOD_OWNER_HSA_BY_ID = new Map([
  [1001, 'SE5560000001-saraholm'],
  [1002, 'SE5560000001-karlpersson'],
  [1003, 'SE5560000001-linneab'],
  [1004, 'SE5560000001-oscarn'],
  [1005, 'SE5560000001-emmal'],
])

function dogfoodOwnerIdentity(ownerId) {
  const owner = DOGFOOD_OWNERS.find(([id]) => id === ownerId)
  if (!owner) {
    throw new Error(`Dogfood seed: unknown package owner id ${ownerId}`)
  }
  const hsaId = DOGFOOD_OWNER_HSA_BY_ID.get(ownerId)
  if (!hsaId) {
    throw new Error(`Dogfood seed: missing package owner HSA-ID ${ownerId}`)
  }
  return {
    displayName: `${owner[1]} ${owner[2]}`,
    hsaId,
  }
}

const BASE_REQUIREMENT_PACKAGE_IDS = {
  normalDrift: 7,
  hogBelastning: 8,
  katastrofAterstallning: 9,
}

const REQUIREMENT_SELECTION_DEMO_SPEC_IDS = {
  intplatt: 1,
  gdpr: 7,
  etjanst: 8,
  khInfor: SPEC_KH_INFOR,
}

const REQUIREMENT_SELECTION_QUESTIONS = [
  {
    areaId: ID.area.SAK,
    code: 'SÄK-KUF001',
    helpText:
      'Välj den nivå som bäst beskriver informationens känslighet och skyddsbehov.',
    id: 1,
    selectionType: 'single',
    sortOrder: 10,
    text: 'Vilken skyddsnivå gäller för informationen?',
  },
  {
    areaId: ID.area.INT,
    code: 'INT-KUF001',
    helpText:
      'Välj de integrationsmönster som leveransen behöver stödja eller avstå från frågan.',
    id: 2,
    selectionType: 'multiple',
    sortOrder: 20,
    text: 'Vilka integrationsmönster ingår?',
  },
  {
    areaId: ID.area.DRF,
    code: 'DRF-KUF001',
    helpText:
      'Välj driftförutsättningar som påverkar krav på plattform, återställning och belastning.',
    id: 3,
    selectionType: 'multiple',
    sortOrder: 30,
    text: 'Vilka driftkrav är relevanta?',
  },
  {
    areaId: ID.area.ANV,
    code: 'ANV-KUF001',
    helpText:
      'Välj de användargrupper och tillgänglighetsbehov som ska styra kravurvalet.',
    id: 4,
    selectionType: 'multiple',
    sortOrder: 40,
    text: 'Vilka användargrupper ska stödjas?',
  },
  {
    areaId: ID.area.RAP,
    code: 'RAP-KUF001',
    helpText:
      'Välj den rapporteringsnivå som behövs för beslut, uppföljning eller revision.',
    id: 5,
    selectionType: 'single',
    sortOrder: 50,
    text: 'Vilken rapportering behöver leveransen?',
  },
  {
    areaId: ID.area.KVA,
    code: 'KVA-KUF001',
    helpText:
      'Välj vilka test- och kvalitetssäkringskrav som behöver lyftas in tidigt.',
    id: 6,
    selectionType: 'multiple',
    sortOrder: 60,
    text: 'Vilken test- och kvalitetssäkring krävs?',
  },
]

const REQUIREMENT_SELECTION_ANSWERS = [
  {
    description:
      'Passar intern information där grundläggande informationssäkerhet räcker.',
    id: 1,
    packages: [ID.pkg.infosak],
    questionId: 1,
    requirementUniqueIds: ['SÄK0042'],
    sortOrder: 10,
    text: 'Grundskydd för intern information',
  },
  {
    description:
      'Används när personuppgifter, sekretess eller känslig handläggning ingår.',
    id: 2,
    packages: [ID.pkg.infosak, ID.pkg.gdprPerson],
    questionId: 1,
    requirementUniqueIds: ['SÄK0045', 'BEH0037'],
    sortOrder: 20,
    text: 'Personuppgifter eller sekretessklassad information',
  },
  {
    description:
      'Lyfter krav på säker identitet, behörighet och spårbara åtkomster.',
    id: 3,
    packages: [ID.pkg.infosak, ID.pkg.behorighet, ID.pkg.sso],
    questionId: 1,
    requirementUniqueIds: [
      'SÄK0043',
      'IDN0037',
      'BEH0037',
      'BEH0038',
      'BEH0039',
    ],
    sortOrder: 30,
    text: 'Behörighetskritisk information och identitet',
  },
  {
    description:
      'Täcker publicerade API:er, dokumenterade kontrakt och integrationsgränssnitt.',
    id: 4,
    packages: [ID.pkg.apiUtbyte],
    questionId: 2,
    requirementUniqueIds: ['INT0039', 'INT0041', 'INT0042'],
    sortOrder: 10,
    text: 'REST-API eller API Gateway',
  },
  {
    description:
      'Passar händelsestyrda integrationer där leveransen behöver avisera andra system.',
    id: 5,
    packages: [ID.pkg.integrationer, ID.pkg.apiUtbyte],
    questionId: 2,
    requirementUniqueIds: ['INT0043'],
    sortOrder: 20,
    text: 'Asynkrona meddelanden eller webhooks',
  },
  {
    description:
      'Används när befintliga datamängder ska tas in eller flyttas mellan system.',
    id: 6,
    packages: [ID.pkg.datamigrering],
    questionId: 2,
    requirementUniqueIds: [],
    sortOrder: 30,
    text: 'Filimport eller datamigrering',
  },
  {
    description:
      'Välj när leveransen inte behöver kravurval för externa integrationer.',
    id: 7,
    isNoRequirementSelection: true,
    packages: [],
    questionId: 2,
    requirementUniqueIds: [],
    sortOrder: 40,
    text: 'Inga externa integrationer',
  },
  {
    description:
      'Lyfter krav på driftsmiljö, övervakning och återställning i molnplattform.',
    id: 8,
    packages: [ID.pkg.molndrift, ID.pkg.driftTillg],
    questionId: 3,
    requirementUniqueIds: ['DRF0036', 'DRF0038', 'DRF0040'],
    sortOrder: 10,
    text: 'Molndrift och plattformsdrift',
  },
  {
    description:
      'Passar tjänster med många samtidiga användare, stora datamängder eller toppar.',
    id: 9,
    packages: [BASE_REQUIREMENT_PACKAGE_IDS.hogBelastning, ID.pkg.driftTillg],
    questionId: 3,
    requirementUniqueIds: ['DRF0038', 'DRF0039'],
    sortOrder: 20,
    text: 'Hög belastning eller många samtidiga användare',
  },
  {
    description:
      'Används för leveranser som måste kunna återställas efter större avbrott.',
    id: 10,
    packages: [
      BASE_REQUIREMENT_PACKAGE_IDS.katastrofAterstallning,
      ID.pkg.driftTillg,
    ],
    questionId: 3,
    requirementUniqueIds: ['DRF0037', 'DRF0040'],
    sortOrder: 30,
    text: 'Katastrofåterställning och backup',
  },
  {
    description:
      'Basnivå för lösningar utan särskilda belastnings- eller återställningskrav.',
    id: 11,
    packages: [BASE_REQUIREMENT_PACKAGE_IDS.normalDrift],
    questionId: 3,
    requirementUniqueIds: [],
    sortOrder: 40,
    text: 'Normal drift utan särskild belastning',
  },
  {
    description: 'Passar återkommande handläggningsflöden i verksamheten.',
    id: 12,
    packages: [ID.pkg.arendehantering, ID.pkg.anvandbarhet],
    questionId: 4,
    requirementUniqueIds: ['ANV0037', 'ANV0038'],
    sortOrder: 10,
    text: 'Handläggare i verksamheten',
  },
  {
    description:
      'Lyfter krav på responsivitet, fältarbete och användning utanför kontoret.',
    id: 13,
    packages: [ID.pkg.mobilAnvandning, ID.pkg.anvandbarhet],
    questionId: 4,
    requirementUniqueIds: ['ANV0040', 'ANV0041'],
    sortOrder: 20,
    text: 'Mobila fältanvändare',
  },
  {
    description:
      'Passar förvaltnings- och administrationsytor med hög spårbarhet.',
    id: 14,
    packages: [ID.pkg.anvandbarhet, ID.pkg.sparbarhet],
    questionId: 4,
    requirementUniqueIds: ['ANV0037', 'ANV0039'],
    sortOrder: 30,
    text: 'Administratörer och förvaltare',
  },
  {
    description:
      'Används när digital tillgänglighet behöver vara ett tydligt urvalsvillkor.',
    id: 15,
    packages: [ID.pkg.tillganglighet],
    questionId: 4,
    requirementUniqueIds: ['TIL0001', 'TIL0002'],
    sortOrder: 40,
    text: 'Tillgänglighet enligt WCAG',
  },
  {
    description:
      'Välj när rapportering inte ska påverka kravurvalet i detta underlag.',
    id: 16,
    isNoRequirementSelection: true,
    packages: [],
    questionId: 5,
    requirementUniqueIds: [],
    sortOrder: 10,
    text: 'Ingen särskild rapportering',
  },
  {
    description:
      'Passar beslutsunderlag där rapporten ska kunna skrivas ut eller arkiveras.',
    id: 17,
    packages: [ID.pkg.grundSystem, ID.pkg.sparbarhet],
    questionId: 5,
    requirementUniqueIds: ['RAP0001', 'RAP0002'],
    sortOrder: 20,
    text: 'PDF och utskrift för beslut',
  },
  {
    description:
      'Lyfter krav på spårbarhet, rapportkontext och revisionsbar export.',
    id: 18,
    packages: [ID.pkg.sparbarhet, ID.pkg.versionshantering],
    questionId: 5,
    requirementUniqueIds: ['RAP0003'],
    sortOrder: 30,
    text: 'Spårbar rapportering och revisionsunderlag',
  },
  {
    description:
      'Basnivå för kodnära tester som ska köras i utvecklingsflödet.',
    id: 19,
    packages: [ID.pkg.testKvalitet],
    questionId: 6,
    requirementUniqueIds: ['KVA0001', 'KVA0002'],
    sortOrder: 10,
    text: 'Automatiserade enhets- och integrationstester',
  },
  {
    description:
      'Används när användarflöden och kritiska regressioner ska testas i webbläsare.',
    id: 20,
    packages: [ID.pkg.testKvalitet],
    questionId: 6,
    requirementUniqueIds: ['KVA0003'],
    sortOrder: 20,
    text: 'End-to-end-test i webbläsare',
  },
  {
    description:
      'Passar leveranser där databasändringar, seed och versionering är centrala.',
    id: 21,
    packages: [ID.pkg.testKvalitet, ID.pkg.versionshantering],
    questionId: 6,
    requirementUniqueIds: ['DAT0037', 'DAT0039', 'KVA0005'],
    sortOrder: 30,
    text: 'Seed och migrationer ska vara deterministiska',
  },
  {
    description:
      'Välj när standardprocessen räcker och inget särskilt kravurval behövs.',
    id: 22,
    isNoRequirementSelection: true,
    packages: [],
    questionId: 6,
    requirementUniqueIds: [],
    sortOrder: 40,
    text: 'Ingen extra kvalitetssäkring utöver standard',
  },
]

const REQUIREMENT_SELECTION_SAVED_ANSWERS = [
  {
    answerIds: [2, 4, 5, 8, 13, 15],
    actor: { displayName: 'Sara Holm', hsaId: 'SE5560000001-saraholm' },
    specificationId: REQUIREMENT_SELECTION_DEMO_SPEC_IDS.etjanst,
  },
  {
    answerIds: [3, 4, 17, 19, 20, 21],
    actor: {
      displayName: 'Linnéa Bergström',
      hsaId: 'SE5560000001-linneab',
    },
    specificationId: REQUIREMENT_SELECTION_DEMO_SPEC_IDS.khInfor,
  },
  {
    answerIds: [4, 5, 6, 9],
    actor: { displayName: 'Karl Persson', hsaId: 'SE5560000001-karlpersson' },
    specificationId: REQUIREMENT_SELECTION_DEMO_SPEC_IDS.intplatt,
  },
  {
    answerIds: [2],
    actor: { displayName: 'Sara Holm', hsaId: 'SE5560000001-saraholm' },
    specificationId: REQUIREMENT_SELECTION_DEMO_SPEC_IDS.gdpr,
  },
  {
    answerIds: [18],
    actor: { displayName: 'Oscar Nilsson', hsaId: 'SE5560000001-oscarn' },
    isFilterActive: false,
    specificationId: REQUIREMENT_SELECTION_DEMO_SPEC_IDS.gdpr,
  },
]

function requirementIdByUniqueId(SEED_DATA) {
  const requirements = tableSection(SEED_DATA, 'requirements')
  const idIdx = requirements.columns.indexOf('id')
  const uniqueIdIdx = requirements.columns.indexOf('unique_id')
  return new Map(requirements.rows.map(row => [row[uniqueIdIdx], row[idIdx]]))
}

function appendRequirementSelectionDemoSeed(SEED_DATA) {
  const questionSequences = tableSection(
    SEED_DATA,
    'requirement_selection_question_sequences',
  )
  const questions = tableSection(SEED_DATA, 'requirement_selection_questions')
  const answers = tableSection(SEED_DATA, 'requirement_selection_answers')
  const answerPackages = tableSection(
    SEED_DATA,
    'requirement_selection_answer_packages',
  )
  const answerRequirements = tableSection(
    SEED_DATA,
    'requirement_selection_answer_requirements',
  )
  const savedAnswers = tableSection(
    SEED_DATA,
    'specification_requirement_selection_answers',
  )
  const requirementIdByUnique = requirementIdByUniqueId(SEED_DATA)
  const answerById = new Map(
    REQUIREMENT_SELECTION_ANSWERS.map(answer => [answer.id, answer]),
  )

  for (const question of REQUIREMENT_SELECTION_QUESTIONS) {
    ensureRow(questionSequences, [question.areaId, 2], ['area_id'])
    ensureRow(
      questions,
      [
        question.id,
        question.code,
        question.areaId,
        question.selectionType,
        question.text,
        question.helpText,
        question.sortOrder,
        1,
        0,
        SEED_TS,
        SEED_TS,
      ],
      ['id'],
    )
  }

  for (const answer of REQUIREMENT_SELECTION_ANSWERS) {
    const isNoRequirementSelection = answer.isNoRequirementSelection === true
    if (
      isNoRequirementSelection &&
      (answer.packages.length > 0 || answer.requirementUniqueIds.length > 0)
    ) {
      throw new Error(
        `Dogfood seed: no-requirement answer ${answer.id} must not have links`,
      )
    }

    ensureRow(
      answers,
      [
        answer.id,
        answer.questionId,
        answer.text,
        answer.description,
        answer.sortOrder,
        isNoRequirementSelection ? 1 : 0,
        1,
        0,
        SEED_TS,
        SEED_TS,
      ],
      ['id'],
    )

    for (const packageId of answer.packages) {
      ensureRow(
        answerPackages,
        [answer.id, packageId],
        ['answer_id', 'requirement_package_id'],
      )
    }

    for (const uniqueId of answer.requirementUniqueIds) {
      const requirementId = requirementIdByUnique.get(uniqueId)
      if (requirementId == null) {
        // Some unit tests intentionally alter area sequences to verify
        // minting. The full demo seed has a separate integrity test for the
        // canonical published Krav links.
        continue
      }
      ensureRow(
        answerRequirements,
        [answer.id, requirementId],
        ['answer_id', 'requirement_id'],
      )
    }
  }

  for (const savedSelection of REQUIREMENT_SELECTION_SAVED_ANSWERS) {
    for (const answerId of savedSelection.answerIds) {
      const answer = answerById.get(answerId)
      if (!answer) {
        throw new Error(
          `Dogfood seed: saved selection references unknown answer ${answerId}`,
        )
      }
      ensureRow(
        savedAnswers,
        [
          savedSelection.specificationId,
          answer.questionId,
          answerId,
          savedSelection.isFilterActive === false ? 0 : 1,
          SEED_TS,
          savedSelection.actor.hsaId,
          savedSelection.actor.displayName,
        ],
        ['specification_id', 'question_id', 'answer_id'],
      )
    }
  }
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
  for (const [id, sv, , dsv, , ownerId] of DOGFOOD_REQUIREMENT_PACKAGES) {
    const lead = dogfoodOwnerIdentity(ownerId)
    ensureRow(
      requirementPackages,
      [id, sv, dsv, lead.hsaId, lead.displayName, 0, SEED_TS, SEED_TS],
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
      p.governanceObjectType,
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
    needsRefs.rows.push([
      id,
      nr.spec,
      nr.text,
      nr.description ?? null,
      SEED_TS,
      SEED_TS,
    ])
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
    if (id === SPEC_KH || id === SPEC_KH_INFOR) {
      row[specSeqIdx] = (specLocalSeq[id] || 0) + 1
    }
  }

  // ---- requirements_specification_items -----------------------------------------
  // Every Krav gets linked to KH; a curated subset is also linked to KH-INFOR.
  const items = tableSection(SEED_DATA, 'requirements_specification_items')
  const inforIndexSet = new Set(DOGFOOD_KH_INFOR_INDEXES)
  // Needs-references are specification-scoped: an item's needs_reference_id must
  // belong to the same specification. Build per-specification lists.
  const khNeedsRefIds = []
  const khInforNeedsRefIds = []
  for (let i = 0; i < DOGFOOD_NEEDS_REFS.length; i += 1) {
    const id = needsRefIds[i]
    if (DOGFOOD_NEEDS_REFS[i].spec === SPEC_KH) khNeedsRefIds.push(id)
    else if (DOGFOOD_NEEDS_REFS[i].spec === SPEC_KH_INFOR)
      khInforNeedsRefIds.push(id)
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
  for (const idx of DOGFOOD_KH_INFOR_INDEXES) {
    if (!inforIndexSet.has(idx)) continue
    const m = minted[idx]
    if (!m) {
      throw new Error(
        `Dogfood seed: KH-INFOR index ${idx} has no minted requirement`,
      )
    }
    items.rows.push([
      nextItemId++,
      SPEC_KH_INFOR,
      m.requirementId,
      m.versionId,
      null,
      null,
      SEED_TS,
      // For the controlled introduction we mark most items as "Inkluderad";
      // the specification locals override with their own status.
      ID.itemStatus.inkluderad,
      null,
      SEED_TS,
    ])
  }

  appendRequirementSelectionDemoSeed(SEED_DATA)

  return {
    requirementsAdded: minted.length,
    requirementSelectionAnswersAdded: REQUIREMENT_SELECTION_ANSWERS.length,
    requirementSelectionQuestionsAdded: REQUIREMENT_SELECTION_QUESTIONS.length,
    specificationRequirementSelectionAnswersAdded:
      REQUIREMENT_SELECTION_SAVED_ANSWERS.reduce(
        (count, selection) => count + selection.answerIds.length,
        0,
      ),
    specificationsAdded: DOGFOOD_SPECIFICATIONS.length,
    specificationLocalsAdded: DOGFOOD_SPECIFICATION_LOCALS.length,
    specificationItemsAdded: minted.length + DOGFOOD_KH_INFOR_INDEXES.length,
    needsRefsAdded: DOGFOOD_NEEDS_REFS.length,
  }
}
