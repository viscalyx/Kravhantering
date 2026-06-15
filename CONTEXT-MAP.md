# Context Map

Detta dokument är startpunkten för Kravhanterings verksamhetsspråk.

## Loading Rule

Läs alltid [Core](./CONTEXT-core.md) först. Läs därefter bara den eller de
kontextfiler som hör till aktuell fråga. Läs inte orelaterade kontexter om
frågan inte korsar deras gränser.

## Contexts

- [Core](./CONTEXT-core.md) - gemensamma begrepp som flera kontexter bygger på.
- [Kravbibliotek](./CONTEXT-kravbibliotek.md) - krav, kravversioner,
  kravområden, kravpaket, normer, klassning, publicering och
  kravbiblioteksförvaltning.
- [Kravunderlag](./CONTEXT-kravunderlag.md) - kravunderlag,
  tillämpningsstyrning, lokala krav, kravtillämpningar och avsteg.
- [Kravurval](./CONTEXT-kravurval.md) - kravurvalsfrågor, svar, filter,
  synlighetsvillkor och frågehierarkier.
- [Behörighet och personuppgifter](./CONTEXT-behorighet-personuppgifter.md) -
  behörighetssammanhang, HSA-identitet, dataskydd och ansvarstilldelningar.
- [Livscykel och arkivering](./CONTEXT-livscykel-arkivering.md) - gallring och
  arkivexport.
- [Drift och leverans](./CONTEXT-drift-leverans.md) - drift- och
  leveransbegrepp.

## Relationships

- **Core -> alla kontexter**: Core innehåller grundtermer som andra kontexter
  förutsätter.
- **Kravbibliotek -> Kravunderlag**: Kravunderlag använder publicerade
  kravversioner från kravbiblioteket som kravtillämpningar.
- **Kravbibliotek -> Kravurval**: Kravurval använder kravpaket och publicerade
  krav från kravbiblioteket för att stödja urval.
- **Behörighet och personuppgifter -> Kravbibliotek/Kravunderlag**:
  Ansvarstilldelningar och HSA-identiteter används för uppdrag i flera
  kontexter.
- **Livscykel och arkivering -> Kravbibliotek**: Gallring och arkivexport ska
  hållas isär från kravversioners arkiveringsstatus.

## Term Index

### Core

- AI-assisterat författande
- Benämningar
- Krav
- Krav-ID
- Kravtext
- Kravversion
- Medförfattare
- Referensdata
- Statusar och arbetsflöden
- Säkerhetslogg
- Taxonomi
- Terminologi
- Version
- Åtgärdslogg

### Kravbibliotek

- Acceptanskriterium
- Arkiverad
- Arkiverad kravversion
- Arkiverat krav
- Arkiveringsgranskning
- Beräknad kravstatus
- Förbättringsförslag
- Förbättringsförslagshistorik
- Granskning
- Granskningsrapport
- Historikrapport
- Kategori
- Kravbibliotek
- Kravbiblioteksförvaltning
- Kravgranskare
- Kravkatalog
- Kravområde
- Kravområdesmedförfattare
- Kravområdesägare
- Kravpaket
- Kravpaketsansvarig
- Kravpaketsmedförfattare
- Kravtyp
- Kravversionsstatus
- Kvalitetsegenskap
- Normbibliotek
- Normreferens
- Publicerad
- Publicerad kravversion
- Publicering
- Referens
- Risknivå
- Typ
- Utkast
- Verifierbar
- Verifieringsmetod
- Återaktivera krav
- Återremiss
- Återskapa version
- Återskapad kravversion

### Kravunderlag

- Användningsstatus
- Avsteg
- Avstegsgranskningsrapport
- Behovsreferens
- Bibliotekskrav
- Genomförandeform
- Kravtillämpning
- Kravunderlag
- Kravunderlagets livscykelstatus
- Kravunderlagsansvarig
- Kravunderlagslokalt krav
- Kravunderlagsmedförfattare
- Lyfta till kravbiblioteket
- Styrningsobjektstyp
- Tillämpningsspårbarhet
- Tillämpningsstatistik
- Tillämpningsstyrning
- Tillämpningsstyrning för kravarbete
- Underlagssyfte
- Unikt krav
- Verksamhetsbehovsreferens
- Verksamhetsobjekt

### Kravurval

- Fristående kravurvalsfråga
- Kravurvalsfilter
- Kravurvalsfråga
- Kravurvalsfråge-ID
- Kravurvalsfrågehierarki
- Kravurvalssvar
- Saknar kravurval
- Synlighetsvillkor
- Underordnad kravurvalsfråga
- Utan kravurval
- Villkorsgrupp
- Överliggande kravurvalsfråga

### Behörighet och personuppgifter

- Administratör
- Behörighetssammanhang
- Behörighetsöversyn
- Dataskyddshandläggare
- HSA-id-prefix
- HSA-id-suffix
- HSA-katalog
- HSA-personpost
- HSA-personpost med skyddade personuppgifter
- Kravansvarsperson
- Kravansvarsperson utan kravansvarstilldelning
- Kravansvarstilldelning
- Personuppgiftsutdrag
- Radering av personuppgifter
- Skyddade personuppgifter
- Tilldelad granskningsperson

### Livscykel och arkivering

- Arkivexport
- Gallring

### Drift och leverans

- Frånkopplad produktionsmiljö
