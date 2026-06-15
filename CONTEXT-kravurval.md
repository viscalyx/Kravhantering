# Kravurval

Detta sammanhang beskriver kravurvalsfrågor, kravurvalssvar, filter,
synlighetsvillkor och kravurvalsfrågehierarkier.

## Language

Primärt ordlistespråk: `sv`

### Begrepp

**Kravurvalsfråga**:
En fråga som förvaltas inom ett kravområde och stödjer urval av publicerade
bibliotekskrav till ett kravunderlag genom ett eller flera förberedda svar.

- `en`: Requirement selection question

_Avoid_: Kravpaket, referensdata, fråga utan kravurvalssammanhang, fråga med
härlett ägarskap från kopplade krav.

**Kravurvalsfråge-ID**:
Den stabila identifieraren för en kravurvalsfråga, sammansatt av kravområdets
prefix och en markör för kravurvalsfrågor.

- `en`: Requirement selection question ID

_Avoid_: Krav-ID, databas-ID, radnummer.

**Kravurvalssvar**:
Ett förberett svarsalternativ i en kravurvalsfråga som kan peka ut relevanta
kravpaket, krav eller inget kravurval alls.

- `en`: Requirement selection answer

_Avoid_: Användarens svar, kravpaket.

**Utan kravurval**:
En egenskap hos ett kravurvalssvar som markerar att svaret avsiktligt inte
bidrar med krav till kravurvalsfilter.

- `en`: No requirement selection

_Avoid_: Saknar kravurval när kopplingar har tappats eller behöver åtgärdas.

**Saknar kravurval**:
Ett hälsoläge för ett kravurvalssvar som saknar kravkopplingar utan att vara
markerat som utan kravurval.

- `en`: Missing requirement selection

_Avoid_: Utan kravurval när avsiktligt nollbidrag avses.

**Kravurvalsfilter**:
Ett användaraktiverat styrt grundurval av bibliotekskrav som bildas av valda
kravurvalssvar inför att krav läggs till i ett kravunderlag. Valda
kravurvalssvar kan bevaras som urvalskontext utan att kravurvalsfilter är
aktivt.

- `en`: Requirement selection filter

_Avoid_: Vanligt tabellfilter, kravpaket, sparade kravurvalssvar när de bara
dokumenterar urvalskontext.

**Synlighetsvillkor**:
Ett villkor som avgör när en kravurvalsfråga hör till det aktuella
frågesammanhanget i ett kravunderlag, baserat på valda kravurvalssvar i
överliggande kravurvalsfrågor.

- `en`: Visibility condition

_Avoid_: Kravurvalsfilter, obligatoriskt krav, vanligt tabellfilter.

**Villkorsgrupp**:
En samling synlighetsvillkor där alla ingående överliggande frågor måste vara
uppfyllda för att gruppen ska göra en underordnad kravurvalsfråga synlig. Om
en kravurvalsfråga har flera villkorsgrupper räcker det att en grupp är
uppfylld.

- `en`: Condition group

_Avoid_: Kravpaket, svarsalternativ, kravurvalsfilter.

**Fristående kravurvalsfråga**:
En kravurvalsfråga som varken styrs av synlighetsvillkor eller används som
överliggande kravurvalsfråga i synlighetsvillkor.

- `en`: Standalone requirement selection question

_Avoid_: Rotfråga, huvudfråga, huvudkravurvalsfråga, toppfråga i
kravurvalsfrågehierarki.

**Överliggande kravurvalsfråga**:
En kravurvalsfråga vars valda svar kan göra en annan kravurvalsfråga synlig.

- `en`: Parent requirement selection question

_Avoid_: Överordnat krav, kravområde.

**Underordnad kravurvalsfråga**:
En kravurvalsfråga som bara hör till frågesammanhanget när dess
synlighetsvillkor är uppfyllda.

- `en`: Child requirement selection question

_Avoid_: Obligatorisk fråga, kravpaket.

**Kravurvalsfrågehierarki**:
En sammanhängande struktur av kravurvalsfrågor där överliggande
kravurvalsfrågor och underordnade kravurvalsfrågor hänger ihop genom
synlighetsvillkor.

- `en`: Requirement selection question hierarchy

_Avoid_: Sorteringsordning, kravområdesgrupp, kravhierarki.
