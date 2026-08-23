import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  REST_OPERATIONS,
  type RestAuthPolicy,
  type RestCachePolicy,
  type RestCsrfPolicy,
} from '@/lib/http/route-security-policy'

interface OpenApiOperation {
  parameters?: Array<{ $ref?: string; name?: string }>
  security?: Array<Record<string, unknown>>
  'x-auth'?: RestAuthPolicy
  'x-cache'?: RestCachePolicy
  'x-csrf'?: RestCsrfPolicy
}

interface OpenApiSchema {
  nullable?: boolean
  oneOf?: OpenApiSchema[]
  properties?: Record<string, OpenApiSchema>
}

interface OpenApiDocument {
  components?: {
    schemas?: Record<string, OpenApiSchema>
  }
  paths: Record<string, Record<string, OpenApiOperation>>
  security?: Array<Record<string, unknown>>
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

async function openApiDocument(): Promise<OpenApiDocument> {
  const source = await readFile(
    path.join(process.cwd(), 'openapi/requirements-api.yaml'),
    'utf8',
  )
  return parse(source) as OpenApiDocument
}

function registryTemplate(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, '[$1]')
}

function openApiOperations(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([openApiPath, pathItem]) =>
    HTTP_METHODS.flatMap(method => {
      const operation = pathItem[method]
      return operation
        ? [
            {
              key: `${method.toUpperCase()} ${registryTemplate(openApiPath)}`,
              method,
              operation,
            },
          ]
        : []
    }),
  )
}

describe('REST registry and OpenAPI contract', () => {
  it('keeps the existing 30-operation OpenAPI scope exactly synchronized', async () => {
    const document = await openApiDocument()
    const contractOperations = openApiOperations(document)
    const registryOpenApi = REST_OPERATIONS.filter(
      operation => operation.contract === 'openapi',
    )

    expect(contractOperations).toHaveLength(30)
    expect(contractOperations.map(({ key }) => key).sort()).toEqual(
      registryOpenApi
        .map(operation => `${operation.method} ${operation.template}`)
        .sort(),
    )
  })

  it('agrees on explicit auth, CSRF, and cache declarations', async () => {
    const document = await openApiDocument()
    const registry = new Map(
      REST_OPERATIONS.map(operation => [
        `${operation.method} ${operation.template}`,
        operation,
      ]),
    )

    for (const { key, method, operation } of openApiOperations(document)) {
      const registered = registry.get(key)
      expect(registered, key).toBeDefined()
      expect(operation['x-auth'], `${key} auth`).toBe(registered?.auth)
      expect(operation['x-csrf'], `${key} CSRF`).toBe(registered?.csrf)
      expect(operation['x-cache'], `${key} cache`).toBe(registered?.cache)

      const effectiveSecurity = operation.security ?? document.security ?? []
      expect(effectiveSecurity.length === 0 ? 'public' : 'session').toBe(
        registered?.auth,
      )

      const parameterRefs = (operation.parameters ?? []).map(
        parameter => parameter.$ref ?? parameter.name ?? '',
      )
      if (registered?.csrf === 'same-origin') {
        expect(parameterRefs, `${key} Origin`).toContain(
          '#/components/parameters/Origin',
        )
        expect(parameterRefs, `${key} X-Requested-With`).toContain(
          '#/components/parameters/XRequestedWith',
        )
      } else {
        expect(
          parameterRefs.some(reference =>
            /Origin|XRequestedWith/.test(reference),
          ),
          `${method.toUpperCase()} ${key} safe-method CSRF parameters`,
        ).toBe(false)
      }
    }
  })

  it('keeps focused operations outside OpenAPI', async () => {
    const document = await openApiDocument()
    const contractKeys = new Set(
      openApiOperations(document).map(({ key }) => key),
    )

    for (const operation of REST_OPERATIONS) {
      if (operation.contract !== 'focused') continue
      expect(
        contractKeys.has(`${operation.method} ${operation.template}`),
      ).toBe(false)
    }
  })

  it('accepts null through exactly one data-subject value branch', async () => {
    const document = await openApiDocument()
    const value =
      document.components?.schemas?.DataSubjectExportItem?.properties?.value

    expect(value?.nullable).not.toBe(true)
    expect(value?.oneOf?.filter(branch => branch.nullable)).toHaveLength(1)
  })
})
