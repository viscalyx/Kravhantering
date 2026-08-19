import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRouteHandlerBrand,
  type RouteHandlerBrand,
} from '@/lib/http/response-policy'
import {
  type ExplicitRestMethod,
  REST_OPERATIONS,
} from '@/lib/http/route-security-policy'

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))
vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))

beforeEach(() => vi.clearAllMocks())

const HTTP_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
])
const MUTATING_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])

const routeModules = (
  import.meta as ImportMeta & {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob('../../app/api/**/route.ts')

function routeTemplate(moduleKey: string): string {
  return moduleKey.replace(/^\.\.\/\.\.\/app/, '').replace(/\/route\.ts$/, '')
}

function moduleLoader(template: string) {
  const key = `../../app${template}/route.ts`
  const loader = routeModules[key]
  if (!loader) throw new Error(`Missing route module loader for ${template}`)
  return loader
}

describe('REST route registry coverage', () => {
  it('exactly matches route filenames and actual route-module exports', async () => {
    const discovered: string[] = []

    for (const [moduleKey, loader] of Object.entries(routeModules)) {
      const template = routeTemplate(moduleKey)
      if (template === '/api/mcp') continue
      let module: Record<string, unknown>
      try {
        module = (await loader()) as Record<string, unknown>
      } catch (error) {
        throw new Error(`Could not load route module ${moduleKey}`, {
          cause: error,
        })
      }
      for (const method of Object.keys(module).filter(key =>
        HTTP_METHODS.has(key),
      )) {
        discovered.push(`${method} ${template}`)
      }
    }

    const registered = REST_OPERATIONS.map(
      operation => `${operation.method} ${operation.template}`,
    )
    expect(Object.keys(routeModules)).toHaveLength(151)
    expect(discovered.sort()).toEqual(registered.sort())
  }, 30_000)

  it('brands every mutation with an approved wrapper', async () => {
    const failures: string[] = []

    for (const operation of REST_OPERATIONS) {
      if (!MUTATING_METHODS.has(operation.method)) continue
      const module = (await moduleLoader(operation.template)()) as Record<
        string,
        unknown
      >
      const expected: RouteHandlerBrand =
        operation.template === '/api/auth/logout'
          ? 'logout-mutation'
          : 'mutation'
      if (getRouteHandlerBrand(module[operation.method]) !== expected) {
        failures.push(`${operation.method} ${operation.template}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('brands every restrictive read with the response-policy wrapper', async () => {
    const failures: string[] = []

    for (const operation of REST_OPERATIONS) {
      if (
        operation.method !== 'GET' ||
        operation.cache === 'framework-default'
      ) {
        continue
      }
      const module = (await moduleLoader(operation.template)()) as Record<
        ExplicitRestMethod,
        unknown
      >
      if (getRouteHandlerBrand(module.GET) !== 'response-policy') {
        failures.push(`${operation.method} ${operation.template}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('keeps MCP as the sole bearer transport and direct mutation exception', async () => {
    const module = (await moduleLoader('/api/mcp')()) as Record<string, unknown>

    expect(
      Object.keys(module)
        .filter(key => HTTP_METHODS.has(key))
        .sort(),
    ).toEqual(['DELETE', 'GET', 'POST'])
    expect(getRouteHandlerBrand(module.POST)).toBeUndefined()
    expect(getRouteHandlerBrand(module.DELETE)).toBeUndefined()
  })
})
/// <reference types="vite/client" />
