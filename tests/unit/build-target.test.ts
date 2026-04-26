import { describe, expect, it } from 'vitest'
import * as devTarget from '@/lib/runtime/build-target'

describe('build-target dev (vitest alias)', () => {
  it('exports BUILD_TARGET=dev', () => {
    expect(devTarget.BUILD_TARGET).toBe('dev')
  })

  it('allows insecure OIDC issuer in dev', () => {
    expect(devTarget.ALLOW_INSECURE_OIDC_ISSUER).toBe(true)
  })

  it('does not require secure cookies in dev', () => {
    expect(devTarget.USE_INSECURE_COOKIE).toBe(true)
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

  it('allows insecure OIDC issuer (local Keycloak is http://)', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.ALLOW_INSECURE_OIDC_ISSUER).toBe(true)
  })

  it('requires secure cookies', async () => {
    const m = await import('@/lib/runtime/build-target.local-prod')
    expect(m.USE_INSECURE_COOKIE).toBe(false)
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

  it('does NOT allow insecure OIDC issuer', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.ALLOW_INSECURE_OIDC_ISSUER).toBe(false)
  })

  it('requires secure cookies', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.USE_INSECURE_COOKIE).toBe(false)
  })

  it('does NOT use dev CSP', async () => {
    const m = await import('@/lib/runtime/build-target.prod')
    expect(m.USE_DEV_CSP).toBe(false)
  })
})
