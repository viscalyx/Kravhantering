---
name: kartlagg-it-stod-formagor
description: >-
  Analysera en kodbas, dokumentation och tester för att kartlägga vilka
  förmågor och funktionaliteter IT-stödet levererar. Använd när AI ska skapa
  en svensk, evidensbaserad inventering som senare kan kopplas till externa
  verksamhetsprocesser, delprocesser, förmågekartor, tjänstekataloger eller
  nyttorealisering utan att processerna behöver vara kända i förväg. Skillen
  ska arbeta inkrementellt med en persistent analysfil när kodbasen är större
  än vad som ryms bekvämt i aktuell kontext.
---

# Kartlägg IT-stödets förmågor

Kartlägg vad IT-stödet gör för verksamheten, inte hur koden råkar vara
organiserad. Skriv resultatet så att en separat processkarta kan kopplas på
senare.

## Arbetsgång

1. Läs användarens avgränsning, önskad detaljnivå och eventuell målfil.
2. Om ingen målfil anges, skriv rapporten till
   `docs/it-stod-formagor.md`.
3. Skapa eller öppna analysfilen innan bred kodbasläsning. Följ
   `ANALYS-FORMAT.md`.
4. Läs befintlig analysfil först vid återupptagning eller efter
   kontextkomprimering. Fortsätt från dess källstatus och öppna frågor.
5. Läs lokala domän- och språkunderlag först, till exempel `CONTEXT.md`,
   `README`, `docs/`, ADR:er, manualfall och specifikationer.
6. Dela kodbasen i källkluster som kan analyseras ett i taget:
   - routes, sidor, komponenter, formulär, navigation, översättningar
   - API-routes, tjänster, domänmodeller, behörighet, policyer
   - databastabeller, migreringar, seed-data och rapportmodeller
   - importer, exporter, integrationer, batchjobb och schemalagda flöden
   - tester som beskriver avsedd funktionalitet
7. Använd `rg` med domänord, UI-texter, route-namn, roller,
   informationsobjekt, rapportnamn och API-begrepp. Kombinera svenska och
   engelska termer när kodbasen är tvåspråkig.
8. Analysera ett källkluster i taget. Skriv fynd, evidens, osäkerhet och
   källstatus till analysfilen innan nästa kluster läses.
9. Efter varje kluster, håll bara aktuell lägesbild, öppna frågor och nästa
   källkluster i aktiv kontext. Lita på analysfilen för tidigare fynd.
10. När alla relevanta kluster är granskade, läs analysfilens lägesbild,
    kandidatlistor, bortval och öppna frågor. Gör slutlig deduplicering och
    skriv rapporten i svensk markdown enligt `RESULTAT-FORMAT.md`.

## Analysfil

Använd analysfilen som arbetsminne, inte som slutrapport. Uppdatera den ofta, t.ex. för varje nytt källkluster, fynd eller evidens.
Läs `ANALYS-FORMAT.md` när analysfilen skapas, återupptas eller behöver
städas.

- Skriv till analysfilen innan kontexten blir stor.
- Markera varje källkluster som `Ej påbörjat`, `Pågår`, `Granskat`,
  `Behöver återbesök` eller `Bortvalt`.
- Spara kondenserade fynd, inte långa kodutdrag eller loggar.
- Bevara evidens som relativa sökvägar, radnummer, testnamn, route-namn eller
  andra stabila ankare.
- Ge kandidater stabila arbets-id:n tidigt, till exempel `KF-001` för
  förmågekandidat och `KFN-001` för funktionalitetskandidat.
- Lägg dubbletter, sammanslagningar och bortval i analysfilen så att samma kod
  inte analyseras om.
- Om analysfilen blir lång, håll `Lägesbild` och `Källstatus` korta och
  aktuella högst upp. Läs därefter bara relevanta sektioner med `rg` eller
  riktade filutdrag.

## Begrepp

- `Förmåga`: Ett stabilt verksamhetsnära resultat som IT-stödet möjliggör,
  oberoende av exakt UI, teknisk modul eller processnamn. Namnge som
  `verb + objekt`, till exempel `Förvalta kravbibliotek` eller
  `Följa upp kravtillämpning`.
- `Funktionalitet`: Ett konkret systembeteende, en användarhandling eller en
  systemhandling som realiserar en förmåga, till exempel skapa, granska,
  publicera, filtrera, exportera, importera, avisera eller logga.
- `Stödjande funktionalitet`: Teknisk eller administrativ funktionalitet som
  är synlig som levererad nytta, till exempel behörighetsstyrning,
  åtgärdsloggning, integration, rapportering eller dataexport.
- `Mappningsnyckel`: Ett ord eller attribut som gör raden lättare att koppla
  till en extern process senare, till exempel aktör, informationsobjekt,
  trigger, beslutspunkt, utdata eller kontroll.

## Granularitet

- Beskriv förmågor på en nivå där de kan kopplas till en eller flera externa
  verksamhetsprocesser utan att behöva namnge processerna.
- Dela en förmåga om den innehåller flera olika resultat, aktörer eller
  informationsobjekt.
- Slå ihop kandidater som bara är knappar, fält, endpoints eller komponenter
  till funktionaliteter under en förmåga.
- Namnge inte förmågor efter tekniska lager, komponenter, mappar eller
  databastabeller om inte teknisk förvaltning är den levererade nyttan.
- Undvik generella namn som `Hantera systemet` när ett tydligare verb finns.
- Markera doc-only, planerade eller osäkra beteenden som sådana. Presentera
  dem inte som implementerade utan evidens.

## Analysregler

- Utgå från faktisk kod, tester och repo-dokumentation. Gissa inte dolda
  processer, avtal, organisationsansvar eller arbetssätt.
- Beskriv vad IT-stödet levererar även när processen utanför systemet är
  okänd.
- Ta med både användarstyrda och systemstyrda beteenden när de påverkar
  verksamhetsnytta, spårbarhet, kontroll, rapportering eller datautbyte.
- Skilj mellan förmåga, funktionalitet och teknisk implementation.
- Gruppera efter domän eller verksamhetsobjekt, inte efter kodmapp.
- Läs inte in stora mappar eller hela kodbasen i aktiv kontext. Använd
  filindex, riktade sökningar och korta filutdrag.
- Återbesök inte granskade källkluster om inte analysfilen markerar dem som
  `Behöver återbesök` eller en ny fråga kräver det.
- Ange osäkerhet när evidensen bara visar del av flödet.
- Om användaren tillhandahåller externa processer eller delprocesser, lägg
  till en separat mappningssektion. Skilj då mellan `Direkt stöd`,
  `Sannolikt stöd`, `Indirekt stöd` och `Ingen tydlig koppling`.

## Rapportstruktur

Bygg slutrapporten från analysfilen och komplettera bara med riktade
kontroller där analysfilen visar osäkerhet. Läs `RESULTAT-FORMAT.md` först när
slutrapporten ska skapas eller när användaren ber om ett annat rapportformat.

## Kvalitetskontroll

- Varje förmåga ska ha minst ett verksamhetsnära resultat.
- Varje funktionalitet ska höra till exakt en primär förmåga.
- Varje rad ska ha evidens eller tydlig osäkerhet.
- Förmågor ska kunna förstås av verksamhetsrepresentanter utan kodkunskap.
- Funktionaliteter ska vara konkreta nog för att kunna verifieras i systemet.
- Rapporten ska inte ersätta en processkarta; den ska göra processkoppling
  möjlig.
- Text ska använda grammatiskt korrekt svenska.
- Ignorera inte eller korrigera grammatiskt korrekt svenska för att tysta stavningskontroll.
  Lägg domänord i ordlistan för stavningskontrollverktyget.
