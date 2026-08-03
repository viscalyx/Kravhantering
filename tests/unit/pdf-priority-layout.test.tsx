// @vitest-environment node

import { renderToBuffer } from '@react-pdf/renderer'
import { extractTextItems } from 'unpdf'
import { describe, expect, it } from 'vitest'
import PdfReportRenderer from '@/components/reports/pdf/PdfReportRenderer'
import { preloadStatusIconNodes } from '@/lib/icons/status-icon-allowlist'
import type { ReportModel } from '@/lib/reports/types'

describe('PDF priority layout', () => {
  it('keeps a short priority identity on one extracted line', async () => {
    await preloadStatusIconNodes(['ArrowDownLeft'])
    const model: ReportModel = {
      sections: [
        {
          type: 'version-summary',
          version: {
            acceptanceCriteria: null,
            archivedAt: null,
            category: null,
            createdAt: '2026-08-03T00:00:00.000Z',
            createdBy: 'seed',
            description: null,
            editedAt: null,
            normReferences: [],
            priorityLevel: {
              code: 'P2',
              color: '#22c55e',
              iconName: 'ArrowDownLeft',
              nameEn: 'Low',
              nameSv: 'Låg',
            },
            publishedAt: null,
            qualityCharacteristic: null,
            requirementPackages: [],
            status: { color: null, label: 'Publicerad' },
            type: { nameEn: 'Functional', nameSv: 'Funktionellt' },
            verifiable: false,
            verificationMethod: null,
            versionNumber: 1,
          },
        },
      ],
    }

    const buffer = await renderToBuffer(
      <PdfReportRenderer locale="sv" model={model} />,
    )
    const { items } = await extractTextItems(new Uint8Array(buffer))
    const priorityTokens = ['P2', '–', 'Låg']
    const priorityPage = items.find(pageItems =>
      pageItems.some(item =>
        priorityTokens.some(token => item.str.includes(token)),
      ),
    )
    expect(priorityPage).toBeDefined()
    const priorityItemIndexes = (priorityPage ?? []).flatMap((item, index) =>
      priorityTokens.some(token => item.str.includes(token)) ? [index] : [],
    )
    const priorityItems = priorityItemIndexes.map(
      index => (priorityPage ?? [])[index],
    )

    expect(
      priorityItems.flatMap(item => item?.str.split(/\s+/u).filter(Boolean)),
    ).toEqual(priorityTokens)
    expect(new Set(priorityItems.map(item => item?.y)).size).toBe(1)
    const firstPriorityIndex = priorityItemIndexes.at(0)
    const lastPriorityIndex = priorityItemIndexes.at(-1)
    expect(firstPriorityIndex).toBeDefined()
    expect(lastPriorityIndex).toBeDefined()
    expect(
      (priorityPage ?? [])
        .slice(firstPriorityIndex, lastPriorityIndex)
        .some(item => item.hasEOL),
    ).toBe(false)
  })
})
