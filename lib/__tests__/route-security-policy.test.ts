import { describe, expect, it } from 'vitest'
import {
  compileRestRouteRegistry,
  REST_OPERATIONS,
  REST_ROUTE_REGISTRY,
  type RestOperationDeclaration,
  resolveRestPathPolicy,
} from '@/lib/http/route-security-policy'

const validDeclaration = [
  'GET',
  '/api/widgets/[id]',
  'session',
  'none',
  'authenticated',
  'framework-default',
  'focused',
] as const satisfies RestOperationDeclaration

describe('REST route security policy registry', () => {
  it('contains the complete explicit REST operation baseline', () => {
    expect(REST_OPERATIONS).toHaveLength(217)
    expect(
      REST_OPERATIONS.filter(operation => operation.contract === 'openapi'),
    ).toHaveLength(30)
    expect(
      REST_ROUTE_REGISTRY.resolve('GET', '/api/ai/authoring-profiles'),
    ).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      registered: true,
    })
  })

  it('matches dynamic templates while preferring literals segment by segment', () => {
    expect(
      REST_ROUTE_REGISTRY.resolve(
        'GET',
        'https://example.test/api/requirements/export?locale=sv#ignored',
      ),
    ).toMatchObject({
      registered: true,
      template: '/api/requirements/export',
    })
    expect(
      REST_ROUTE_REGISTRY.resolve('GET', '/api/requirements/REQ-42'),
    ).toMatchObject({
      registered: true,
      template: '/api/requirements/[id]',
    })
    expect(
      REST_ROUTE_REGISTRY.resolve('PUT', '/api/requirements/export').registered,
    ).toBe(false)
  })

  it('normalizes trailing slashes without decoding encoded slashes', () => {
    expect(
      REST_ROUTE_REGISTRY.resolve(
        'GET',
        '/api/requirements/REQ-42/versions/3/',
      ),
    ).toMatchObject({
      registered: true,
      template: '/api/requirements/[id]/versions/[version]',
    })
    expect(
      REST_ROUTE_REGISTRY.resolve(
        'GET',
        '/api/requirements/REQ%2F42/versions/3',
      ),
    ).toMatchObject({
      registered: true,
      template: '/api/requirements/[id]/versions/[version]',
    })
    expect(
      REST_ROUTE_REGISTRY.resolve('GET', '/api/requirements/REQ/42/versions/3')
        .registered,
    ).toBe(false)
  })

  it('preserves path case', () => {
    expect(
      REST_ROUTE_REGISTRY.resolve('GET', '/api/Requirements/REQ-42').registered,
    ).toBe(false)
  })

  it('derives HEAD from GET and OPTIONS from the path policy without CSRF', () => {
    expect(
      REST_ROUTE_REGISTRY.resolve('HEAD', '/api/privacy/erasure-preview'),
    ).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      method: 'HEAD',
      registered: false,
    })
    expect(REST_ROUTE_REGISTRY.resolve('HEAD', '/api/auth/me')).toMatchObject({
      auth: 'public',
      cache: 'no-store',
      method: 'HEAD',
      registered: true,
      template: '/api/auth/me',
    })
    expect(
      REST_ROUTE_REGISTRY.resolve('OPTIONS', '/api/privacy/erasure-preview'),
    ).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      csrf: 'none',
      method: 'OPTIONS',
      registered: true,
      template: '/api/privacy/erasure-preview',
    })
  })

  it('uses the conservative baseline for unknown operations', () => {
    expect(REST_ROUTE_REGISTRY.resolve('POST', '/api/does-not-exist')).toEqual({
      auth: 'session',
      cache: 'no-store',
      contract: 'focused',
      csrf: 'same-origin',
      method: 'POST',
      registered: false,
      sensitivity: 'sensitive',
      template: null,
    })
  })

  it.each([
    {
      declaration: validDeclaration,
      expected: 'Duplicate REST operation',
      extra: validDeclaration,
    },
    {
      declaration: validDeclaration,
      expected: 'Ambiguous REST operation template',
      extra: [
        'GET',
        '/api/widgets/[widgetId]',
        'session',
        'none',
        'authenticated',
        'framework-default',
        'focused',
      ] as const satisfies RestOperationDeclaration,
    },
    {
      declaration: validDeclaration,
      expected: 'Noncanonical REST route template',
      extra: [
        'GET',
        '/api/widgets/[...id]',
        'session',
        'none',
        'authenticated',
        'framework-default',
        'focused',
      ] as const satisfies RestOperationDeclaration,
    },
  ])(
    'rejects invalid registry declarations',
    ({ declaration, expected, extra }) => {
      expect(() => compileRestRouteRegistry([declaration, extra])).toThrow(
        expected,
      )
    },
  )

  it('rejects cross-method parameter ambiguity without weakening path policy', () => {
    const read = [
      'GET',
      '/api/widgets/[id]',
      'public',
      'none',
      'public',
      'framework-default',
      'focused',
    ] as const satisfies RestOperationDeclaration
    const writeWithDifferentParameter = [
      'POST',
      '/api/widgets/[widgetId]',
      'session',
      'same-origin',
      'sensitive',
      'no-store',
      'focused',
    ] as const satisfies RestOperationDeclaration

    expect(() =>
      compileRestRouteRegistry([read, writeWithDifferentParameter]),
    ).toThrow('Ambiguous REST operation template')

    const registry = compileRestRouteRegistry([
      read,
      [
        'POST',
        '/api/widgets/[id]',
        'session',
        'same-origin',
        'sensitive',
        'no-store',
        'focused',
      ],
    ])

    expect(registry.resolvePath('/api/widgets/42')).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      csrf: 'same-origin',
      sensitivity: 'sensitive',
      template: '/api/widgets/[id]',
    })
    expect(registry.resolve('OPTIONS', '/api/widgets/42')).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      csrf: 'none',
      sensitivity: 'sensitive',
      template: '/api/widgets/[id]',
    })
  })

  it('rejects implicit or unsafe policy combinations', () => {
    expect(() =>
      compileRestRouteRegistry([
        [
          'POST',
          '/api/widgets',
          'session',
          'none',
          'authenticated',
          'framework-default',
          'focused',
        ],
      ]),
    ).toThrow('REST mutation must require same-origin CSRF')

    expect(() =>
      compileRestRouteRegistry([
        [
          'GET',
          '/api/secrets',
          'session',
          'none',
          'sensitive',
          'framework-default',
          'focused',
        ],
      ]),
    ).toThrow('Sensitive REST response must use no-store')

    expect(() =>
      compileRestRouteRegistry([
        [
          'get',
          '/api/widgets',
          'session',
          'none',
          'authenticated',
          'framework-default',
          'focused',
        ] as unknown as RestOperationDeclaration,
      ]),
    ).toThrow('Invalid explicit REST operation policy')

    expect(() =>
      compileRestRouteRegistry([
        [
          'GET',
          '/api/widgets/..',
          'session',
          'none',
          'authenticated',
          'framework-default',
          'focused',
        ],
      ]),
    ).toThrow('Noncanonical REST route template')

    expect(() =>
      compileRestRouteRegistry([
        [
          'GET',
          '/api/widgets',
          'session',
          'same-origin',
          'authenticated',
          'framework-default',
          'focused',
        ],
      ]),
    ).toThrow('Safe REST operation cannot require CSRF')

    expect(() =>
      compileRestRouteRegistry([
        [
          'POST',
          '/api/widgets',
          'public',
          'same-origin',
          'authenticated',
          'framework-default',
          'focused',
        ],
      ]),
    ).toThrow('Only logout may combine public auth and CSRF')
  })

  it('resolves aggregate path policy through the public helper', () => {
    expect(resolveRestPathPolicy('/api/admin/ai-connections')).toMatchObject({
      auth: 'session',
      cache: 'no-store',
      csrf: 'same-origin',
      sensitivity: 'sensitive',
    })
  })

  it('resolves every registered operation through the compiled indexes', () => {
    for (const operation of REST_OPERATIONS) {
      const concretePath = operation.template.replace(
        /\[[A-Za-z][A-Za-z0-9]*\]/g,
        'value',
      )
      expect(
        REST_ROUTE_REGISTRY.resolve(operation.method, concretePath),
      ).toMatchObject({
        method: operation.method,
        registered: true,
        template: operation.template,
      })
    }
  })
})
