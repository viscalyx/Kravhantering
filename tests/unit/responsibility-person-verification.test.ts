import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  getRequirementResponsibilityPerson: vi.fn(),
  lookupHsaPerson: vi.fn(),
  upsertRequirementResponsibilityPerson: vi.fn(),
}))

vi.mock('@/lib/dal/requirement-responsibility-people', () => ({
  getRequirementResponsibilityPerson: mocks.getRequirementResponsibilityPerson,
  upsertRequirementResponsibilityPerson:
    mocks.upsertRequirementResponsibilityPerson,
}))

vi.mock('@/lib/hsa/person-lookup', () => ({
  lookupHsaPerson: mocks.lookupHsaPerson,
}))

import {
  createRequirementResponsibilityPersonVerificationEvidence,
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH,
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES,
  requirementResponsibilityPersonActorFingerprint,
  requirementResponsibilityPersonFromActor,
  requirementResponsibilityPersonTargetFingerprint,
  resolveVerifiedRequirementResponsibilityPeople,
  resolveVerifiedRequirementResponsibilityPerson,
  toRequirementResponsibilityPersonVerificationPayload,
  verifyRequirementResponsibilityPerson,
} from '@/lib/requirements/responsibility-person-verification'

const LOCAL_PERSON = {
  email: 'local.owner@example.test',
  givenName: 'Local',
  hsaId: 'SE5560000001-local1',
  middleName: null,
  surname: 'Owner',
}

const LOOKUP_PERSON = {
  email: 'sara.owner@example.test',
  givenName: 'Sara',
  hsaId: 'SE5560000001-sara1',
  middleName: null,
  surname: 'Owner',
}

const ACTOR = {
  hsaId: 'SE5560000001-route',
  id: 'route-test',
  source: 'oidc' as const,
}

const EVIDENCE_SECRET = 'test-verification-secret-at-least-32-characters'

describe('responsibility person verification', () => {
  beforeEach(() => {
    mocks.getRequirementResponsibilityPerson.mockReset()
    mocks.lookupHsaPerson.mockReset()
    mocks.upsertRequirementResponsibilityPerson.mockReset()
    mocks.getRequirementResponsibilityPerson.mockResolvedValue(null)
    mocks.lookupHsaPerson.mockResolvedValue(LOOKUP_PERSON)
    mocks.upsertRequirementResponsibilityPerson.mockResolvedValue(undefined)
  })

  it('reuses a local person without HSA lookup in reuse-local mode', async () => {
    mocks.getRequirementResponsibilityPerson.mockResolvedValueOnce(LOCAL_PERSON)

    await expect(
      verifyRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-local1',
        'reuse_local',
      ),
    ).resolves.toEqual(LOCAL_PERSON)

    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
    expect(mocks.upsertRequirementResponsibilityPerson).not.toHaveBeenCalled()
  })

  it('fetches without storing a person in reuse-local mode when no local row exists', async () => {
    await expect(
      verifyRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-sara1',
        'reuse_local',
      ),
    ).resolves.toEqual(LOOKUP_PERSON)

    expect(mocks.lookupHsaPerson).toHaveBeenCalledWith('SE5560000001-sara1')
    expect(mocks.upsertRequirementResponsibilityPerson).not.toHaveBeenCalled()
  })

  it('always refreshes from HSA in refresh mode even when a local row exists', async () => {
    mocks.getRequirementResponsibilityPerson.mockResolvedValueOnce(LOCAL_PERSON)

    await expect(
      verifyRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-sara1',
        'refresh',
      ),
    ).resolves.toEqual(LOOKUP_PERSON)

    expect(mocks.getRequirementResponsibilityPerson).not.toHaveBeenCalled()
    expect(mocks.lookupHsaPerson).toHaveBeenCalledWith('SE5560000001-sara1')
    expect(mocks.upsertRequirementResponsibilityPerson).not.toHaveBeenCalled()
  })

  it('accepts short-lived evidence only for its actor, target, purpose, and scope', () => {
    const issuedAt = new Date('2026-08-12T10:00:00.000Z')
    const verification =
      createRequirementResponsibilityPersonVerificationEvidence(
        {
          actor: ACTOR,
          person: LOOKUP_PERSON,
          purpose: 'requirement_area_co_author',
          scopeId: 42,
        },
        { now: issuedAt, secret: EVIDENCE_SECRET, ttlSeconds: 300 },
      )

    expect(verification.expiresAt).toBe('2026-08-12T10:05:00.000Z')
    expect(
      resolveVerifiedRequirementResponsibilityPerson(
        verification.evidence,
        {
          actor: ACTOR,
          hsaId: LOOKUP_PERSON.hsaId,
          purpose: 'requirement_area_co_author',
          scopeId: 42,
        },
        {
          now: new Date('2026-08-12T10:04:59.000Z'),
          secret: EVIDENCE_SECRET,
        },
      ),
    ).toEqual({ ...LOOKUP_PERSON, hasProtectedPersonalData: false })

    expect(() =>
      resolveVerifiedRequirementResponsibilityPerson(
        verification.evidence,
        {
          actor: ACTOR,
          hsaId: LOOKUP_PERSON.hsaId,
          purpose: 'requirement_area_co_author',
          scopeId: 42,
        },
        {
          now: new Date('2026-08-12T10:05:00.000Z'),
          secret: EVIDENCE_SECRET,
        },
      ),
    ).toThrow('Verification evidence is invalid or expired')

    const mismatches = [
      { actor: { ...ACTOR, id: 'another-actor' } },
      { hsaId: 'SE5560000001-other1' },
      { purpose: 'requirement_package_co_author' as const },
      { scopeId: 43 },
    ]
    for (const mismatch of mismatches) {
      expect(() =>
        resolveVerifiedRequirementResponsibilityPerson(
          verification.evidence,
          {
            actor: ACTOR,
            hsaId: LOOKUP_PERSON.hsaId,
            purpose: 'requirement_area_co_author',
            scopeId: 42,
            ...mismatch,
          },
          {
            now: new Date('2026-08-12T10:04:59.000Z'),
            secret: EVIDENCE_SECRET,
          },
        ),
      ).toThrow('Verification evidence is invalid or expired')
    }
  })

  it('rejects expired and tampered verification evidence', () => {
    const verification =
      createRequirementResponsibilityPersonVerificationEvidence(
        {
          actor: ACTOR,
          person: LOOKUP_PERSON,
          purpose: 'requirements_specification_responsible',
          scopeId: 7,
        },
        {
          now: new Date('2026-08-12T10:00:00.000Z'),
          secret: EVIDENCE_SECRET,
          ttlSeconds: 60,
        },
      )
    const expected = {
      actor: ACTOR,
      hsaId: LOOKUP_PERSON.hsaId,
      purpose: 'requirements_specification_responsible' as const,
      scopeId: 7,
    }

    expect(() =>
      resolveVerifiedRequirementResponsibilityPerson(
        verification.evidence,
        expected,
        {
          now: new Date('2026-08-12T10:01:00.000Z'),
          secret: EVIDENCE_SECRET,
        },
      ),
    ).toThrow('Verification evidence is invalid or expired')

    const tampered = `${verification.evidence.slice(0, -1)}${
      verification.evidence.endsWith('a') ? 'b' : 'a'
    }`
    expect(() =>
      resolveVerifiedRequirementResponsibilityPerson(tampered, expected, {
        now: new Date('2026-08-12T10:00:30.000Z'),
        secret: EVIDENCE_SECRET,
      }),
    ).toThrow('Verification evidence is invalid or expired')
  })

  it.each([
    '',
    'payload-without-signature',
    '.signature',
    'payload.',
    'x'.repeat(
      REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_EVIDENCE_MAX_LENGTH + 1,
    ),
  ])(
    'rejects malformed verification evidence without decoding it',
    evidence => {
      expect(() =>
        resolveVerifiedRequirementResponsibilityPerson(
          evidence,
          {
            actor: ACTOR,
            hsaId: LOOKUP_PERSON.hsaId,
            purpose: 'requirement_area_owner',
          },
          {
            now: new Date('2026-08-12T10:00:30.000Z'),
            secret: EVIDENCE_SECRET,
          },
        ),
      ).toThrow('Verification evidence is invalid or expired')
    },
  )

  it.each([0, 601, 1.5])(
    'rejects an unsafe evidence TTL of %s seconds',
    ttlSeconds => {
      expect(() =>
        createRequirementResponsibilityPersonVerificationEvidence(
          {
            actor: ACTOR,
            person: LOOKUP_PERSON,
            purpose: 'requirement_area_owner',
          },
          { secret: EVIDENCE_SECRET, ttlSeconds },
        ),
      ).toThrow('Invalid HSA verification evidence TTL')
    },
  )

  it('rejects an undersized evidence signing secret', () => {
    expect(() =>
      createRequirementResponsibilityPersonVerificationEvidence(
        {
          actor: ACTOR,
          person: LOOKUP_PERSON,
          purpose: 'requirement_area_owner',
        },
        { secret: 'too-short' },
      ),
    ).toThrow('HSA verification evidence secret must be at least 32 characters')
  })

  it('resolves a unique evidence set and rejects missing or duplicate targets', () => {
    const now = new Date('2026-08-12T10:00:00.000Z')
    const secondPerson = {
      ...LOCAL_PERSON,
      hsaId: 'SE5560000001-local2',
    }
    const evidence = [LOOKUP_PERSON, secondPerson].map(
      person =>
        createRequirementResponsibilityPersonVerificationEvidence(
          {
            actor: ACTOR,
            person,
            purpose: 'requirements_specification_co_author',
            scopeId: 17,
          },
          { now, secret: EVIDENCE_SECRET },
        ).evidence,
    )
    const expected = {
      actor: ACTOR,
      hsaIds: [LOOKUP_PERSON.hsaId, secondPerson.hsaId],
      purpose: 'requirements_specification_co_author' as const,
      scopeId: 17,
    }
    const options = {
      now: new Date('2026-08-12T10:01:00.000Z'),
      secret: EVIDENCE_SECRET,
    }

    expect(
      resolveVerifiedRequirementResponsibilityPeople(
        evidence,
        expected,
        options,
      ),
    ).toEqual([
      { ...LOOKUP_PERSON, hasProtectedPersonalData: false },
      { ...secondPerson, hasProtectedPersonalData: false },
    ])
    expect(() =>
      resolveVerifiedRequirementResponsibilityPeople(
        [evidence[0], evidence[0]],
        expected,
        options,
      ),
    ).toThrow('Verification evidence is invalid or expired')
    expect(() =>
      resolveVerifiedRequirementResponsibilityPeople(
        [evidence[1]],
        { ...expected, hsaIds: [LOOKUP_PERSON.hsaId] },
        options,
      ),
    ).toThrow('Verification evidence is invalid or expired')
  })

  it.each(REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES)(
    'binds evidence for the supported %s assignment purpose',
    purpose => {
      const scopeId =
        purpose === 'requirement_area_owner' ||
        purpose === 'requirement_package_lead'
          ? undefined
          : 17
      const verification =
        createRequirementResponsibilityPersonVerificationEvidence(
          { actor: ACTOR, person: LOOKUP_PERSON, purpose, scopeId },
          {
            now: new Date('2026-08-12T10:00:00.000Z'),
            secret: EVIDENCE_SECRET,
          },
        )

      expect(
        resolveVerifiedRequirementResponsibilityPerson(
          verification.evidence,
          {
            actor: ACTOR,
            hsaId: LOOKUP_PERSON.hsaId,
            purpose,
            scopeId,
          },
          {
            now: new Date('2026-08-12T10:01:00.000Z'),
            secret: EVIDENCE_SECRET,
          },
        ),
      ).toMatchObject({ hsaId: LOOKUP_PERSON.hsaId })
    },
  )

  it('binds requirement package lead evidence to a package scope', () => {
    const scopeId = 23
    const verification =
      createRequirementResponsibilityPersonVerificationEvidence(
        {
          actor: ACTOR,
          person: LOOKUP_PERSON,
          purpose: 'requirement_package_lead',
          scopeId,
        },
        {
          now: new Date('2026-08-12T10:00:00.000Z'),
          secret: EVIDENCE_SECRET,
        },
      )

    expect(
      resolveVerifiedRequirementResponsibilityPerson(
        verification.evidence,
        {
          actor: ACTOR,
          hsaId: LOOKUP_PERSON.hsaId,
          purpose: 'requirement_package_lead',
          scopeId,
        },
        {
          now: new Date('2026-08-12T10:01:00.000Z'),
          secret: EVIDENCE_SECRET,
        },
      ),
    ).toMatchObject({ hsaId: LOOKUP_PERSON.hsaId })
  })

  it('normalizes names and protected-data flags in the verification payload', () => {
    expect(
      toRequirementResponsibilityPersonVerificationPayload({
        ...LOCAL_PERSON,
        givenName: '  Local ',
        hasProtectedPersonalData: true,
        middleName: ' Middle ',
        surname: ' Owner ',
      }),
    ).toMatchObject({
      displayName: 'Local Middle Owner',
      hasProtectedPersonalData: true,
    })
    expect(
      toRequirementResponsibilityPersonVerificationPayload({
        ...LOCAL_PERSON,
        givenName: ' ',
        middleName: null,
        surname: '',
      }),
    ).toMatchObject({
      displayName: LOCAL_PERSON.hsaId,
      hasProtectedPersonalData: false,
    })
  })

  it('creates a stable caller fingerprint without retaining raw identity values', () => {
    const fingerprint = requirementResponsibilityPersonActorFingerprint(ACTOR, {
      secret: EVIDENCE_SECRET,
    })

    expect(fingerprint).toMatch(/^afp_[A-Za-z0-9_-]{22}$/u)
    expect(fingerprint).not.toContain(ACTOR.hsaId)
    expect(fingerprint).not.toContain(ACTOR.id)
    expect(
      requirementResponsibilityPersonActorFingerprint(ACTOR, {
        secret: EVIDENCE_SECRET,
      }),
    ).toBe(fingerprint)
    expect(
      requirementResponsibilityPersonActorFingerprint(
        { ...ACTOR, id: 'different-actor' },
        { secret: EVIDENCE_SECRET },
      ),
    ).not.toBe(fingerprint)
  })

  it('normalizes optional actor identity fields before fingerprinting', () => {
    const whitespaceFingerprint =
      requirementResponsibilityPersonActorFingerprint(
        { hsaId: ' ', id: ' ', source: 'anonymous' },
        { secret: EVIDENCE_SECRET },
      )
    const nullFingerprint = requirementResponsibilityPersonActorFingerprint(
      { hsaId: null, id: null, source: 'anonymous' },
      { secret: EVIDENCE_SECRET },
    )

    expect(whitespaceFingerprint).toBe(nullFingerprint)
  })

  it('creates one stable target fingerprint across HSA-id case variants', () => {
    const lowerCase = requirementResponsibilityPersonTargetFingerprint(
      'SE5560000001-target1',
      { secret: EVIDENCE_SECRET },
    )
    const mixedCase = requirementResponsibilityPersonTargetFingerprint(
      'SE5560000001-Target1',
      { secret: EVIDENCE_SECRET },
    )

    expect(mixedCase).toBe(lowerCase)
    expect(mixedCase).not.toContain('target1')
  })

  it('rejects invalid HSA-id input in direct verification', async () => {
    await expect(
      verifyRequirementResponsibilityPerson(
        'mock-db' as never,
        ' invalid ',
        'refresh',
      ),
    ).rejects.toSatisfy(error => isRequirementsServiceError(error))
    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('builds a server-trusted person from the authenticated actor', () => {
    expect(
      requirementResponsibilityPersonFromActor({
        displayName: '  Display Name  ',
        email: '  actor@example.test  ',
        familyName: '  Family  ',
        givenName: '  Given  ',
        hsaId: '  SE5560000001-actor1  ',
        isAuthenticated: true,
      }),
    ).toEqual({
      email: 'actor@example.test',
      givenName: 'Given',
      hsaId: 'SE5560000001-actor1',
      middleName: null,
      surname: 'Family',
    })

    expect(
      requirementResponsibilityPersonFromActor({
        displayName: '  Display fallback  ',
        email: ' ',
        familyName: ' ',
        givenName: ' ',
        hsaId: 'SE5560000001-actor1',
        isAuthenticated: true,
      }),
    ).toMatchObject({
      email: null,
      givenName: 'Display fallback',
      surname: null,
    })
  })

  it('rejects an unauthenticated actor when deriving assignment identity', () => {
    expect(() =>
      requirementResponsibilityPersonFromActor({
        displayName: 'Anonymous',
        email: undefined,
        familyName: undefined,
        givenName: undefined,
        hsaId: 'SE5560000001-actor1',
        isAuthenticated: false,
      }),
    ).toThrow('Authenticated actor is required')
  })
})
