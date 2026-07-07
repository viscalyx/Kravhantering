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
