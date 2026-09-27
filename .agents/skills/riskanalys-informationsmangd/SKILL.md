---
name: riskanalys-informationsmangd
description: >-
  Skapa svenska, konkreta riskanalyser för informationsmängder utifrån
  informationssäkerhetsperspektiven riktighet, konfidentialitet och
  tillgänglighet. Använd när AI ska analysera en informationsmängd,
  informationstillgång, register, datamängd, ärendeinformation,
  informationshantering i offentlig sektor, identifiera informationsmängder i
  en kodbas, ISO 27001:2022, MSB:s metodstöd, sannolikhet,
  konsekvensnivåer, riskbehandling eller säkerhetsåtgärder.
---

# Riskanalys Informationsmängd

Genomför strukturerade riskanalyser av informationsmängder i svensk
offentlig sektor.

Agera som en erfaren informationssäkerhetsspecialist med kompetens inom:

- Riskhantering
- ISO 27001:2022
- MSB:s metodstöd
- Offentlig verksamhet

## Officiella referenser

Använd officiella MSB-referenser som metodstöd när internetåtkomst finns:

- MSB:s metodstöd för informationssäkerhetsarbete:
  https://www.msb.se/sv/amnesomraden/informationssakerhet-cybersakerhet-och-sakra-kommunikationer/arbeta-systematiskt-informationssakerhet-och-cybersakerhet/metodstod-for-informationssakerhetsarbete/
- Metodstödets del `Identifiera och analysera`:
  https://metodstod-informationssakerhet.msb.se/sv/analysera/

Använd referenserna som stöd för arbetssättet. Kopiera inte långa avsnitt och
anpassa alltid riskanalysen till användarens informationsmängd.

## Kodbasbaserad analys

Analysera kodbasen när användaren ber om riskanalys för ett system, repo eller
kodbas, eller när informationsmängden saknas men en kodbas finns tillgänglig.

1. Inventera informationsmängder genom att läsa relevanta källor, till exempel
   `README`, `docs`, datamodeller, databasschema, migrationer, API-routes,
   MCP-verktyg, UI-formulär, rapporter, importer, exporter, integrationer,
   behörighetslogik, auditloggning och filhantering.
2. Lista identifierade informationsmängder och ange kort var i kodbasen de
   hanteras.
3. Välj vilka informationsmängder som ska riskbedömas utifrån skyddsvärde,
   verksamhetskritikalitet, personuppgifter, sekretess, rättssäkerhet och
   beroenden.
4. Om många informationsmängder hittas, riskbedöm de mest verksamhetskritiska
   först och ange avgränsningen.
5. Om kodbasen inte räcker för att förstå verksamhetskontext, datainnehåll
   eller skyddsvärde, redovisa osäkerheten och be om komplettering.

## Arbetsgång

1. Läs informationsmängden och identifiera verksamhet, användare, lagring,
   åtkomst, delning, integrationer, beroenden och skyddsvärden.
2. Be om komplettering om informationsmängden saknas eller är för oklar för
   att analysera. Gör annars tydliga antaganden.
3. Bedöm risker separat för `Riktighet`, `Konfidentialitet` och
   `Tillgänglighet`.
4. Identifiera hot, möjliga orsaker och verksamhetskonsekvenser.
5. Väg in tekniska, organisatoriska och mänskliga faktorer.
6. Prioritera risker som påverkar uppdrag, rättssäkerhet, service,
   personuppgifter, sekretess, allmänna handlingar, patientsäkerhet eller
   förtroende.
7. Föreslå relevanta säkerhetsåtgärder och riskreducerande aktiviteter för
   varje risk.
8. Välj riskens basbedömning: sannolikhet, konsekvensnivå och
   riskbehandling.
9. Låt basbedömningen spegla risken i sig. Vid senare körningar får
   `Sannolikhet` och `Konsekvensnivå` bara ändras när riskens hotbild,
   informationsmängd, användning, exponering eller verksamhetskonsekvens har
   förändrats, inte för att nya åtgärder har genomförts efter att risken
   skapades.
10. Presentera huvudsakligen resultatet som tabell. Lägg bara till korta
   antaganden eller avgränsningar före tabellen när det behövs.
11. Om filen `docs/riskanalys.md` finns, verifiera de befintliga riskerna:
    - om risken fortfarande är relevant
    - om risken ska avföras; behåll raden och ange `Avförd: ... Evidens: ...`
      i `Åtgärder`
    - om nya risker ska läggas till
    - om kvarstående eller nya åtgärder krävs
    - om en åtgärd är implementerad; ange `Genomfört: ... Evidens: ...` och
      eventuellt `Kvarstår: ...` i `Åtgärder`
    - om implementerad åtgärd har verifierad effekt på sannolikhet,
      konsekvensnivå eller båda

## Perspektiv

- `Riktighet`: analysera felaktig, inaktuell, manipulerad, ofullständig eller
  felkopplad information.
- `Konfidentialitet`: analysera obehörig åtkomst, oavsiktlig spridning,
  felaktig publicering, bristande sekretessbedömning eller otillräcklig
  åtkomststyrning.
- `Tillgänglighet`: analysera avbrott, fördröjning, beroenden, överbelastning,
  systemfel, leverantörsstörningar och manuella reservrutiner.

## Sannolikhet

- `1 - Liten sannolikhet`
- `2 - Måttlig sannolikhet`
- `3 - Stor sannolikhet`
- `4 - Mycket stor sannolikhet`

## Konsekvensnivåer

Ange konsekvens som nivå och kategori, till exempel
`Betydande (förtroende)` eller `Allvarlig (patientsäkerhet)`. Om flera
konsekvenskategorier är relevanta, välj den högsta verksamhetsmässigt
rimliga nivån och nämn övriga i konsekvensbeskrivningen.

### Ekonomisk förlust

- `Obetydlig`: ingen eller obetydlig ekonomisk påverkan.
- `Måttlig`: totalkostnad under 500 tkr eller budgetavvikelse under 10 %.
- `Betydande`: totalkostnad mellan 500 tkr och 2 mnkr eller budgetavvikelse
  10-20 %.
- `Allvarlig`: totalkostnad över 2 mnkr eller budgetavvikelse över 20 %.

### Förtroendepåverkan

- `Obetydlig`: ingen eller mycket begränsad påverkan.
- `Måttlig`: enstaka missnöjda kunder eller notis i lokalpress/sociala
  medier.
- `Betydande`: uppmärksamhet i lokal- och riksmedia eller organiserade
  grupper i sociala medier.
- `Allvarlig`: ihållande negativ medial granskning som påverkar
  organisationens anseende och kultur.

### Personskada eller patientsäkerhet

- `Obetydlig`: ingen eller obetydlig påverkan.
- `Måttlig`: övergående funktionsnedsättning eller tillfälligt förhöjd
  vårdnivå för en eller flera patienter.
- `Betydande`: bestående måttlig funktionsnedsättning eller påverkan på flera
  patienter.
- `Allvarlig`: dödsfall eller bestående allvarlig funktionsnedsättning.

## Riskbehandling

- `Accepteras`: använd när risken är låg, motiverad och inom tolerans.
- `Begränsas`: använd när kontroller, arbetssätt eller tekniska åtgärder ska
  minska sannolikhet eller konsekvens.
- `Flyttas`: använd när ansvar eller ekonomisk risk kan delas genom avtal,
  försäkring, leverantörskrav eller extern drift utan att ansvar försvinner.
- `Undviks`: använd när behandlingen bör stoppas, ersättas eller avgränsas
  för att risken är för hög.

## Verifierade åtgärder

- Räkna en åtgärd som implementerad bara när aktuellt underlag visar det.
- Godkänd evidens är kod, tester, konfiguration, dokumentation, migreringar,
  drift- eller förvaltningsunderlag, eller explicit användarangiven evidens.
- Räkna inte förslag, planer, TODO-kommentarer, issue-rubriker eller antaganden
  som evidens.
- Fyll `Sannolikhet efter verifierade åtgärder` bara när evidens visar att en
  implementerad åtgärd påverkar sannolikheten.
- Fyll `Konsekvensnivå efter verifierade åtgärder` bara när evidens visar att
  en implementerad åtgärd påverkar konsekvensnivån.
- Lämna efter-kolumner tomma när verifierad evidens saknas. Sätt inte `-`,
  `Ej verifierat`, `Oförändrad` eller antagna värden.
- Bedöm efter-kolumnerna oberoende av varandra.

## Output

Arbeta med filen `docs/riskanalys.md`. Uppdatera eller skapa en
markdown-tabell med exakt dessa kolumner:

<!-- markdownlint-disable MD013 -->
| Säkerhetsområde | Risk/Händelse | Orsak | Konsekvens | Sannolikhet | Konsekvensnivå | Riskbehandling | Åtgärder | Sannolikhet efter verifierade åtgärder | Konsekvensnivå efter verifierade åtgärder |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- markdownlint-enable MD013 -->

När analysen baseras på kodbasen, börja med en kort lista eller tabell över
identifierade informationsmängder och markera vilka som riskbedöms. Ange
kodbasevidens som fil, modul, tabell, route eller integration när det går.

Fyll tabellen enligt dessa regler:

- Skriv en rad per konkret risk eller händelse.
- Använd bara `Riktighet`, `Konfidentialitet` eller `Tillgänglighet` i
  kolumnen `Säkerhetsområde`.
- Skriv sannolikhet som nivå och text, till exempel `3 - Stor sannolikhet`.
- Skriv kvarstående åtgärder som genomförbara aktiviteter, inte generiska
  ambitioner.
- Koppla åtgärder till riskens orsak och verksamhetskonsekvens.
- Föreslå riskreducerande aktiviteter som kan ägas, planeras och följas upp i
  verksamheten.
- Inkludera både förebyggande, upptäckande och korrigerande åtgärder när det
  är relevant.
- Använd `Åtgärder` för både genomförda åtgärder, evidens och kvarstående
  åtgärder.
- Lägg inte till riskpoäng, färgkodning eller extra kolumner om användaren
  inte ber om det.

## Kvalitetskrav

- Var konkret och verksamhetsnära.
- Anpassa riskerna till den specifika informationsmängden.
- Undvik mallfraser som hade kunnat gälla vilken informationsmängd som helst.
- Beskriv konsekvenser i termer av uppdrag, handläggning, rättssäkerhet,
  invånartillit, informationsutlämnande, sekretess, vård eller drift.
- Ta hänsyn till tekniska, organisatoriska och mänskliga faktorer i både
  riskbeskrivningar och föreslagna åtgärder.
- Ta hänsyn till offentlighetsprincip, sekretess, dataskydd, arkivkrav,
  leverantörsstyrning och kontinuitet när de är relevanta.
- Prioritera verksamhetskritiska risker före perifera teknikrisker.
- Markera antaganden tydligt när informationsmängdens sammanhang saknas.
