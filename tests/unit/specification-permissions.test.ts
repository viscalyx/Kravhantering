import { describe, expect, it } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  canCreateSpecification,
  canReadAllSpecifications,
  canReadSpecification,
  specificationPermissions,
} from '@/lib/specifications/permissions'

function makeContext(roles: string[], hsaId = 'SE5560000001-user1') {
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
  } satisfies RequestContext
}

const target = {
  coAuthorHsaIds: ['SE5560000001-coauthor1'],
  responsibleHsaId: 'SE5560000001-resp1',
}

describe('specification permissions', () => {
  it('exposes collection create permission only for authenticated actors with HSA-id', () => {
    expect(canCreateSpecification(makeContext([]))).toBe(true)
    expect(canCreateSpecification(makeContext([], ''))).toBe(false)
  })

  it('allows Admin and Reviewer to read all specifications', () => {
    expect(canReadAllSpecifications(makeContext(['Admin']))).toBe(true)
    expect(canReadAllSpecifications(makeContext(['Reviewer']))).toBe(true)
    expect(canReadAllSpecifications(makeContext([]))).toBe(false)
  })

  it('maps responsible users to edit, assignment, and AI capabilities', () => {
    const context = makeContext([], 'SE5560000001-resp1')

    expect(canReadSpecification(context, target)).toBe(true)
    expect(specificationPermissions(context, target)).toEqual({
      canEditContent: true,
      canManageAssignments: true,
      canReviewDecisions: false,
      canUseAi: true,
    })
  })

  it('maps co-authors to content-only specification capabilities', () => {
    const context = makeContext([], 'SE5560000001-coauthor1')

    expect(canReadSpecification(context, target)).toBe(true)
    expect(specificationPermissions(context, target)).toEqual({
      canEditContent: true,
      canManageAssignments: false,
      canReviewDecisions: false,
      canUseAi: true,
    })
  })

  it('maps Reviewer broad read to review-only capabilities', () => {
    const context = makeContext(['Reviewer'], 'SE5560000001-reviewer1')

    expect(canReadSpecification(context, target)).toBe(true)
    expect(specificationPermissions(context, target)).toEqual({
      canEditContent: false,
      canManageAssignments: false,
      canReviewDecisions: true,
      canUseAi: false,
    })
  })
})
