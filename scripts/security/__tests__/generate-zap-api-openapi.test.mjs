import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import {
  filterOpenApiDocument,
  generateZapApiOpenApi,
} from '../generate-zap-api-openapi.mjs'

const tempDirs = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zap-api-openapi-'))
  tempDirs.push(dir)
  return dir
}

function sampleDocument() {
  return {
    components: {
      schemas: {
        Result: { type: 'object' },
      },
    },
    info: {
      description: 'Source contract',
      title: 'Source API',
      version: '1.0.0',
    },
    openapi: '3.0.3',
    paths: {
      '/api/requirements': {
        get: {
          operationId: 'listRequirements',
          responses: { 200: { description: 'OK' } },
        },
        parameters: [{ name: 'locale', in: 'query' }],
        post: {
          operationId: 'createRequirement',
          responses: { 201: { description: 'Created' } },
        },
      },
      '/api/requirements/{id}': {
        get: {
          operationId: 'getRequirement',
          responses: { 200: { description: 'OK' } },
        },
        parameters: [{ name: 'id', in: 'path', required: true }],
      },
    },
    security: [{ cookieSession: [] }],
    servers: [{ url: 'http://localhost:3001' }],
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('filterOpenApiDocument', () => {
  it('preserves metadata and emits only allowlisted operations', () => {
    const filtered = filterOpenApiDocument(sampleDocument(), [
      { method: 'get', path: '/api/requirements' },
      { method: 'get', path: '/api/requirements/{id}' },
    ])

    expect(filtered.openapi).toBe('3.0.3')
    expect(filtered.servers).toEqual([{ url: 'http://localhost:3001' }])
    expect(filtered.security).toEqual([{ cookieSession: [] }])
    expect(filtered.components).toEqual({
      schemas: {
        Result: { type: 'object' },
      },
    })
    expect(filtered.info).toMatchObject({
      description:
        'Filtered read-only ZAP API scan contract derived from openapi/requirements-api.yaml.',
      title: 'Source API (ZAP read-only)',
      version: '1.0.0',
    })
    expect(Object.keys(filtered.paths)).toEqual([
      '/api/requirements',
      '/api/requirements/{id}',
    ])
    expect(filtered.paths['/api/requirements']).toHaveProperty('get')
    expect(filtered.paths['/api/requirements']).not.toHaveProperty('post')
    expect(filtered.paths['/api/requirements'].parameters).toEqual([
      { name: 'locale', in: 'query' },
    ])
  })

  it('rejects allowlisted paths and operations that do not exist', () => {
    expect(() =>
      filterOpenApiDocument(sampleDocument(), [
        { method: 'get', path: '/api/missing' },
      ]),
    ).toThrow('Allowlisted OpenAPI path is missing: /api/missing')

    expect(() =>
      filterOpenApiDocument(sampleDocument(), [
        { method: 'delete', path: '/api/requirements' },
      ]),
    ).toThrow(
      'Allowlisted OpenAPI operation is missing: DELETE /api/requirements',
    )
  })
})

describe('generateZapApiOpenApi', () => {
  it('writes a valid JSON OpenAPI document from YAML input', () => {
    const dir = makeTempDir()
    const source = path.join(dir, 'source.yaml')
    const output = path.join(dir, 'openapi.json')
    fs.writeFileSync(source, yaml.dump(sampleDocument()))

    const generated = generateZapApiOpenApi({
      allowedOperations: [{ method: 'get', path: '/api/requirements' }],
      output,
      source,
    })
    const parsed = JSON.parse(fs.readFileSync(output, 'utf8'))

    expect(parsed).toEqual(generated)
    expect(Object.keys(parsed.paths)).toEqual(['/api/requirements'])
  })
})
