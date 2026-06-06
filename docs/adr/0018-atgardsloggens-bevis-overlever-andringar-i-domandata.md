# Åtgärdsloggens bevis överlever ändringar i domändata

Status: Antagen 2026-06-05.

Kravhantering lagrar bevis i `Åtgärdslogg` i `action_audit_events` som
varaktiga ögonblicksbilder, inte som relationella barn till krav,
kravunderlag, ägaruppdrag eller andra domänrader. Rader i åtgärdsloggen
saknar avsiktligt foreign keys till levande domäntabeller; de bär logiska
target identifiers, actor snapshots, request IDs och correlation IDs så att
bevisen överlever livscykelradering, retentionens `Gallring`, arkivstädning
och radering eller byte av personfält.

Det oväntade är den avsiktliga förlusten av relational integrity för denna
tabell. Läsning av åtgärdslogg kan inte vara beroende av join tillbaka till
aktuell domänrad för innebörd, och skrivare måste fånga begränsade, stabila och
icke-känsliga bevis vid händelsetillfället. I gengäld raderas inte
åtgärdsloggens bevis av cascades, blockerar inte legitim domänstädning och
förblir granskningsbara efter att målobjektet har ändrats eller försvunnit från
aktiv Kravhantering.

## Övervägda alternativ

- Lägga foreign keys från `action_audit_events` till varje target table:
  avvisat eftersom retention, utkastborttagning, arkivstädning och radering av
  personuppgifter antingen skulle radera bevis eller blockeras av bevisrader.
- Cascade-delete rader i åtgärdsloggen tillsammans med sina targets: avvisat
  eftersom viktiga åtgärds- och auktoriseringsbevis skulle försvinna med
  verksamhetsobjektet.
- Lagra fullständiga before/after business payloads i åtgärdsloggen: avvisat
  eftersom kravtext, prompts, kommentarer, namn, HSA-ID:n, e-postadresser och
  annan fritext skulle göra dataskydd och retention svårare att kontrollera.
