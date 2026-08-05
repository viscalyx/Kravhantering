import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBrowserLinkUri } from '@/lib/norm-references/browser-link-uri'
import type { RequestContext } from '@/lib/requirements/auth'
import {
  normReferenceMutationPolicy,
  requireNormReferencePermission,
} from '@/lib/requirements/norm-reference-permissions'
import {
  requireRequirementPackageCreatePermission,
  requireRequirementPackageLeadOrAdmin,
  requireRequirementPackagePermission,
} from '@/lib/requirements/requirement-package-permissions'

const permissionState = vi.hoisted(() => ({ canAuthorAnyArea: vi.fn() }))
vi.mock('@/lib/dal/requirement-areas', () => ({
  canAuthorAnyArea: permissionState.canAuthorAnyArea,
}))

function context(
  roles: string[] = [],
  options: { authenticated?: boolean; hsaId?: string | null } = {},
): RequestContext {
  return {
    actor: {
      displayName: 'Authorization test actor',
      hsaId: options.hsaId === undefined ? 'SE5560000001-actor' : options.hsaId,
      id: 'route-test',
      isAuthenticated: options.authenticated ?? true,
      roles,
      source: 'oidc',
    },
    correlationId: 'route-test-correlation',
    requestId: 'route-test-request',
    source: 'rest',
  }
}

describe('norm-reference permissions', () => {
  it.each([
    'norm_reference.archive',
    'norm_reference.delete',
    'norm_reference.reactivate',
    'norm_reference.update',
  ] as const)('allows admins and rejects non-admins for %s', permission => {
    expect(() =>
      requireNormReferencePermission(context(['Admin']), permission),
    ).not.toThrow()
    expect(() =>
      requireNormReferencePermission(context([]), permission),
    ).toThrowError(expect.objectContaining({ code: 'forbidden', status: 403 }))
  })

  it('requires authentication and exposes the same check through the mutation policy', async () => {
    expect(() =>
      requireNormReferencePermission(
        context([], { authenticated: false }),
        'norm_reference.update',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'unauthorized', status: 401 }),
    )

    const policy = normReferenceMutationPolicy('norm_reference.archive')
    expect(policy).toMatchObject({
      kind: 'custom',
      name: 'norm_reference.archive',
    })
    if (policy.kind !== 'custom') throw new Error('Expected custom policy')
    expect(() =>
      policy.authorize({
        body: {},
        context: context(['Admin']),
        params: {},
        request: new Request('https://example.test/api/norm-references/1'),
      }),
    ).not.toThrow()
  })
})

describe('requirement-package permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionState.canAuthorAnyArea.mockResolvedValue(true)
  })

  it.each([
    'requirement_package.archive',
    'requirement_package.co_authors.update',
    'requirement_package.delete',
    'requirement_package.reactivate',
    'requirement_package.update',
  ] as const)('enforces the admin-only static permission %s', permission => {
    expect(() =>
      requireRequirementPackagePermission(context(['Admin']), permission),
    ).not.toThrow()
    expect(() =>
      requireRequirementPackagePermission(context([]), permission),
    ).toThrowError(expect.objectContaining({ code: 'forbidden', status: 403 }))
  })

  it('rejects unauthenticated static permission checks', () => {
    expect(() =>
      requireRequirementPackagePermission(
        context([], { authenticated: false }),
        'requirement_package.delete',
      ),
    ).toThrowError(expect.objectContaining({ code: 'unauthorized' }))
  })

  it('allows authors to create and reports missing HSA-id or area access', async () => {
    const db = {} as Parameters<
      typeof requireRequirementPackageCreatePermission
    >[0]
    await expect(
      requireRequirementPackageCreatePermission(db, context(['Admin'])),
    ).resolves.toBeUndefined()
    expect(permissionState.canAuthorAnyArea).toHaveBeenCalledWith(
      db,
      'SE5560000001-actor',
      true,
    )

    await expect(
      requireRequirementPackageCreatePermission(
        db,
        context([], { hsaId: null }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      requireRequirementPackageCreatePermission(
        db,
        context([], { authenticated: false }),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    permissionState.canAuthorAnyArea.mockResolvedValue(false)
    await expect(
      requireRequirementPackageCreatePermission(db, context([])),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'requirement_area_author_required' },
    })
  })

  it('allows admins and matching leads while rejecting every lead boundary', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 7 }])
    const db = { query } as unknown as Parameters<
      typeof requireRequirementPackageLeadOrAdmin
    >[0]
    await expect(
      requireRequirementPackageLeadOrAdmin(
        db,
        context(['Admin']),
        7,
        'requirement_package.update',
      ),
    ).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()

    await expect(
      requireRequirementPackageLeadOrAdmin(
        db,
        context([]),
        7,
        'requirement_package.update',
      ),
    ).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('lead_hsa_id = @1'),
      [7, 'SE5560000001-actor'],
    )

    query.mockResolvedValue([])
    await expect(
      requireRequirementPackageLeadOrAdmin(
        db,
        context([]),
        8,
        'requirement_package.co_authors.update',
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'package_lead_required', requirementPackageId: 8 },
    })
    await expect(
      requireRequirementPackageLeadOrAdmin(
        db,
        context([], { hsaId: null }),
        8,
        'requirement_package.update',
      ),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      requireRequirementPackageLeadOrAdmin(
        db,
        context([], { authenticated: false }),
        8,
        'requirement_package.update',
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' })
  })
})

describe('browser-link URI policy', () => {
  it('accepts trimmed HTTP(S) and rejects empty, malformed, and unsafe protocols', () => {
    expect(getBrowserLinkUri(' https://example.test/path ')).toBe(
      'https://example.test/path',
    )
    expect(getBrowserLinkUri('http://example.test')).toBe('http://example.test')
    expect(getBrowserLinkUri(null)).toBeNull()
    expect(getBrowserLinkUri('   ')).toBeNull()
    expect(getBrowserLinkUri('not a URL')).toBeNull()
    expect(getBrowserLinkUri('javascript:alert(1)')).toBeNull()
  })
})
