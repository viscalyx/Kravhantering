import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/color-contrast'
import {
  createReportPriorityIdentity,
  createReportPriorityIdentityFromItem,
  formatReportPriorityLabel,
  getPdfPriorityColors,
} from '@/lib/reports/priority'

describe('report priority identity', () => {
  it('normalizes valid priority data and rejects invalid visual configuration', () => {
    expect(
      createReportPriorityIdentity({
        code: ' P1 ',
        color: '#FDE047',
        iconName: 'CircleAlert',
        nameEn: ' Critical ',
        nameSv: ' Kritisk ',
      }),
    ).toEqual({
      code: 'P1',
      color: '#fde047',
      iconName: 'CircleAlert',
      nameEn: 'Critical',
      nameSv: 'Kritisk',
    })

    expect(
      createReportPriorityIdentity({
        code: 'P2',
        color: 'javascript:red',
        iconName: 'NotAnAllowedIcon',
        nameEn: 'High',
        nameSv: 'Hög',
      }),
    ).toEqual({
      code: 'P2',
      color: null,
      iconName: null,
      nameEn: 'High',
      nameSv: 'Hög',
    })
  })

  it('creates an identity from report item fields when a code exists', () => {
    expect(
      createReportPriorityIdentityFromItem({
        priorityLevelCode: 'P1',
        priorityLevelColor: '#FDE047',
        priorityLevelIconName: 'CircleAlert',
        priorityLevelNameEn: 'Critical',
        priorityLevelNameSv: 'Kritisk',
      }),
    ).toEqual({
      code: 'P1',
      color: '#fde047',
      iconName: 'CircleAlert',
      nameEn: 'Critical',
      nameSv: 'Kritisk',
    })
    expect(
      createReportPriorityIdentityFromItem({
        priorityLevelCode: null,
        priorityLevelColor: null,
        priorityLevelIconName: null,
        priorityLevelNameEn: null,
        priorityLevelNameSv: null,
      }),
    ).toBeNull()
  })

  it('formats code and localized name without a dangling separator', () => {
    const priority = createReportPriorityIdentity({
      code: 'P3',
      color: null,
      iconName: null,
      nameEn: '',
      nameSv: 'Medel',
    })

    expect(formatReportPriorityLabel(priority, 'sv')).toBe('P3 – Medel')
    expect(formatReportPriorityLabel(priority, 'en')).toBe('P3')
    expect(
      formatReportPriorityLabel(
        createReportPriorityIdentity({
          code: 'P4',
          color: null,
          iconName: null,
          nameEn: '',
          nameSv: '',
        }),
        'en',
      ),
    ).toBe('P4')
    expect(formatReportPriorityLabel(null, 'sv')).toBeNull()
  })

  it('derives opaque badge and inline colors with printable text contrast', () => {
    for (const accent of ['#fde047', '#1e3a8a', null, 'invalid']) {
      const badge = getPdfPriorityColors(accent, '#ffffff', 'badge')
      const inline = getPdfPriorityColors(accent, '#fffbeb', 'inline')

      expect(badge.background).toMatch(/^#[0-9a-f]{6}$/)
      expect(inline.background).toBe('#fffbeb')
      expect(
        contrastRatio(badge.foreground, badge.background),
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(inline.foreground, inline.background),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
