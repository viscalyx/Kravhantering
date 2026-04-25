import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as devTarget from '@/lib/runtime/build-target'

describe('build-target dev (vitest alias)', () => {
  it('exports BUILD_TARGET=dev', () => {
    expect(devTarget.BUILD_TARGET).toBe('dev')
  })

  it('exports AUTH_ENABLED_AT_BUILD="env" for runtime env control', () => {
    expect(devTarget.AUTH_ENABLED_AT_BUILD).toBe('env')
  })

  it('allows insecure OIDC issuer in dev', () => {
    expect(devTarget.ALLOW_INSECURE_OIDC_ISSUER).toBe(true)
  })

  it('allows legacy header trust in dev', () => {
    expect(devTarget.ALLOW_LEGACY_HEADER_TRUST).toBe(true)
  })

  it('allows disabling auth in preprod', () => {
    expect(devTarget.ALLOW_DISABLE_AUTH_IN_PREPROD).toBe(true)
  })

  it('does not require secure cookies in dev', () => {
    expect(devTarget.COOKIE_SECURE).toBe(false)
  })

  it('uses dev CSP in dev', () => {
    expect(devTarget.USE_DEV_CSP).toBe(true)
  })
})

describe('build-target local-prod', () => {
  it('exports BUILD_TARGET=local-prod', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.BUILD_TARGET).toBe('local-prod')
  })

  it('keeps AUTH_ENABLED_AT_BUILD="env" so noauth builds still work', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.AUTH_ENABLED_AT_BUILD).toBe('env')
  })

  it('allows insecure OIDC issuer (local Keycloak is http://)', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.ALLOW_INSECURE_OIDC_ISSUER).toBe(true)
  })

  it('does NOT allow legacy header trust', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.ALLOW_LEGACY_HEADER_TRUST).toBe(false)
  })

  it('requires secure cookies', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.COOKIE_SECURE).toBe(true)
  })

  it('does NOT use dev CSP', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.USE_DEV_CSP).toBe(false)
  })
})

describe('build-target prod', () => {
  it('exports BUILD_TARGET=prod', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.BUILD_TARGET).toBe('prod')
  })

  it('freezes AUTH_ENABLED_AT_BUILD=true (auth always on)', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.AUTH_ENABLED_AT_BUILD).toBe(true)
  })

  it('does NOT allow insecure OIDC issuer', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.ALLOW_INSECURE_OIDC_ISSUER).toBe(false)
  })

  it('does NOT allow legacy header trust', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.ALLOW_LEGACY_HEADER_TRUST).toBe(false)
  })

  it('does NOT allow disabling auth in preprod', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.ALLOW_DISABLE_AUTH_IN_PREPROD).toBe(false)
  })

  it('requires secure cookies', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.COOKIE_SECURE).toBe(true)
  })

  it('does NOT use dev CSP', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.USE_DEV_CSP).toBe(false)
  })

  it('contains no process.env reads — all constants are frozen at compile time', () => {
    const src = readFileSync(
      resolve(__dirname, '../../lib/runtime/build-target.prod.ts'),
      'utf8',
    )
    // Match actual property accesses like process.env.FOO, not prose mentions.
    expect(src).not.toMatch(/process\.env\.[A-Z_]/)
  })
})
