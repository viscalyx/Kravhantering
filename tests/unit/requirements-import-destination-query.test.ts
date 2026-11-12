import { describe, expect, it } from 'vitest'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import {
  importDestinationFromQuery,
  importDestinationKindFromQuery,
  importLocaleFromQuery,
  MISSING_IMPORT_DESTINATION_REASON,
} from '@/lib/requirements/import-destination-query'

function params(query: string) {
  return new URLSearchParams(query)
}

function expectMissingDestination(callback: () => unknown) {
  let thrown: unknown
  try {
    callback()
  } catch (error) {
    thrown = error
  }
  expect(isRequirementsServiceError(thrown)).toBe(true)
  expect(thrown).toMatchObject({
    code: 'validation',
    details: { reason: MISSING_IMPORT_DESTINATION_REASON },
    message: 'Missing destination',
  })
}

describe('import destination query parsing', () => {
  it('uses the reason that MCP agents already handle', () => {
    expect(MISSING_IMPORT_DESTINATION_REASON).toBe(
      'missing_import_instruction_destination',
    )
  })

  it('reads sv and defaults every other locale to en', () => {
    expect(importLocaleFromQuery(params('locale=sv'))).toBe('sv')
    expect(importLocaleFromQuery(params('locale=en'))).toBe('en')
    expect(importLocaleFromQuery(params('locale=fi'))).toBe('en')
    expect(importLocaleFromQuery(params(''))).toBe('en')
  })

  it('reads a destination kind without a specification id', () => {
    expect(
      importDestinationKindFromQuery(
        params('kind=requirements_library'),
        'Missing destination',
      ),
    ).toBe('requirements_library')
    expect(
      importDestinationKindFromQuery(
        params('kind=requirements_specification'),
        'Missing destination',
      ),
    ).toBe('requirements_specification')
  })

  it.each(['', 'kind=', 'kind=requirements_area'])(
    'rejects the destination kind query %j',
    query => {
      expectMissingDestination(() =>
        importDestinationKindFromQuery(params(query), 'Missing destination'),
      )
      expectMissingDestination(() =>
        importDestinationFromQuery(params(query), 'Missing destination'),
      )
    },
  )

  it('reads library and specification destinations', () => {
    expect(
      importDestinationFromQuery(
        params('kind=requirements_library&specificationId=8'),
        'Missing destination',
      ),
    ).toEqual({ kind: 'requirements_library' })
    expect(
      importDestinationFromQuery(
        params('kind=requirements_specification&specificationId=8'),
        'Missing destination',
      ),
    ).toEqual({ kind: 'requirements_specification', specificationId: 8 })
  })

  it.each([
    '',
    '&specificationId=0',
    '&specificationId=1.5',
    '&specificationId=x',
  ])(
    'rejects a specification destination with specificationId query %j',
    suffix => {
      expectMissingDestination(() =>
        importDestinationFromQuery(
          params(`kind=requirements_specification${suffix}`),
          'Missing destination',
        ),
      )
    },
  )
})
