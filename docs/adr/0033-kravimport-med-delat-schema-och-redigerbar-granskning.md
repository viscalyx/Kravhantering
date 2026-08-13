# Kravimport med delat schema och redigerbar granskning

Status: Antagen 2026-06-23.

Kravimport använder ett gemensamt strikt JSON Schema för kandidatkrav, men två
separata importflöden: `Kravbiblioteksimport` och `Kravunderlagsimport`.
Destinationen väljs utanför importfilen så att samma filformat kan användas för
båda flödena utan att importfilen bär behörighets- eller placeringsdata.
Importfilens toppnivåfält `schemaVersion` versionerar hela filformatet,
inklusive kandidatkrav och stöddata som föreslagna normreferenser.

Tillägg 2026-07-06: `requirement-import.v3` tillåter stöddata för
behovsreferenser i `Kravimportfil`, eftersom behovsreferenser behöver kunna
följa med i UI-, AI- och MCP-stödda kravunderlagsimporter. Destinationen väljs
fortfarande utanför importfilen. Vid kravunderlagsimport kan rader peka på en
befintlig behovsreferens med `needsReferenceId` eller på
`proposedNeedsReferences` via `needsReferenceKey`. Vid kravbiblioteksimport
ignoreras behovsreferensfält med informationsmeddelande. Version 3 ersätter
version 2 som kanoniskt schema; äldre versioner behöver inte stödjas som
inläsningsformat.

Tillägg 2026-08-13: `requirement-import.v4` gör `Kravimportbudget` till en del
av det kanoniska kontraktet för webbläsare, REST, AI-assisterat författande och
MCP. Hela transportbegäran har ett fast applikationstak på 10 MiB och
importinnehållet har ett fast tak på 8 MiB. Administratören kan inom fasta
säkerhetstak sänka högsta antal kravrader från 500, respektive typ av föreslagen
referens från 500, objekt i varje nästlad samling från 200 och importinnehållets
JSON-djup från 8. Det genererade schemat uttrycker den aktuella budgeten utan
att varje inställningsändring skapar en ny schemaversion; version 3 behöver inte
stödjas som inläsningsformat.

En förhandsgranskning eller MCP-valideringssession binds till den budget som
gäller när den skapas och blir inaktuell när budgeten ändras. Dyr
förhandsgranskning, validering och körning delar en pool med två samtidiga
operationer per applikationsnod. Databasarbetet delas i grupper om högst 50
rader inom samma transaktion, så att hela körningen fortfarande lyckas eller
återställs atomärt.

Efter schemavalidering laddas importfilen till en redigerbar granskningsyta där
användaren väljer rader, kompletterar obligatoriska sparvärden och löser eller
accepterar varningar för frivillig metadata. Importen persisterar inte raw JSON
eller en server-side importsession. Körning skickar en stateless review token
och de redigerade raderna; servern validerar om auktorisering,
destinationskontext och referensdata innan alla valda rader skapas atomärt.

## Övervägda alternativ

- Separata filscheman per importläge: avvisat eftersom kravkandidaten är samma
  domänobjekt och destinationskontexten redan styrs av användarens val eller
  aktuell kravunderlagssida.
- Icke-redigerbar förhandsvisning: avvisat eftersom obligatoriska värden som
  saknas i importfilen måste kunna kompletteras innan krav sparas.
- Persisterad importsession eller raw importfil: avvisat eftersom skapade krav,
  audit events och frivillig CSV-kvitto räcker som varaktiga spår, medan raw
  importdata skulle skapa onödiga retention- och personuppgiftsfrågor.
- Enbart MCP-specifika gränser: avvisat eftersom samma importkontrakt används av
  flera ingångar och alla behöver omfattas av samma applikationsägda
  säkerhetstak.
- Delvis bekräftade databasbatcher: avvisat eftersom de bryter löftet att alla
  valda rader skapas atomärt.
- Distribuerad samtidighetsstyrning: avvisat eftersom kapaciteten hanteras per
  applikationsnod och en distribuerad kö skulle göra importflödet och driften
  väsentligt mer komplexa.
