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
  resolveVerifiedRequirementResponsibilityPerson,
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

  it('fetches and stores a person in reuse-local mode when no local row exists', async () => {
    await expect(
      verifyRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-sara1',
        'reuse_local',
      ),
    ).resolves.toEqual(LOOKUP_PERSON)

    expect(mocks.lookupHsaPerson).toHaveBeenCalledWith('SE5560000001-sara1')
    expect(mocks.upsertRequirementResponsibilityPerson).toHaveBeenCalledWith(
      'mock-db',
      LOOKUP_PERSON,
    )
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
    expect(mocks.upsertRequirementResponsibilityPerson).toHaveBeenCalledWith(
      'mock-db',
      LOOKUP_PERSON,
    )
  })

  it('resolves a verified person from the local table during save', async () => {
    mocks.getRequirementResponsibilityPerson.mockResolvedValueOnce(LOCAL_PERSON)

    await expect(
      resolveVerifiedRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-local1',
        { retryDelayMs: 0 },
      ),
    ).resolves.toEqual(LOCAL_PERSON)

    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('fails invalid HSA-id formats before local reads or retry delay', async () => {
    await expect(
      resolveVerifiedRequirementResponsibilityPerson(
        'mock-db' as never,
        'not-a-valid-hsa-id',
        { retryDelayMs: 10_000 },
      ),
    ).rejects.toSatisfy(error => {
      expect(isRequirementsServiceError(error)).toBe(true)
      if (isRequirementsServiceError(error)) {
        expect(error.code).toBe('validation')
        expect(error.details).toMatchObject({ reason: 'invalid_hsa_id' })
      }
      return true
    })

    expect(mocks.getRequirementResponsibilityPerson).not.toHaveBeenCalled()
    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('retries the local table once before failing save validation', async () => {
    mocks.getRequirementResponsibilityPerson
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(LOCAL_PERSON)

    await expect(
      resolveVerifiedRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-local1',
        { retryDelayMs: 0 },
      ),
    ).resolves.toEqual(LOCAL_PERSON)

    expect(mocks.getRequirementResponsibilityPerson).toHaveBeenCalledTimes(2)
    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('fails save validation without HSA lookup when no local row exists', async () => {
    await expect(
      resolveVerifiedRequirementResponsibilityPerson(
        'mock-db' as never,
        'SE5560000001-missing1',
        { retryDelayMs: 0 },
      ),
    ).rejects.toSatisfy(error => {
      expect(isRequirementsServiceError(error)).toBe(true)
      if (isRequirementsServiceError(error)) {
        expect(error.code).toBe('validation')
        expect(error.details).toMatchObject({
          reason: 'requirement_responsibility_person_not_verified',
        })
      }
      return true
    })

    expect(mocks.getRequirementResponsibilityPerson).toHaveBeenCalledTimes(2)
    expect(mocks.lookupHsaPerson).not.toHaveBeenCalled()
  })
})
