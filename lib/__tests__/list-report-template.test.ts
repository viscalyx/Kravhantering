import { describe, expect, it } from 'vitest'
import { buildListReport } from '@/lib/reports/templates/list-template'

function requirement(versionOverrides: Record<string, unknown> = {}) {
  return {
    area: { id: 1, name: 'Security' },
    createdAt: '2026-05-01T00:00:00.000Z',
    id: 1,
    isArchived: false,
    uniqueId: 'REQ-1',
    versions: [
      {
        description: 'Current requirement',
        statusColor: '#22c55e',
        statusIconName: 'CircleCheck',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        versionNumber: 1,
        ...versionOverrides,
      },
    ],
  }
}

describe('list report template', () => {
  it('builds rows, cover context, truncation, and missing-version fallbacks', () => {
    const longDescription = 'x'.repeat(121)
    const model = buildListReport(
      [
        requirement({ description: 'Old', versionNumber: 1 }),
        {
          ...requirement({ description: longDescription, versionNumber: 1 }),
          id: 2,
          uniqueId: 'REQ-2',
          versions: [
            {
              ...requirement({ description: 'Old' }).versions[0],
              versionNumber: 1,
            },
            {
              ...requirement({ description: longDescription }).versions[0],
              versionNumber: 2,
            },
          ],
        },
        {
          ...requirement(),
          area: null,
          id: 3,
          uniqueId: 'REQ-3',
          versions: [],
        },
      ] as never,
      'sv',
      {
        businessNeedsReference: 'Need-1',
        governanceObjectType: 'Program',
        implementationType: 'Development',
        lifecycleStatus: 'Implementation',
        name: 'Specification',
        specificationCode: 'SPEC-1',
      },
      [
        {
          answerText: 'Yes',
          areaName: 'Security',
          changedAt: '2026-05-01',
          isHistorical: true,
          questionCode: 'Q1',
          questionText: 'Use MFA?',
          selectedByDisplayName: 'Ada Admin',
        },
      ],
    )

    expect(model.sections.map(section => section.type)).toEqual([
      'specification-cover',
      'page-break',
      'header',
      'requirement-selection-context',
      'requirement-table',
    ])
    const table = model.sections.find(
      section => section.type === 'requirement-table',
    )
    if (table?.type !== 'requirement-table') {
      throw new Error('Expected requirement table')
    }
    expect(table.rows[1]?.cells.description).toBe(`${'x'.repeat(120)}…`)
    expect(table.rows[2]?.cells).toMatchObject({ area: '', status: '' })
    expect(table.rows[2]?.statusColor).toBeNull()
  })
})
