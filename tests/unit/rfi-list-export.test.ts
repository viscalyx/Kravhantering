import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SpecificationRfiListRow } from '@/lib/dal/rfi-questions'
import SpecificationRfiListPdfRenderer, {
  buildSpecificationRfiListCsv,
} from '@/lib/rfi/rfi-list-export'

vi.mock('@react-pdf/renderer', () => ({
  Document: 'article',
  Page: 'section',
  StyleSheet: { create: <T>(styles: T): T => styles },
  Text: 'span',
  View: 'div',
}))

const list: SpecificationRfiListRow = {
  isLocked: true,
  items: [
    {
      areaId: 1,
      areaName: 'Integration',
      areaPrefix: 'INT',
      expectedAnswerFormat: 'Ja/nej och kommentar',
      helpText: 'Förstå integrationsförmåga.',
      isIncluded: true,
      isVersionStale: false,
      questionCode: 'INT-RFI001',
      questionId: 10,
      questionText: 'Kan lösningen integrera via öppna API:er?',
      relevance: 'relevant',
      requirementIds: [7],
      requirementPackageIds: [3],
      requirementSelectionQuestionIds: [2],
      sortOrder: 10,
      versionId: 100,
      versionNumber: 2,
    },
    {
      areaId: 2,
      areaName: 'Säkerhet',
      areaPrefix: 'SEC',
      expectedAnswerFormat: null,
      helpText: null,
      isIncluded: false,
      isVersionStale: false,
      questionCode: 'SEC-RFI001',
      questionId: 11,
      questionText: 'Hur hanteras loggning?',
      relevance: 'not_relevant',
      requirementIds: [],
      requirementPackageIds: [],
      requirementSelectionQuestionIds: [],
      sortOrder: 20,
      versionId: 101,
      versionNumber: 1,
    },
  ],
  lockedAt: '2026-06-20T09:00:00.000Z',
  lockedByDisplayName: 'RFI Tester',
  lockedByHsaId: 'SE5560000001-rfi-test',
  specificationId: 4,
}

describe('RFI list export', () => {
  it('exports locked RFI question versions with Swedish scope and relevance labels', () => {
    const csv = buildSpecificationRfiListCsv(
      { name: 'E-arkiv', specificationCode: 'SPEC-004' },
      list,
      'sv',
    )

    expect(csv).toContain(
      'RFI-fråga;Version;Kravområde;Scope;Relevans;Fråga;Syfte/hjälptext;Önskat svarsformat',
    )
    expect(csv).toContain(
      'INT-RFI001;2;Integration;Med;Relevant;Kan lösningen integrera via öppna API:er?;Förstå integrationsförmåga.;Ja/nej och kommentar',
    )
    expect(csv).toContain(
      'SEC-RFI001;1;Säkerhet;Utesluten;Inte relevant;Hur hanteras loggning?;;',
    )
  })

  it('renders grouped English RFI questions with lock and optional metadata', () => {
    const groupedList: SpecificationRfiListRow = {
      ...list,
      items: [
        list.items[0],
        {
          ...list.items[1],
          areaId: 1,
          areaName: 'Integration',
          relevance: null,
        },
      ],
    }

    const markup = renderToStaticMarkup(
      createElement(SpecificationRfiListPdfRenderer, {
        list: groupedList,
        locale: 'en',
        specification: {
          name: 'Digital archive',
          specificationCode: 'SPEC-004',
        },
      }),
    )

    expect(markup).toContain('RFI question list')
    expect(markup).toContain('Digital archive (SPEC-004)')
    expect(markup).toContain('Mode')
    expect(markup).toContain('Locked')
    expect(markup).toContain('2026-06-20T09:00:00.000Z')
    expect(markup.match(/Integration/g)).toHaveLength(1)
    expect(markup).toContain('INT-RFI001')
    expect(markup).toContain('SEC-RFI001')
    expect(markup).toContain('Included')
    expect(markup).toContain('Excluded')
    expect(markup).toContain('Relevant')
    expect(markup).toContain('Not assessed')
    expect(markup).toContain('Purpose/help text')
    expect(markup).toContain('Expected answer format')
  })

  it('renders an unlocked empty RFI list without lock metadata', () => {
    const markup = renderToStaticMarkup(
      createElement(SpecificationRfiListPdfRenderer, {
        list: {
          ...list,
          isLocked: false,
          items: [],
          lockedAt: null,
          lockedByDisplayName: null,
          lockedByHsaId: null,
        },
        locale: 'sv',
        specification: {
          name: 'E-arkiv',
          specificationCode: 'SPEC-004',
        },
      }),
    )

    expect(markup).toContain('Förbered')
    expect(markup).not.toContain('2026-06-20T09:00:00.000Z')
  })
})
