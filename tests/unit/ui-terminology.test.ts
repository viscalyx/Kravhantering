import { describe, expect, it } from 'vitest'
import {
  applyUiTerminologyMessages,
  getRequirementCsvHeaders,
  normalizeUiTerminology,
} from '@/lib/ui-terminology'

describe('ui terminology helpers', () => {
  it('overlays existing message keys for Swedish and English', () => {
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Lifecycle states',
          plural: 'Lifecycle states',
          singular: 'Lifecycle state',
        },
        key: 'status',
        sv: {
          definitePlural: 'Livscykelstatusarna',
          plural: 'Livscykelstatusar',
          singular: 'Livscykelstatus',
        },
      },
      {
        en: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
        key: 'description',
        sv: {
          definitePlural: 'Kravtexterna',
          plural: 'Kravtexter',
          singular: 'Kravtext',
        },
      },
    ])

    const svMessages = applyUiTerminologyMessages(
      {
        nav: { statuses: 'Kravstatusar' },
        requirement: { description: 'Beskrivning', status: 'Kravstatus' },
      },
      'sv',
      terminology,
    )
    const enMessages = applyUiTerminologyMessages(
      {
        nav: { statuses: 'Requirement Statuses' },
        requirement: { description: 'Description', status: 'Status' },
      },
      'en',
      terminology,
    )

    expect(svMessages).toMatchObject({
      nav: { statuses: 'Livscykelstatusar' },
      requirement: { description: 'Kravtext', status: 'Livscykelstatus' },
      terminology: {
        status: {
          definitePlural: 'Livscykelstatusarna',
          plural: 'Livscykelstatusar',
          singular: 'Livscykelstatus',
        },
      },
    })
    expect(enMessages).toMatchObject({
      nav: { statuses: 'Lifecycle states' },
      requirement: {
        description: 'Requirement text',
        status: 'Lifecycle state',
      },
      terminology: {
        description: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
      },
    })
  })

  it('falls back to seeded defaults for missing rows and builds CSV headers from terminology', () => {
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Traceability markers',
          plural: 'Traceability markers',
          singular: 'Traceability marker',
        },
        key: 'description',
        sv: {
          definitePlural: 'Spårbarhetsmarkörerna',
          plural: 'Spårbarhetsmarkörer',
          singular: 'Spårbarhetsmarkör',
        },
      },
    ])

    expect(terminology.area.sv.singular).toBe('Område')
    expect(getRequirementCsvHeaders('en', terminology)).toEqual([
      'Requirement ID',
      'Traceability marker',
      'Area',
      'Category',
      'Type',
      'Quality characteristic',
      'Status',
      'Verifiable',
      'Version',
    ])
  })
})
