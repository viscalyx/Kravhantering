// Throwaway fixtures: never inserted into SQL Server.
import type { Area } from './requirement-areas-client'

export function prototypeAreas(locale: string): Area[] {
  const sv = locale === 'sv'
  const row = (
    id: number,
    prefix: string,
    name: string,
    description: string | null,
  ): Area => ({
    coAuthors: [],
    description,
    id,
    name,
    ownerDisplayName: 'Alex Exempel',
    ownerHsaId: 'SE5560000001-prototype-alex',
    permissions: { canManageAssignments: true },
    prefix,
  })
  const rows = [
    row(
      -1,
      'ANV',
      sv ? 'Användbarhet' : 'Usability',
      sv
        ? 'Tydliga och användbara gränssnitt.'
        : 'Clear and usable interfaces.',
    ),
    row(
      -2,
      'INF',
      sv
        ? 'Informationssäkerhet och kontinuitet i verksamhetskritiska tjänster'
        : 'Information security and continuity of business-critical services',
      sv
        ? 'Kravområdet omfattar säker hantering av information genom hela livscykeln. Beskrivningen behöver ge läsaren tillräcklig kontext för att skilja förebyggande skydd, återställning och löpande uppföljning åt. Även externa leverantörer och gemensamma integrationer omfattas. All denna text ska gå att läsa direkt i listan utan att öppna en dialog eller en separat detaljvy.'
        : 'This requirement area covers secure information handling throughout its lifecycle. The description gives enough context to distinguish prevention, recovery and ongoing monitoring. External suppliers and shared integrations are also included. All of this text should be readable in the list without opening a dialog or a separate detail view.',
    ),
    row(
      -3,
      'SAM',
      sv ? 'Samverkan' : 'Collaboration',
      sv
        ? 'Flera medförfattare med varierande namnlängd.'
        : 'Multiple co-authors with different name lengths.',
    ),
    row(
      -4,
      'TOM',
      sv ? 'Område utan beskrivning' : 'Area without a description',
      null,
    ),
    row(
      -5,
      'IDN',
      sv
        ? 'Identitet och tekniska referenser'
        : 'Identity and technical references',
      `${sv ? 'Lång referens' : 'Long reference'}: urn:prototype:requirement-area:${'interoperability'.repeat(9)}`,
    ),
    row(
      -6,
      'PRV',
      sv ? 'Anonymiserat ansvar' : 'Anonymized responsibility',
      sv
        ? 'Kontrollera anonymiserade namn och bibehållna HSA-id.'
        : 'Check anonymized names and retained HSA IDs.',
    ),
  ]
  rows[1].ownerDisplayName = 'Kim Exempel-Långnamn Andersson'
  rows[2].coAuthors = [
    'Robin Exempel',
    'Charlie Exempel Med Ett Längre Namn',
    'Sam Exempel',
    'Taylor Exempel',
    'Morgan Exempel',
  ].map((displayName, index) => ({
    displayName,
    hsaId: `SE5560000001-prototype-co${index}`,
  }))
  rows[3].ownerDisplayName = ''
  rows[3].permissions = { canManageAssignments: false }
  rows[5].ownerDisplayName = 'no-user'
  rows[5].coAuthors = [
    { displayName: 'no-user', hsaId: 'SE5560000001-prototype-anon' },
  ]
  return rows
}
