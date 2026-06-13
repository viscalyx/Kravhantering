import { describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { AssignmentBasedAuthorizationService } from '@/lib/requirements/assignment-authorization'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  STATUS_DRAFT,
  STATUS_PUBLISHED,
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

function makeDb(rows: Array<Record<string, unknown>>[] = []) {
  const query = vi.fn(async () => rows.shift() ?? [])
  return {
    db: { query } as unknown as SqlServerDatabase,
    query,
  }
}

function requirementTargetRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    areaId: 7,
    hasPublishedVersion: 0,
    id: 11,
    latestStatusId: STATUS_DRAFT,
    uniqueId: 'INT0011',
    ...overrides,
  }
}

describe('AssignmentBasedAuthorizationService', () => {
  it('allows Admin to use AI without scope before reading assignments', async () => {
    const { db, query } = makeDb()
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'generate_requirements' },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })

  it('allows ordinary users to list specifications before assignment filtering', async () => {
    const { db, query } = makeDb()
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'list_specifications' },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })

  it('requires HSA-id before ordinary users can list assigned specifications', async () => {
    const { db, query } = makeDb()
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'list_specifications' },
        makeContext([], ''),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'missing_actor_hsa_id' },
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('allows Admin and Reviewer to read any specification without assignment lookup', async () => {
    const { db, query } = makeDb()
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'get_specification_items', specificationId: 42 },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()
    await expect(
      service.assertAuthorized(
        { kind: 'get_specification_items', specificationId: 42 },
        makeContext(['Reviewer']),
      ),
    ).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })

  it('enforces assignment on direct specification reads for ordinary users', async () => {
    const { db, query } = makeDb([[{ id: 42 }], []])
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'get_specification_items', specificationId: 42 },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'requirements_specifications specification_record',
      ),
      [42, 'SE5560000001-user1'],
    )

    await expect(
      service.assertAuthorized(
        { kind: 'get_specification_items', specificationId: 42 },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'specification_author_required' },
    })
  })

  it('requires non-Admin AI calls to choose one authorized scope', async () => {
    const { db, query } = makeDb()
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        { kind: 'generate_requirements' },
        makeContext([]),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'ai_scope_required' },
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('allows a requirement-area author to use that AI scope', async () => {
    const { db, query } = makeDb([[{ id: 7 }]])
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        {
          kind: 'generate_requirements',
          scopeId: 7,
          scopeType: 'requirement_area',
        },
        makeContext([]),
      ),
    ).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('area.id = @0'),
      [7, 'SE5560000001-user1'],
    )
  })

  it('does not let Admin alone publish a requirement', async () => {
    const { db } = makeDb([[requirementTargetRow()]])
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        {
          id: 11,
          kind: 'transition_requirement',
          toStatusId: STATUS_PUBLISHED,
        },
        makeContext(['Admin']),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'reviewer_required' },
    })
  })

  it('allows Admin to perform non-reviewer requirement transitions', async () => {
    const { db, query } = makeDb([[requirementTargetRow()]])
    const service = new AssignmentBasedAuthorizationService(db)

    await expect(
      service.assertAuthorized(
        {
          id: 11,
          kind: 'transition_requirement',
          toStatusId: STATUS_DRAFT,
        },
        makeContext(['Admin']),
      ),
    ).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
