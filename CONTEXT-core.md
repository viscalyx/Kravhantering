# Core

Detta sammanhang beskriver gemensamma verksamhetsbegrepp som flera delar av
Kravhantering bygger på.

## Language

Primärt ordlistespråk: `sv`

### Grundbegrepp

**Krav**:
En styrande utsaga om något som ska vara uppfyllt. Ett krav har en
egen identitet, klassificering, livscykel, versioner och spårbarhet.

- `en`: Requirement

_Avoid_: Kravtext när hela kravet avses.

**Kravtext**:
Den formulerade lydelsen av ett krav i en viss version. Kravtexten är
innehållet som beskriver vad som ska uppfyllas, inte kravet som helhet.

- `en`: Requirement text

_Avoid_: Krav när bara lydelsen avses.

**Kravversion**:
En bestämd version av ett kravs lydelse och verksamhetsmetadata vid en viss
tidpunkt. Ett krav kan ha flera kravversioner, men varje kravversion hör till
exakt ett krav.

- `en`: Requirement version

_Avoid_: Historikpost, kopia.

**Krav-ID**:
Den stabila identifieraren för ett krav över alla kravversioner. Ett krav-ID får
aldrig upprepas eller återanvändas; en specifik kravversion anges med krav-ID
och versionsnummer.

- `en`: Requirement ID

_Avoid_: Versions-ID, radnummer.

**Version**:
Ett löpnummer inom ett krav som identifierar en kravversion tillsammans med
kravets krav-ID. Ett versionsnummer kan återanvändas om ett senaste utkast
raderas innan en ny kravversion skapas.

- `en`: Version

_Avoid_: Krav-ID, globalt versionsnummer.

**Referensdata**:
Administrerade uppslag, klassningar och statuskataloger som stödjer krav och
kravunderlag. Referensdata är samlingsbegreppet som omfattar både taxonomi
samt statusar och arbetsflöden.

- `en`: Reference data

_Avoid_: Taxonomi när statuskataloger eller arbetsflödesstatusar avses,
kravdata, kravpaket eller normbibliotek när innehållsförvaltning av
kravbiblioteket avses.

**Taxonomi**:
En kontrollerad klassningsstruktur som används för att sortera, gruppera,
filtrera och analysera krav eller kravunderlag.

- `en`: Taxonomy

_Avoid_: Referensdata när även statuskataloger avses, statusar och
arbetsflöden.

**Statusar och arbetsflöden**:
Samlingsnamn för statuskataloger som beskriver livscykler, arbetsflödessteg
eller användning av krav och kravunderlag.

- `en`: Statuses and workflows

_Avoid_: Taxonomi, kravstatus som övergripande term.

**AI-assisterat författande**:
Ett stödflöde där en användare får förslag till krav baserat på ämne,
instruktioner, bilder och referensdata. Förslagen blir krav först när de
hanteras i ordinarie kravprocess.

- `en`: AI-assisted authoring

_Avoid_: AI-generering som huvudterm, AI-assistering, automatisk publicering,
AI-beslut, källa till sanning.

**Terminologi**:
De verksamhetsbegrepp och användargränssnittstermer som används för att
beskriva kravhanteringen. I administrationen ska terminologi vara namnet på
ytan där konfigurerbara ord hanteras.

- `en`: Terminology

_Avoid_: Benämningar som huvudterm.

**Benämningar**:
Äldre term för terminologi i användargränssnittet.

- `en`: Labels

_Avoid_: Huvudterm i UI och dokumentation.

**Medförfattare**:
Accepterad kortform för kravområdesmedförfattare,
kravpaketsmedförfattare eller kravunderlagsmedförfattare när sammanhanget
tydligt visar vilket behörighetssammanhang som avses.

- `en`: Co-author

_Avoid_: Medförfattare när behörighetssammanhanget är oklart.

**Åtgärdslogg**:
Spår av viktiga användar- och systemåtgärder i applikationen, till exempel
ändringar och nekade behörighetsförsök.

- `en`: Action log

_Avoid_: Audit som svensk UI-term, tillämpningsspårbarhet.

**Säkerhetslogg**:
En strukturerad loggström för autentisering, auktorisering, privilegierade
åtgärder och andra säkerhetsrelevanta händelser. Säkerhetslogg är inte samma
sak som åtgärdsloggen och hör hemma i plattformens logg- och SIEM-flöde.

- `en`: Security audit log

_Avoid_: Säkerhetsaudit, säkerhetsrevision när loggströmmen avses,
Åtgärdslogg, vanlig applikationslogg, tillämpningsspårbarhet.
