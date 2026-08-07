import { describe, expect, it, vi } from 'vitest'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { authenticatedRestContextFixture } from './helpers/authenticated-rest-context-fixture'

describe('privacy route helpers', () => {
  it('projects audit actors, authorizes officers, and bounds errors', () => {
    const allowed = authenticatedRestContextFixture()
    allowed.actor.roles = ['PrivacyOfficer']
    expect(() => assertPrivacyOfficer(allowed)).not.toThrow()
    expect(auditActor(allowed)).toEqual({
      hsaId: 'SE5560000001-reviewer1',
      source: 'oidc',
      sub: 'reviewer-sub',
    })

    allowed.actor.hsaId = null
    allowed.actor.id = null
    expect(auditActor(allowed)).toEqual({
      hsaId: undefined,
      source: 'oidc',
      sub: undefined,
    })
    expect(() =>
      assertPrivacyOfficer(authenticatedRestContextFixture()),
    ).toThrow()
    expect(unexpectedErrorBody('Failed', 'secret')).toEqual({ error: 'Failed' })
    vi.stubEnv('NODE_ENV', 'development')
    expect(
      unexpectedErrorBody('Failed', new Error('token=secret')),
    ).toMatchObject({ debugMessage: expect.any(String), error: 'Failed' })
    vi.unstubAllEnvs()
  })
})
