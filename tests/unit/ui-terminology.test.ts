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
          definitePlural: 'Requirement version states',
          plural: 'Requirement version states',
          singular: 'Requirement version state',
        },
        key: 'status',
        sv: {
          definitePlural: 'Kravversionsstatusarna',
          plural: 'Kravversionsstatusar',
          singular: 'Kravversionsstatus',
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
      {
        en: {
          definitePlural: 'Delivery bundles',
          plural: 'Delivery bundles',
          singular: 'Delivery bundle',
        },
        key: 'requirementPackage',
        sv: {
          definitePlural: 'Leveranspaketen',
          plural: 'Leveranspaket',
          singular: 'Leveranspaket',
        },
      },
    ])

    const svMessages = applyUiTerminologyMessages(
      {
        nav: {
          requirementPackages: 'Kravpaket',
          statuses: 'Kravversionsstatusar',
        },
        requirement: {
          description: 'Beskrivning',
          status: 'Kravversionsstatus',
        },
      },
      'sv',
      terminology,
    )
    const enMessages = applyUiTerminologyMessages(
      {
        nav: {
          requirementPackages: 'Requirement packages',
          statuses: 'Requirement version statuses',
        },
        requirement: {
          description: 'Requirement text',
          status: 'Requirement version status',
        },
      },
      'en',
      terminology,
    )

    expect(svMessages).toMatchObject({
      nav: {
        requirementPackages: 'Leveranspaket',
        statuses: 'Kravversionsstatusar',
      },
      requirement: { description: 'Kravtext', status: 'Kravversionsstatus' },
      terminology: {
        requirementPackage: {
          definitePlural: 'Leveranspaketen',
          plural: 'Leveranspaket',
          singular: 'Leveranspaket',
        },
        status: {
          definitePlural: 'Kravversionsstatusarna',
          plural: 'Kravversionsstatusar',
          singular: 'Kravversionsstatus',
        },
      },
    })
    expect(enMessages).toMatchObject({
      nav: {
        requirementPackages: 'Delivery bundles',
        statuses: 'Requirement version states',
      },
      requirement: {
        description: 'Requirement text',
        status: 'Requirement version state',
      },
      terminology: {
        description: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
        requirementPackage: {
          definitePlural: 'Delivery bundles',
          plural: 'Delivery bundles',
          singular: 'Delivery bundle',
        },
      },
    })
  })

  it('overlays the dedicated false-state testing label from terminology', () => {
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Cannot be tested',
          plural: 'Cannot be tested',
          singular: 'Cannot be tested',
        },
        key: 'requiresTestingOff',
        sv: {
          definitePlural: 'Kan inte provas',
          plural: 'Kan inte provas',
          singular: 'Kan inte provas',
        },
      },
    ])

    const enMessages = applyUiTerminologyMessages(
      {
        requirement: { requiresTestingOff: 'Not verifiable' },
      },
      'en',
      terminology,
    )
    const svMessages = applyUiTerminologyMessages(
      {
        requirement: { requiresTestingOff: 'Inte verifierbar' },
      },
      'sv',
      terminology,
    )

    expect(enMessages).toMatchObject({
      requirement: { requiresTestingOff: 'Cannot be tested' },
      terminology: {
        requiresTestingOff: {
          definitePlural: 'Cannot be tested',
          plural: 'Cannot be tested',
          singular: 'Cannot be tested',
        },
      },
    })
    expect(svMessages).toMatchObject({
      requirement: { requiresTestingOff: 'Kan inte provas' },
      terminology: {
        requiresTestingOff: {
          definitePlural: 'Kan inte provas',
          plural: 'Kan inte provas',
          singular: 'Kan inte provas',
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

    expect(terminology.area.sv.singular).toBe('Kravområde')
    expect(terminology.references.en.plural).toBe('References')
    expect(terminology.requiresTestingOff.sv.singular).toBe('Inte verifierbar')
    expect(terminology.mcpRequirementView.sv.singular).toBe('Kravvy från MCP')
    expect(getRequirementCsvHeaders('en', terminology)).toEqual([
      'Requirement ID',
      'Traceability marker',
      'Requirement area',
      'Category',
      'Type',
      'Quality characteristic',
      'Risk level',
      'Requirement version status',
      'Verifiable',
      'Version',
      'Norm references',
      'Norm reference URI',
    ])
  })

  it('keeps reference-data navigation labels plural and localizes unnamed references', () => {
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Reference datasets',
          plural: 'Reference datasets',
          singular: 'Reference dataset',
        },
        key: 'referenceData',
        sv: {
          definitePlural: 'Referenssamlingarna',
          plural: 'Referenssamlingar',
          singular: 'Referenssamling',
        },
      },
      {
        en: {
          definitePlural: 'Sources',
          plural: 'Sources',
          singular: 'Source',
        },
        key: 'references',
        sv: {
          definitePlural: 'Källorna',
          plural: 'Källor',
          singular: 'Källa',
        },
      },
    ])

    const enMessages = applyUiTerminologyMessages(
      {
        nav: { referenceData: 'Reference data' },
        reference: { unnamed: 'Reference' },
      },
      'en',
      terminology,
    )
    const svMessages = applyUiTerminologyMessages(
      {
        nav: { referenceData: 'Referensdata' },
        reference: { unnamed: 'Referens' },
      },
      'sv',
      terminology,
    )

    expect(enMessages).toMatchObject({
      nav: { referenceData: 'Reference datasets' },
      reference: { unnamed: 'Source' },
    })
    expect(svMessages).toMatchObject({
      nav: { referenceData: 'Referenssamlingar' },
      reference: { unnamed: 'Källa' },
    })
  })
})
