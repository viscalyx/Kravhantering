import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai-safety',
    request: {
      method: 'POST',
      path: '/api/admin/ai-safety-rules',
      requestId: 'request-ai-safety',
    },
    requestId: 'request-ai-safety',
    source: 'rest',
  })),
  createAiSafetyRuleTerm: vi.fn(),
  createRequestContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai-safety',
    request: {
      method: 'GET',
      path: '/api/admin/ai-safety-rules',
      requestId: 'request-ai-safety',
    },
    requestId: 'request-ai-safety',
    source: 'rest',
  })),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  listAiSafetyRulesForAdmin: vi.fn(),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
  removeAiSafetyRuleTerms: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    routeState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    routeState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ai-safety-rules', () => ({
  AI_SAFETY_RULE_IDS: [
    'encoded_smuggling',
    'harmful_generation_request',
    'instruction_override',
    'secret_extraction_request',
    'sensitive_backend_leak',
    'system_prompt_extraction',
  ],
  AI_SAFETY_TERM_DIRECTIONS: ['input', 'output', 'input_output'],
  AI_SAFETY_TERM_TYPES: ['action', 'coding', 'direct_marker', 'target'],
  createAiSafetyRuleTerm: routeState.createAiSafetyRuleTerm,
  listAiSafetyRulesForAdmin: routeState.listAiSafetyRulesForAdmin,
  removeAiSafetyRuleTerms: routeState.removeAiSafetyRuleTerms,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

import {
  POST as CREATE_TERM_POST,
  GET,
} from '@/app/api/admin/ai-safety-rules/route'
import { POST as REMOVE_TERMS_POST } from '@/app/api/admin/ai-safety-rules/terms/remove/route'

const createdTerm = {
  direction: 'input',
  id: 77,
  isActive: true,
  isStandard: false,
  normalizedTerm: 'ignore previous',
  standardDirection: 'input',
  termText: 'Ignore previous',
  termType: 'action',
}

function jsonPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

describe('admin AI safety rules routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createAiSafetyRuleTerm.mockResolvedValue(createdTerm)
    routeState.listAiSafetyRulesForAdmin.mockResolvedValue([])
    routeState.removeAiSafetyRuleTerms.mockResolvedValue({
      deactivatedStandardCount: 1,
      deletedCustomCount: 1,
    })
  })

  it('returns AI safety rules with no-store for Admin users', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/ai-safety-rules'),
    )

    await expect(response.json()).resolves.toEqual({ rules: [] })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.listAiSafetyRulesForAdmin).toHaveBeenCalledWith({
      db: true,
    })
  })

  it('creates a term and records the persisted inputs in privileged audit', async () => {
    const payload = {
      direction: 'input',
      ruleId: 'instruction_override',
      termText: 'Ignore previous',
      termType: 'action',
    }

    const response = await CREATE_TERM_POST(
      jsonPost('https://example.test/api/admin/ai-safety-rules', payload),
    )

    await expect(response.json()).resolves.toEqual({ term: createdTerm })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.createAiSafetyRuleTerm).toHaveBeenCalledWith(
      { db: true },
      payload,
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-ai-safety' }),
      {
        changedFields: ['direction', 'ruleId', 'termText', 'termType'],
        details: payload,
        operation: 'create',
        resourceId: createdTerm.id,
        resourceType: 'ai_safety_rule_term',
      },
    )
  })

  it('decorates create validation errors with no-store before handler work', async () => {
    const response = await CREATE_TERM_POST(
      jsonPost('https://example.test/api/admin/ai-safety-rules', {
        direction: 'input',
        ruleId: 'instruction_override',
        termText: '',
        termType: 'action',
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.createAiSafetyRuleTerm).not.toHaveBeenCalled()
  })

  it('records batch term removals as deactivate-or-delete audit changes', async () => {
    const response = await REMOVE_TERMS_POST(
      jsonPost('https://example.test/api/admin/ai-safety-rules/terms/remove', {
        termIds: [11, 12],
      }),
    )

    await expect(response.json()).resolves.toEqual({
      deactivatedStandardCount: 1,
      deletedCustomCount: 1,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.removeAiSafetyRuleTerms).toHaveBeenCalledWith(
      { db: true },
      [11, 12],
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-ai-safety' }),
      {
        changedFields: ['isActive', 'deleted'],
        itemCount: 2,
        operation: 'delete',
        resourceId: 'batch',
        resourceType: 'ai_safety_rule_term',
      },
    )
  })
})
