import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  generateHsaPersonLookupSwaggerUi,
  isDirectRun,
  swaggerHtml,
  swaggerInitializer,
  swaggerOverrideCss,
} from '../openapi/generate-hsa-person-lookup-swagger-ui.mjs'

describe('HSA person lookup Swagger UI generator', () => {
  it('renders an inline-free shell with root-relative asset URLs', () => {
    const html = swaggerHtml({
      assetBasePath: '/api-docs/hsa-person-lookup',
    })

    expect(html).toContain('href="/api-docs/hsa-person-lookup/swagger-ui.css"')
    expect(html).toContain(
      'href="/api-docs/hsa-person-lookup/swagger-ui-override.css"',
    )
    expect(html).toContain(
      'src="/api-docs/hsa-person-lookup/swagger-ui-bundle.js"',
    )
    expect(html).toContain(
      'src="/api-docs/hsa-person-lookup/swagger-initializer.js"',
    )
    expect(html).not.toMatch(/<style\b/i)
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i)
    expect(html).not.toMatch(/\s(?:on[a-z]+|style)=/i)
    expect(html).not.toContain('swagger-ui-standalone-preset.js')
  })

  it('uses BaseLayout and disables write and authorization controls', () => {
    const initializer = swaggerInitializer({
      assetBasePath: '/api-docs/hsa-person-lookup',
    })

    expect(initializer).toContain("layout: 'BaseLayout'")
    expect(initializer).toContain(
      'url: "/api-docs/hsa-person-lookup/hsa-person-lookup.yaml"',
    )
    expect(initializer).toContain('validatorUrl: null')
    expect(initializer).toContain('supportedSubmitMethods: []')
    expect(initializer).toContain('authorizationPopup: () => null')
    expect(initializer).toContain('authorizeBtn: () => null')
    expect(initializer).toContain('authorizeOperationBtn: () => null')
    expect(initializer).not.toContain('StandaloneLayout')
    expect(initializer).not.toContain('SwaggerUIStandalonePreset')
  })

  it('puts the page override in an external stylesheet', () => {
    expect(swaggerOverrideCss()).toBe(`body {
  margin: 0;
}
`)
  })

  it('generates only the CSP-compatible Swagger assets', () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kravhantering-swagger-ui-'),
    )

    try {
      const result = generateHsaPersonLookupSwaggerUi({
        assetBasePath: '/api-docs/hsa-person-lookup/',
        outputDir,
      })

      expect(result.files).toEqual([
        'favicon-16x16.png',
        'favicon-32x32.png',
        'hsa-person-lookup.yaml',
        'index.html',
        'swagger-initializer.js',
        'swagger-ui-bundle.js',
        'swagger-ui-override.css',
        'swagger-ui.css',
      ])
      expect(
        fs.existsSync(path.join(outputDir, 'swagger-initializer.js')),
      ).toBe(true)
      expect(
        fs.existsSync(path.join(outputDir, 'swagger-ui-override.css')),
      ).toBe(true)
      expect(
        fs.existsSync(path.join(outputDir, 'swagger-ui-standalone-preset.js')),
      ).toBe(false)
    } finally {
      fs.rmSync(outputDir, { force: true, recursive: true })
    }
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
