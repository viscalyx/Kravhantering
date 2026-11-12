import { describe, expect, it } from 'vitest'
import {
  aiRequestFileName,
  aiRequestFileUrl,
  importDestinationKindForMode,
  resolveAiRequestFileDestination,
} from '@/lib/requirements/ai-request-files'

const LIBRARY = { kind: 'requirements_library' } as const
const SPECIFICATION = {
  kind: 'requirements_specification',
  specificationId: 123,
} as const

describe('AI request file names and URLs', () => {
  it.each([
    ['template', 'sv', LIBRARY, 'kravimport-ai-anropsmall-kravbibliotek.md'],
    [
      'template',
      'sv',
      SPECIFICATION,
      'kravimport-ai-anropsmall-kravunderlag.md',
    ],
    [
      'template',
      'en',
      LIBRARY,
      'requirement-import-ai-request-template-requirements-library.md',
    ],
    [
      'template',
      'en',
      SPECIFICATION,
      'requirement-import-ai-request-template-requirements-specification.md',
    ],
    [
      'referenceData',
      'sv',
      LIBRARY,
      'kravimport-referensdata-kravbibliotek.json',
    ],
    [
      'referenceData',
      'sv',
      SPECIFICATION,
      'kravimport-referensdata-kravunderlag-123.json',
    ],
    [
      'referenceData',
      'en',
      LIBRARY,
      'requirement-import-reference-data-requirements-library.json',
    ],
    [
      'referenceData',
      'en',
      SPECIFICATION,
      'requirement-import-reference-data-requirements-specification-123.json',
    ],
  ] as const)(
    'names the %s file for %s and %o',
    (file, locale, destination, expected) => {
      expect(aiRequestFileName(file, locale, destination)).toBe(expected)
    },
  )

  it('requests the template by destination kind only', () => {
    expect(aiRequestFileUrl('template', 'sv', SPECIFICATION)).toBe(
      '/api/requirements/import/ai-request-template?locale=sv&kind=requirements_specification',
    )
  })

  it('requests reference data for the exact destination', () => {
    expect(aiRequestFileUrl('referenceData', 'en', LIBRARY)).toBe(
      '/api/requirements/import/reference-data?locale=en&kind=requirements_library',
    )
    expect(aiRequestFileUrl('referenceData', 'sv', SPECIFICATION)).toBe(
      '/api/requirements/import/reference-data?locale=sv&kind=requirements_specification&specificationId=123',
    )
  })

  it.each([
    ['library', undefined, LIBRARY],
    ['library', 123, LIBRARY],
    ['specification-local', 123, SPECIFICATION],
    ['specification-local', undefined, null],
    ['specification-local', null, null],
  ] as const)(
    'resolves the %s destination with specification id %s',
    (mode, specificationId, expected) => {
      expect(resolveAiRequestFileDestination(mode, specificationId)).toEqual(
        expected,
      )
    },
  )

  it.each([
    ['library', 'requirements_library'],
    ['specification-local', 'requirements_specification'],
  ] as const)(
    'maps the %s import mode to the %s destination kind',
    (mode, kind) => {
      expect(importDestinationKindForMode(mode)).toBe(kind)
    },
  )
})
