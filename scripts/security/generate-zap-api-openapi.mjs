#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

export const DEFAULT_SOURCE = 'openapi/requirements-api.yaml'
export const DEFAULT_OUTPUT = 'test-results/security-dast-api/openapi.json'

export const DEFAULT_ALLOWED_OPERATIONS = Object.freeze([
  { method: 'get', path: '/api/auth/me' },
  { method: 'get', path: '/api/requirements' },
  { method: 'get', path: '/api/requirements/{id}' },
  { method: 'get', path: '/api/requirements/{id}/versions/{version}' },
  { method: 'get', path: '/api/requirement-areas' },
  { method: 'get', path: '/api/requirement-categories' },
  { method: 'get', path: '/api/requirement-types' },
  { method: 'get', path: '/api/requirement-statuses' },
  { method: 'get', path: '/api/requirement-packages' },
  { method: 'get', path: '/api/quality-characteristics' },
  { method: 'get', path: '/api/priority-levels' },
  { method: 'get', path: '/api/norm-references' },
])

const HTTP_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
])

function readArg(argv, name, defaultValue) {
  const index = argv.indexOf(name)
  if (index === -1) return defaultValue
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function normalizeAllowedOperation(operation) {
  const method = String(operation.method ?? '').toLowerCase()
  const operationPath = String(operation.path ?? '')
  if (!HTTP_METHODS.has(method)) {
    throw new Error(`Unsupported OpenAPI method in allowlist: ${method}`)
  }
  if (!operationPath.startsWith('/')) {
    throw new Error(
      `OpenAPI allowlist path must start with "/": ${operationPath}`,
    )
  }
  return { method, path: operationPath }
}

export function filterOpenApiDocument(
  document,
  allowedOperations = DEFAULT_ALLOWED_OPERATIONS,
) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('OpenAPI document must be an object')
  }
  if (!document.paths || typeof document.paths !== 'object') {
    throw new Error('OpenAPI document must contain a paths object')
  }

  const allowed = allowedOperations.map(normalizeAllowedOperation)
  const paths = {}

  for (const operation of allowed) {
    const sourcePathItem = document.paths[operation.path]
    if (!sourcePathItem || typeof sourcePathItem !== 'object') {
      throw new Error(`Allowlisted OpenAPI path is missing: ${operation.path}`)
    }
    const sourceOperation = sourcePathItem[operation.method]
    if (!sourceOperation || typeof sourceOperation !== 'object') {
      throw new Error(
        `Allowlisted OpenAPI operation is missing: ${operation.method.toUpperCase()} ${operation.path}`,
      )
    }

    const targetPathItem = paths[operation.path] ?? {}
    for (const [key, value] of Object.entries(sourcePathItem)) {
      if (!HTTP_METHODS.has(key.toLowerCase())) {
        targetPathItem[key] = value
      }
    }
    targetPathItem[operation.method] = sourceOperation
    paths[operation.path] = targetPathItem
  }

  return {
    ...document,
    info: {
      ...document.info,
      description:
        'Filtered read-only ZAP API scan contract derived from openapi/requirements-api.yaml.',
      title: `${document.info?.title ?? 'Kravhantering API'} (ZAP read-only)`,
    },
    paths,
  }
}

export function generateZapApiOpenApi({
  allowedOperations = DEFAULT_ALLOWED_OPERATIONS,
  fsImpl = fs,
  output = DEFAULT_OUTPUT,
  source = DEFAULT_SOURCE,
} = {}) {
  const raw = fsImpl.readFileSync(source, 'utf8')
  const document = loadYaml(raw)
  const filtered = filterOpenApiDocument(document, allowedOperations)
  fsImpl.mkdirSync(path.dirname(output), { recursive: true })
  fsImpl.writeFileSync(output, `${JSON.stringify(filtered, null, 2)}\n`)
  return filtered
}

export function isDirectRun(argv = process.argv, metaUrl = import.meta.url) {
  return argv[1] != null && path.resolve(argv[1]) === fileURLToPath(metaUrl)
}

if (isDirectRun()) {
  try {
    generateZapApiOpenApi({
      output: readArg(process.argv, '--output', DEFAULT_OUTPUT),
      source: readArg(process.argv, '--source', DEFAULT_SOURCE),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[generate-zap-api-openapi] ${message}`)
    process.exit(1)
  }
}
