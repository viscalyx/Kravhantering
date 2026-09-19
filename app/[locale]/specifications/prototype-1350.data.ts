// Throwaway, in-memory examples; never seeded into the database.
import type { Specification } from '@/lib/specifications/preload-types'

export type PrototypeSpecification = Omit<
  Specification,
  'itemCount' | 'requirementAreas'
>

export function prototype1350Examples(
  locale: string,
): PrototypeSpecification[] {
  const sv = locale === 'sv'
  const names = sv
    ? [
        'Upphandling av e-tjänstplattform',
        'Upphandling av integrationsplattform 2026',
        'Upphandling av lagringslösning 2026',
        'Gemensamt informationsutbyte mellan vård, omsorg och regionala stödsystem',
        'API Gateway',
        'Digital arbetsplats',
        'Arkivering och långtidsbevarande',
      ]
    : [
        'Procurement of digital services platform',
        'Procurement of integration platform 2026',
        'Procurement of storage solution 2026',
        'Shared information exchange between healthcare, social care and regional support systems',
        'API Gateway',
        'Digital workplace',
        'Archiving and long-term preservation',
      ]
  const people = [
    'Ada Admin',
    'Kalle Svensson',
    'Karl Persson',
    'Alexandra Christina Bergström Lindqvist',
    null,
    'no-user',
    'Maria Svensson',
  ]
  const ids = [
    'admin1',
    'kalle1',
    'karlpersson',
    'alexandrachristinabergstrom',
    'namnsaknas',
    'anonym',
    'marias',
  ]
  return names.map((name, i) => ({
    id: -(i + 1),
    name,
    specificationCode: `EX${i + 1}`,
    responsibleDisplayName: people[i],
    responsibleHsaId: `SE5560000001-${ids[i]}`,
    businessNeedsReference: null,
    governanceObjectType: {
      id: 1,
      nameSv: 'Leveransområde',
      nameEn: 'Delivery area',
    },
    implementationType: { id: 1, nameSv: 'Upphandling', nameEn: 'Procurement' },
    lifecycleStatus: {
      id: 1,
      nameSv: i === 4 ? 'Utveckling' : 'Upphandling',
      nameEn: i === 4 ? 'Development' : 'Procurement',
    },
    specificationGovernanceObjectTypeId: 1,
    specificationImplementationTypeId: 1,
    specificationLifecycleStatusId: 1,

    permissions: {
      canEditContent: i !== 5,
      canManageAssignments: i < 4,
      canReviewDecisions: false,
      canUseAi: false,
    },
  }))
}
