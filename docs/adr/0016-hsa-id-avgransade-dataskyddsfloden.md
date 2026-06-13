# HSA-id-avgränsade dataskyddsflöden

Status: Antagen 2026-06-05.

Kravhantering avgränsar dataskyddsflöden till ett verifierat HSA-id i taget.
`Radering av personuppgifter` och `Personuppgiftsutdrag` matchar
personuppgifter enbart med exakt HSA-id. Namn, e-postadresser och visningsnamn
behandlas som föränderliga ögonblicksbilder och används inte för att
identifiera den registrerade personen.

Dataskyddshantering är separat från funktionell arkivering och retentionens
`Gallring`. Radering kan ta bort, anonymisera, hoppa över eller byta
personkopplade fält, men den måste bevara verksamhetshistorik,
livscykelspårbarhet, kravinnehåll, beslut och bevis i åtgärdsloggen när dessa
poster fortfarande behöver finnas för Kravhanterings ändamål.

JSON-innehållet är det auktoritativa maskinläsbara formatet för
`Personuppgiftsutdrag`. PDF är en läsbar återgivning av samma omfattning, medan
plattformens `Säkerhetslogg`, fritextfält där policy säger att personuppgifter
inte ska förekomma, råa action-log details och client IP values ligger utanför
applikationsnivåns personuppgiftsutdrag.

## Övervägda alternativ

- Matcha begäranden om dataskydd med namn eller e-post: avvisat eftersom dessa
  värden kan ändras, kollidera eller anonymiseras.
- Ta bort verksamhetsposter helt vid radering: avvisat eftersom
  dataskyddsrättigheter inte automatiskt tar bort kravhistorik, beslut eller
  spårbarhet som måste finnas kvar för verksamhetsändamål.
- Återanvända retention eller arkivexport för dataskyddshantering: avvisat
  eftersom registrerades rättigheter, retentionspolicy och funktionell
  arkivering har olika triggers, mandat och beviskrav.
