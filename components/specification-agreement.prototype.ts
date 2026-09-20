// THROWAWAY #1352: presentation-only agreements; never sent to the API.
import type { SpecificationAgreementView } from './SpecificationAgreementBox'

export function prototypeAgreementView(
  source: SpecificationAgreementView,
  locale: string,
  selectedId: number,
): SpecificationAgreementView {
  const current: NonNullable<SpecificationAgreementView['selectedAgreement']> =
    {
      id: -135201,
      agreementReference:
        locale === 'sv'
          ? 'MOCK-2026-001 – Plattform för planering, dokumentation och uppföljning'
          : 'MOCK-2026-001 – Platform for planning, documentation and follow-up',
      effectiveDate: '2026-01-01',
      description:
        locale === 'sv'
          ? 'Exempelavtal för en gemensam plattform. Avtalet omfattar införande, support, utbildning och löpande uppföljning av verksamhetens krav.\nKontaktvägar, ansvar och leveranser följs upp tillsammans med leverantören.'
          : 'Mock agreement for a shared platform covering implementation, support, training and ongoing review of operational requirements.\nContact channels, responsibilities and deliverables are reviewed with the supplier.',
      createdAt: new Date('2025-11-14T09:30:00Z'),
      createdBy: 'Anna Exempel',
      confirmedAt: new Date('2025-12-10T13:15:00Z'),
      confirmedBy: 'Erik Exempel',
      activatedAt: new Date('2026-01-01T00:00:00Z'),
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      endedAt: null,
      endedBy: null,
      endDate: null,
      endReason: null,
      replacedAt: null,
      state: 'current',
    }
  const previous = {
    ...current,
    id: -135200,
    agreementReference: 'MOCK-2024-001',
    effectiveDate: '2024-01-01',
    description:
      locale === 'sv'
        ? 'Tidigare exempelavtal för samma plattform.'
        : 'Previous mock agreement for the same platform.',
    createdAt: new Date('2023-11-14T09:30:00Z'),
    confirmedAt: new Date('2023-12-10T13:15:00Z'),
    activatedAt: new Date('2024-01-01T00:00:00Z'),
    replacedAt: new Date('2026-01-01T00:00:00Z'),
    state: 'previous',
  }
  return {
    ...source,
    agreements: [previous, current],
    selectedAgreement: selectedId === previous.id ? previous : current,
    corrections:
      selectedId === previous.id
        ? []
        : [
            {
              id: -135202,
              agreementId: current.id,
              oldAgreementReference: 'MOCK-2026-001',
              newAgreementReference: current.agreementReference,
              oldEffectiveDate: current.effectiveDate,
              newEffectiveDate: current.effectiveDate,
              oldDescription:
                locale === 'sv'
                  ? 'Exempelavtal för en gemensam plattform.'
                  : 'Mock agreement for a shared platform.',
              newDescription: current.description,
              correctedAt: new Date('2026-02-03T10:00:00Z'),
              correctedBy: 'Anna Exempel',
            },
          ],
    items: [],
    deviations: [],
    deviationEndings: [],
    confirmationDeviations: [],
  }
}
