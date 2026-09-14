import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import { conflictError, forbiddenError } from '@/lib/requirements/errors'

const boundary = vi.hoisted(() => ({
  authorize: vi.fn(),
  context: vi.fn(),
  database: vi.fn(),
  denied: vi.fn(),
  read: vi.fn(),
  compare: vi.fn(),
  mutate: vi.fn(),
}))
const context = {
  actor: {
    displayName: 'Owner',
    hsaId: 'SE5560000001-owner',
    id: 'owner',
    isAuthenticated: true,
    roles: [],
    source: 'oidc',
  },
  correlationId: 'agreement-route',
  requestId: 'agreement-route',
  source: 'rest',
}
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: boundary.database,
}))
vi.mock('@/lib/audit/action-audit', async original => ({
  ...(await original<typeof import('@/lib/audit/action-audit')>()),
  recordDeniedActionAuditEvent: boundary.denied,
}))
vi.mock('@/lib/requirements/auth', async original => ({
  ...(await original<typeof import('@/lib/requirements/auth')>()),
  createDefaultAuthorizationService: () => ({
    assertAuthorized: boundary.authorize,
  }),
  createRequestContext: boundary.context,
}))
vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: async () => ({
    db: {},
    context: await boundary.context(),
  }),
}))
vi.mock('@/lib/specifications/agreements', () => ({
  createSpecificationAgreementWorkflow: () => ({
    read: boundary.read,
    compare: boundary.compare,
    mutate: boundary.mutate,
  }),
}))

import {
  GET,
  POST,
} from '@/app/api/requirements-specifications/[id]/agreement/route'

const url = 'http://localhost:3000/api/requirements-specifications/5/agreement'
const params = () => ({ params: Promise.resolve({ id: '5' }) })
function mutation(body: unknown, csrf = true) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf
        ? {
            Origin: 'http://localhost:3000',
            'X-Requested-With': 'XMLHttpRequest',
          }
        : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('specification agreement REST contract', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    boundary.context.mockResolvedValue(context)
    boundary.database.mockResolvedValue({})
    boundary.authorize.mockResolvedValue(undefined)
    boundary.read.mockResolvedValue({
      establishmentStatus: 'editable',
      currentItems: [],
    })
    boundary.mutate.mockResolvedValue({ amendmentId: 17 })
  })
  it('maps authentication-boundary CSRF rejection before entering the mutation interface', async () => {
    boundary.context.mockRejectedValueOnce(
      new CsrfError('Cross-origin request rejected.'),
    )
    const response = await POST(
      mutation({ operation: 'confirm_editable', reason: 'Assessment' }, false),
      params(),
    )
    expect(response.status).toBe(403)
    expect(boundary.mutate).not.toHaveBeenCalled()
  })
  it.each([
    { operation: 'adopt', itemRef: 'lib:1', targetVersionId: 4, reason: '' },
    {
      operation: 'adopt',
      itemRef: 'lib:1',
      targetVersionId: 4,
      reason: 'Reason',
      specificationItemStatusId: 4,
    },
    {
      operation: 'prepare_amendment',
      reason: 'Reason',
      agreementReference: 'A',
      effectiveDate: '2027-02-30',
      changes: [],
    },
    { operation: 'decide_amendment', amendmentId: -1 },
  ])('rejects malformed or unsupported mutation fields', async body => {
    expect((await POST(mutation(body), params())).status).toBe(400)
    expect(boundary.mutate).not.toHaveBeenCalled()
  })
  it('preserves authorization denial and workflow conflicts', async () => {
    boundary.authorize.mockRejectedValueOnce(forbiddenError())
    expect(
      (
        await POST(
          mutation({ operation: 'decide_amendment', amendmentId: 17 }),
          params(),
        )
      ).status,
    ).toBe(403)
    expect(boundary.mutate).not.toHaveBeenCalled()
    boundary.mutate.mockRejectedValueOnce(conflictError('Source changed'))
    expect(
      (
        await POST(
          mutation({ operation: 'decide_amendment', amendmentId: 17 }),
          params(),
        )
      ).status,
    ).toBe(409)
  })
  it('passes the exact selected target and trimmed reason and returns no-store JSON', async () => {
    const response = await POST(
      mutation({
        operation: 'adopt',
        itemRef: 'lib:1',
        targetVersionId: 4,
        reason: '  Clarification  ',
      }),
      params(),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(boundary.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ actor: context.actor }),
      5,
      {
        operation: 'adopt',
        itemRef: 'lib:1',
        targetVersionId: 4,
        reason: 'Clarification',
      },
    )
  })
  it('reads agreement context and compares only a valid library binding', async () => {
    expect((await GET(new NextRequest(url), params())).status).toBe(200)
    boundary.compare.mockResolvedValue({
      pinned: { id: 1 },
      published: { id: 2 },
    })
    const response = await GET(
      new NextRequest(`${url}?itemRef=lib:1`),
      params(),
    )
    expect(await response.json()).toEqual({
      pinned: { id: 1 },
      published: { id: 2 },
    })
    expect(
      (await GET(new NextRequest(`${url}?itemRef=local:1`), params())).status,
    ).toBe(400)
  })
  it.each([
    ['co-author', [], true],
    ['reviewer', ['Reviewer'], false],
    ['admin', ['Admin'], false],
    ['unassigned', [], false],
  ] as const)(
    'rejects establishment and amendment decisions by a %s through the real workflow',
    async (_name, roles, coAuthor) => {
      const { createSpecificationAgreementWorkflow } = await vi.importActual<
        typeof import('@/lib/specifications/agreements')
      >('@/lib/specifications/agreements')
      const query = vi.fn(async (sql: string) =>
        sql.includes('SELECT establishment_status')
          ? [
              {
                establishmentStatus: 'editable',
                responsibleHsaId: 'SE5560000001-responsible',
              },
            ]
          : coAuthor
            ? [{ hsaId: context.actor.hsaId }]
            : [],
      )
      const transaction = vi.fn(
        async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
          work({ query }),
      )
      const workflow = createSpecificationAgreementWorkflow({
        transaction,
      } as unknown as Parameters<
        typeof createSpecificationAgreementWorkflow
      >[0])
      boundary.context.mockResolvedValue({
        ...context,
        actor: { ...context.actor, roles: [...roles] },
      })
      boundary.mutate.mockImplementation(workflow.mutate)
      for (const body of [
        {
          operation: 'establish',
          reason: 'Agreement',
          agreementReference: 'A',
          effectiveDate: '2027-06-01',
        },
        { operation: 'decide_amendment', amendmentId: 17 },
      ]) {
        const response = await POST(mutation(body), params())
        expect(response.status).toBe(403)
        expect(response.headers.get('Cache-Control')).toContain('no-store')
        expect(await response.json()).toMatchObject({
          code: 'forbidden',
          error: 'Forbidden',
        })
      }
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDLOCK, HOLDLOCK'),
        [5],
      )
      expect(
        query.mock.calls.every(([sql]) => sql.trimStart().startsWith('SELECT')),
      ).toBe(true)
    },
  )
  it.each(['read', 'compare'] as const)(
    '%s uses a shared transaction lock when checking agreement access',
    async operation => {
      const { createSpecificationAgreementWorkflow } = await vi.importActual<
        typeof import('@/lib/specifications/agreements')
      >('@/lib/specifications/agreements')
      const query = vi
        .fn()
        .mockResolvedValueOnce([
          {
            establishmentStatus: 'editable',
            responsibleHsaId: 'SE5560000001-other',
          },
        ])
        .mockResolvedValue([])
      const transaction = vi.fn(
        async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
          work({ query }),
      )
      const workflow = createSpecificationAgreementWorkflow({
        transaction,
      } as unknown as Parameters<
        typeof createSpecificationAgreementWorkflow
      >[0])
      const actorContext = context as Parameters<typeof workflow.read>[0]
      await expect(
        operation === 'read'
          ? workflow.read(actorContext, 5)
          : workflow.compare(actorContext, 5, 'lib:1'),
      ).rejects.toMatchObject({ code: 'forbidden' })
      expect(transaction).toHaveBeenCalledOnce()
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WITH (HOLDLOCK)'),
        [5],
      )
    },
  )
})
