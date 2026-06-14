import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  isDirectRun,
  swaggerHtml,
} from '../openapi/generate-hsa-person-lookup-swagger-ui.mjs'

describe('HSA person lookup Swagger UI generator', () => {
  it('can render root-relative asset URLs for app-served API docs', () => {
    const html = swaggerHtml({
      assetBasePath: '/api-docs/hsa-person-lookup',
    })

    expect(html).toContain('href="/api-docs/hsa-person-lookup/swagger-ui.css"')
    expect(html).toContain(
      'src="/api-docs/hsa-person-lookup/swagger-ui-bundle.js"',
    )
    expect(html).toContain(
      "url: '/api-docs/hsa-person-lookup/hsa-person-lookup.yaml'",
    )
    expect(html).toContain('supportedSubmitMethods: []')
    expect(html).toContain('authorizationPopup: () => null')
    expect(html).toContain('authorizeBtn: () => null')
    expect(html).toContain('authorizeOperationBtn: () => null')
    expect(html).not.toContain('.swagger-ui .auth-wrapper')
    expect(html).not.toContain('.swagger-ui .btn.authorize')
  })

  it('normalizes direct-run paths before comparing entry points', () => {
    const scriptPath = path.join(
      process.cwd(),
      'tmp/openapi/hsa person lookup.mjs',
    )

    expect(
      isDirectRun(['node', scriptPath], pathToFileURL(scriptPath).href),
    ).toBe(true)
    expect(
      isDirectRun(
        ['node', path.join(process.cwd(), 'tmp/openapi/other.mjs')],
        pathToFileURL(scriptPath).href,
      ),
    ).toBe(false)
  })
})
