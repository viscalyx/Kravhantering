import { describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  AssignmentBasedAuthorizationService,
  type AssignmentLookup,
  type DeviationTarget,
  type RequirementTarget,
  SqlAssignmentLookup,
} from '@/lib/requirements/assignment-authorization'
import type {
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'

function makeContext(
  roles: string[],
  hsaId = 'SE5560000001-user1',
): RequestContext {
  return {
    actor: {
      displayName: 'Test User',
      hsaId,
      id: 'test-user',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'corr-test',
    requestId: 'req-test',
    source: 'rest',
  }
}

function requirementTarget(
  overrides: Partial<RequirementTarget> = {},
): RequirementTarget {
  return {
    areaId: 7,
    hasPublishedVersion: false,
    id: 11,
    latestStatusId: STATUS_DRAFT,
    uniqueId: 'INT0011',
    ...overrides,
  }
}

function deviationTarget(
  overrides: Partial<DeviationTarget> = {},
): DeviationTarget {
  return {
    createdByHsaId: null,
    specificationId: 42,
    ...overrides,
  }
}

function makeLookup(
  options: {
    areaAuthor?: boolean | ((areaId: number) => boolean)
    deviation?: Partial<DeviationTarget>
    requirement?: Partial<RequirementTarget>
    specAuthor?: boolean
    specificationId?: number
    suggestionAreaId?: number
  } = {},
) {
  const isAreaAuthor = (areaId: number) =>
    typeof options.areaAuthor === 'function'
      ? options.areaAuthor(areaId)
      : Boolean(options.areaAuthor)
  const lookup = {
    isRequirementAreaAuthor: vi.fn(async (areaId: number) =>
      isAreaAuthor(areaId),
    ),
    isSpecificationAuthor: vi.fn(async () => Boolean(options.specAuthor)),
    resolveDeviationTarget: vi.fn(async () =>
      deviationTarget(options.deviation),
    ),
    resolveRequirementTarget: vi.fn(async () =>
      requirementTarget(options.requirement ?? {}),
    ),
    resolveSpecificationId: vi.fn(
      async (input: { specificationId?: number; specificationSlug?: string }) =>
        input.specificationId ?? options.specificationId ?? 42,
    ),
    resolveSpecificationIdForLocalRequirement: vi.fn(
      async () => options.specificationId ?? 42,
    ),
    resolveRfiQuestionArea: vi.fn(
      async () => options.suggestionAreaId ?? options.requirement?.areaId ?? 7,
    ),
    resolveRfiQuestionSuggestionArea: vi.fn(
      async () => options.suggestionAreaId ?? options.requirement?.areaId ?? 7,
    ),
    resolveSuggestionRequirementArea: vi.fn(
      async () => options.suggestionAreaId ?? options.requirement?.areaId ?? 7,
    ),
  } satisfies AssignmentLookup
  return lookup
}

function makeService(options: Parameters<typeof makeLookup>[0] = {}) {
  const lookup = makeLookup(options)
  return {
    lookup,
    service: new AssignmentBasedAuthorizationService(lookup),
  }
}

function makeDb(rows: Array<Record<string, unknown>>[] = []) {
  const query = vi.fn(
    async (_sql?: string, _parameters?: unknown[]) => rows.shift() ?? [],
  )
  return {
    db: { query } as unknown as SqlServerDatabase,
    query,
  }
}

describe('AssignmentBasedAuthorizationService', () => {
  it('requires authentication before evaluating assignment-based rules', async () => {
    const { lookup, service } = makeService({ areaAuthor: true })
    const context = makeContext([])
    context.actor.isAuthenticated = false

    await expect(
      service.assertAuthorized(
        { catalog: 'requirements', kind: 'query_catalog' },
        context,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(lookup.isRequirementAreaAuthor).not.toHaveBeenCalled()
  })

  it('allows catalog queries for any authenticated actor', async () => {
    const { lookup, service } = makeService()

    await expect(
      service.assertAuthorized(
        { catalog: 'requirements', kind: 'query_catalog' },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(lookup.resolveRequirementTarget).not.toHaveBeenCalled()
  })

  it('allows ordinary actors with a verified HSA-id to list assigned specifications', async () => {
    const { lookup, service } = makeService()

    await expect(
      service.assertAuthorized(
        { kind: 'list_specifications' },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(lookup.isSpecificationAuthor).not.toHaveBeenCalled()
  })

  it('requires a verified HSA-id before ordinary actors can list specifications', async () => {
    const { lookup, service } = makeService()

    await expect(
      service.assertAuthorized(
        { kind: 'list_specifications' },
        makeContext([], ''),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'missing_actor_hsa_id' },
    })
    expect(lookup.isSpecificationAuthor).not.toHaveBeenCalled()
  })

  it.each<RequirementsAction>([
    { kind: 'get_specification_items', specificationId: 42 },
    { kind: 'list_deviations', specificationId: 42 },
  ])('allows %s for specification authors', async action => {
    const { lookup, service } = makeService({ specAuthor: true })

    await expect(
      service.assertAuthorized(action, makeContext([])),
    ).resolves.toBeUndefined()
    expect(lookup.isSpecificationAuthor).toHaveBeenCalledWith(
      42,
      'SE5560000001-user1',
    )
  })

  it.each<RequirementsAction>([
    { kind: 'get_specification_items', specificationId: 42 },
    { kind: 'list_deviations', specificationId: 42 },
  ])('allows %s for Reviewer without assignment lookup', async action => {
    const { lookup, service } = makeService()

    await expect(
      service.assertAuthorized(action, makeContext(['Reviewer'])),
    ).resolves.toBeUndefined()
    expect(lookup.isSpecificationAuthor).not.toHaveBeenCalled()
  })

  it.each<RequirementsAction>([
    { kind: 'get_specification_items', specificationId: 42 },
    { kind: 'list_deviations', specificationId: 42 },
    {
      kind: 'add_to_specification',
      requirementIds: [11],
      specificationId: 42,
    },
    {
      kind: 'remove_from_specification',
      requirementIds: [11],
      specificationId: 42,
    },
    {
      kind: 'list_graduation_target_areas',
      localRequirementId: 3,
      specificationId: 42,
    },
    {
      kind: 'manage_specification_local_requirement',
      localRequirementId: 3,
      operation: 'edit',
    },
    {
      kind: 'manage_specification_needs_reference',
      needsReferenceId: 8,
      operation: 'edit',
      specificationId: 42,
    },
  ])('requires specification authorship for %s', async action => {
    const { service } = makeService({ specAuthor: false })

    await expect(
      service.assertAuthorized(action, makeContext([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'specification_author_required' },
    })
  })

  it.each<RequirementsAction>([
    {
      kind: 'add_to_specification',
      requirementIds: [11],
      specificationId: 42,
    },
    {
      kind: 'remove_from_specification',
      requirementIds: [11],
      specificationId: 42,
    },
    {
      kind: 'list_graduation_target_areas',
      localRequirementId: 3,
      specificationId: 42,
    },
    {
      kind: 'manage_specification_local_requirement',
      operation: 'create',
      specificationId: 42,
    },
    {
      kind: 'manage_specification_needs_reference',
      operation: 'create',
      specificationId: 42,
    },
  ])('allows %s for specification authors', async action => {
    const { service } = makeService({ specAuthor: true })

    await expect(
      service.assertAuthorized(action, makeContext([])),
    ).resolves.toBeUndefined()
  })

  it('requires both specification and requirement-area authorship for graduation', async () => {
    const action: RequirementsAction = {
      kind: 'graduate_specification_local_requirement',
      localRequirementId: 3,
      requirementAreaId: 7,
      specificationId: 42,
    }

    await expect(
      makeService({
        areaAuthor: true,
        specAuthor: true,
      }).service.assertAuthorized(action, makeContext([])),
    ).resolves.toBeUndefined()

    await expect(
      makeService({
        areaAuthor: true,
        specAuthor: false,
      }).service.assertAuthorized(action, makeContext([])),
    ).rejects.toMatchObject({
      details: { reason: 'specification_author_required' },
    })

    await expect(
      makeService({
        areaAuthor: false,
        specAuthor: true,
      }).service.assertAuthorized(action, makeContext([])),
    ).rejects.toMatchObject({
      details: { reason: 'requirement_area_author_required' },
    })
  })

  it('allows published requirement detail reads without assignment', async () => {
    const { lookup, service } = makeService({
      requirement: { hasPublishedVersion: true },
    })

    await expect(
      service.assertAuthorized(
        { id: 11, kind: 'get_requirement', view: 'detail' },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(lookup.isRequirementAreaAuthor).not.toHaveBeenCalled()
  })

  it('requires requirement-area authorship for requirement history and unpublished reads', async () => {
    await expect(
      makeService({
        areaAuthor: true,
        requirement: { hasPublishedVersion: false },
      }).service.assertAuthorized(
        { id: 11, kind: 'get_requirement', view: 'detail' },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({
        areaAuthor: false,
        requirement: { hasPublishedVersion: true },
      }).service.assertAuthorized(
        { id: 11, kind: 'get_requirement', view: 'history' },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'requirement_area_author_required' },
    })
  })

  it('allows Reviewer and Admin to read requirement history without assignment', async () => {
    const reviewer = makeService({
      requirement: { hasPublishedVersion: true },
    })
    await expect(
      reviewer.service.assertAuthorized(
        { id: 11, kind: 'get_requirement', view: 'history' },
        makeContext(['Reviewer']),
      ),
    ).resolves.toBeUndefined()
    expect(reviewer.lookup.isRequirementAreaAuthor).not.toHaveBeenCalled()

    const admin = makeService()
    await expect(
      admin.service.assertAuthorized(
        { id: 11, kind: 'get_requirement', view: 'history' },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()
    expect(admin.lookup.resolveRequirementTarget).not.toHaveBeenCalled()
  })

  it('requires requirement-area authorship for requirement create, edit, delete, archive, restore, and reactivate', async () => {
    const actions: RequirementsAction[] = [
      { areaId: 7, kind: 'manage_requirement', operation: 'create' },
      { id: 11, kind: 'manage_requirement', operation: 'edit' },
      { id: 11, kind: 'manage_requirement', operation: 'delete_draft' },
      { id: 11, kind: 'manage_requirement', operation: 'archive' },
      { id: 11, kind: 'manage_requirement', operation: 'restore_version' },
      { id: 11, kind: 'manage_requirement', operation: 'reactivate' },
    ]

    for (const action of actions) {
      await expect(
        makeService({ areaAuthor: true }).service.assertAuthorized(
          action,
          makeContext([]),
        ),
      ).resolves.toBeUndefined()
      await expect(
        makeService({ areaAuthor: false }).service.assertAuthorized(
          action,
          makeContext([]),
        ),
      ).rejects.toMatchObject({
        details: { reason: 'requirement_area_author_required' },
      })
    }
  })

  it('requires authorship for both the old and new requirement areas when moving a requirement', async () => {
    const { lookup, service } = makeService({
      areaAuthor: areaId => areaId === 7 || areaId === 9,
      requirement: { areaId: 7 },
    })

    await expect(
      service.assertAuthorized(
        {
          areaId: 9,
          id: 11,
          kind: 'manage_requirement',
          operation: 'edit',
        },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(lookup.isRequirementAreaAuthor).toHaveBeenCalledWith(
      7,
      'SE5560000001-user1',
    )
    expect(lookup.isRequirementAreaAuthor).toHaveBeenCalledWith(
      9,
      'SE5560000001-user1',
    )

    await expect(
      makeService({
        areaAuthor: areaId => areaId === 7,
        requirement: { areaId: 7 },
      }).service.assertAuthorized(
        {
          areaId: 9,
          id: 11,
          kind: 'manage_requirement',
          operation: 'edit',
        },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { requirementAreaId: 9 },
    })
  })

  it.each<RequirementsAction>([
    {
      id: 11,
      kind: 'manage_requirement',
      operation: 'approve_archiving',
    },
    {
      id: 11,
      kind: 'manage_requirement',
      operation: 'cancel_archiving',
    },
    {
      id: 11,
      kind: 'transition_requirement',
      toStatusId: STATUS_PUBLISHED,
    },
    {
      id: 11,
      kind: 'transition_requirement',
      toStatusId: STATUS_ARCHIVED,
    },
    {
      kind: 'manage_deviation',
      deviationId: 5,
      operation: 'record_decision',
    },
  ])('requires Reviewer for reviewer-only action %s', async action => {
    await expect(
      makeService({
        areaAuthor: true,
        specAuthor: true,
      }).service.assertAuthorized(action, makeContext(['Admin'])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'reviewer_required' },
    })

    await expect(
      makeService().service.assertAuthorized(action, makeContext(['Reviewer'])),
    ).resolves.toBeUndefined()
  })

  it('requires Reviewer when leaving review state through a transition', async () => {
    await expect(
      makeService({
        areaAuthor: true,
        requirement: { latestStatusId: STATUS_REVIEW },
      }).service.assertAuthorized(
        { id: 11, kind: 'transition_requirement', toStatusId: STATUS_DRAFT },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'reviewer_required' },
    })
  })

  it('allows Admin and requirement-area authors to perform non-reviewer requirement transitions', async () => {
    const admin = makeService()
    await expect(
      admin.service.assertAuthorized(
        { id: 11, kind: 'transition_requirement', toStatusId: STATUS_DRAFT },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({ areaAuthor: true }).service.assertAuthorized(
        { id: 11, kind: 'transition_requirement', toStatusId: STATUS_DRAFT },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
  })

  it('requires specification authorship for non-decision deviation mutations', async () => {
    await expect(
      makeService({ specAuthor: true }).service.assertAuthorized(
        {
          kind: 'manage_deviation',
          operation: 'create',
          specificationItemId: 3,
        },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({ specAuthor: false }).service.assertAuthorized(
        {
          kind: 'manage_deviation',
          operation: 'create',
          specificationItemId: 3,
        },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'specification_author_required' },
    })
  })

  it('allows published suggestion lists but requires area authorship for unpublished suggestion lists', async () => {
    await expect(
      makeService({
        requirement: { hasPublishedVersion: true },
      }).service.assertAuthorized(
        { kind: 'list_suggestions', requirementId: 11 },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({
        areaAuthor: false,
        requirement: { hasPublishedVersion: false },
      }).service.assertAuthorized(
        { kind: 'list_suggestions', requirementId: 11 },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'requirement_area_author_required' },
    })
  })

  it('requires area authorship for suggestion mutations', async () => {
    await expect(
      makeService({ areaAuthor: true }).service.assertAuthorized(
        { kind: 'manage_suggestion', operation: 'create', requirementId: 11 },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({ areaAuthor: false }).service.assertAuthorized(
        {
          kind: 'manage_suggestion',
          operation: 'request_review',
          suggestionId: 5,
        },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'requirement_area_author_required' },
    })
  })

  it('requires both specification and area authorship when creating an RFI question suggestion with both targets', async () => {
    const { lookup, service } = makeService({
      areaAuthor: false,
      specAuthor: true,
      specificationId: 42,
    })

    await expect(
      service.assertAuthorized(
        {
          areaId: 7,
          kind: 'manage_rfi_question_suggestion',
          operation: 'create',
          specificationId: 42,
        },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'requirement_area_author_required' },
    })
    expect(lookup.isSpecificationAuthor).toHaveBeenCalledWith(
      42,
      'SE5560000001-user1',
    )
    expect(lookup.isRequirementAreaAuthor).toHaveBeenCalledWith(
      7,
      'SE5560000001-user1',
    )
  })

  it('authorizes AI generation by Admin, requirement-area scope, or specification scope', async () => {
    const admin = makeService()
    await expect(
      admin.service.assertAuthorized(
        { kind: 'generate_requirements' },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()
    expect(admin.lookup.isRequirementAreaAuthor).not.toHaveBeenCalled()

    await expect(
      makeService({ areaAuthor: true }).service.assertAuthorized(
        {
          kind: 'generate_requirements',
          scopeId: 7,
          scopeType: 'requirement_area',
        },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService({ specAuthor: true }).service.assertAuthorized(
        {
          kind: 'generate_requirements',
          scopeId: 42,
          scopeType: 'specification',
        },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()

    await expect(
      makeService().service.assertAuthorized(
        { kind: 'generate_requirements' },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      details: { reason: 'ai_scope_required' },
    })
  })
})

describe('SqlAssignmentLookup', () => {
  it('checks specification authorship using responsible and co-author assignments', async () => {
    const { db, query } = makeDb([[{ id: 42 }]])
    const lookup = new SqlAssignmentLookup(db)

    await expect(
      lookup.isSpecificationAuthor(42, 'SE5560000001-user1'),
    ).resolves.toBe(true)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'requirements_specifications specification_record',
      ),
      [42, 'SE5560000001-user1'],
    )
  })

  it('checks requirement-area authorship using owner and co-author assignments', async () => {
    const { db, query } = makeDb([[{ id: 7 }]])
    const lookup = new SqlAssignmentLookup(db)

    await expect(
      lookup.isRequirementAreaAuthor(7, 'SE5560000001-user1'),
    ).resolves.toBe(true)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirement_areas area'),
      [7, 'SE5560000001-user1'],
    )
  })

  it('resolves requirement targets and maps published-version flags', async () => {
    const { db, query } = makeDb([
      [
        {
          areaId: 7,
          hasPublishedVersion: 1,
          id: 11,
          latestStatusId: STATUS_REVIEW,
          uniqueId: 'INT0011',
        },
      ],
    ])
    const lookup = new SqlAssignmentLookup(db)

    await expect(
      lookup.resolveRequirementTarget({ uniqueId: 'INT0011' }),
    ).resolves.toEqual({
      areaId: 7,
      hasPublishedVersion: true,
      id: 11,
      latestStatusId: STATUS_REVIEW,
      uniqueId: 'INT0011',
    })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('unique_id'), [
      'INT0011',
      STATUS_PUBLISHED,
    ])
  })

  it('resolves deviation targets before deviation authorization', async () => {
    const { db, query } = makeDb([
      [{ createdByHsaId: 'SE5560000001-user1', specificationId: 42 }],
      [],
    ])
    const lookup = new SqlAssignmentLookup(db)

    await expect(
      lookup.resolveDeviationTarget({
        deviationId: 5,
        kind: 'manage_deviation',
        operation: 'edit',
      }),
    ).resolves.toEqual({
      createdByHsaId: 'SE5560000001-user1',
      specificationId: 42,
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM deviations deviation'),
      [5],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM specification_local_requirement_deviations',
      ),
      [5],
    )
  })

  it('rejects ambiguous deviation targets that exist in both deviation tables', async () => {
    const { db, query } = makeDb([
      [{ createdByHsaId: 'SE5560000001-library', specificationId: 42 }],
      [{ createdByHsaId: 'SE5560000001-local', specificationId: 99 }],
    ])
    const lookup = new SqlAssignmentLookup(db)

    await expect(
      lookup.resolveDeviationTarget({
        deviationId: 5,
        kind: 'manage_deviation',
        operation: 'edit',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { deviationId: 5, reason: 'ambiguous_deviation_id' },
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('resolves suggestion requirement areas from suggestion or requirement references', async () => {
    const bySuggestion = makeDb([[{ areaId: 7 }]])
    await expect(
      new SqlAssignmentLookup(bySuggestion.db).resolveSuggestionRequirementArea(
        {
          kind: 'manage_suggestion',
          operation: 'request_review',
          suggestionId: 5,
        },
      ),
    ).resolves.toBe(7)
    expect(bySuggestion.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM improvement_suggestions'),
      [5],
    )

    const byRequirement = makeDb([
      [
        {
          areaId: 9,
          hasPublishedVersion: 0,
          id: 12,
          latestStatusId: STATUS_DRAFT,
          uniqueId: 'INT0012',
        },
      ],
    ])
    await expect(
      new SqlAssignmentLookup(
        byRequirement.db,
      ).resolveSuggestionRequirementArea({
        kind: 'manage_suggestion',
        operation: 'create',
        requirementId: 12,
      }),
    ).resolves.toBe(9)
    expect(byRequirement.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirements requirement'),
      [12, STATUS_PUBLISHED],
    )
  })
})
