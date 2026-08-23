# Kravimport med delat schema och redigerbar granskning

Status: Antagen 2026-06-23.

Kravimport använder ett gemensamt strikt JSON Schema för kandidatkrav, men två
separata importflöden: `Kravbiblioteksimport` och `Kravunderlagsimport`.
Destinationen väljs utanför importfilen så att samma filformat kan användas för
båda flödena utan att importfilen bär behörighets- eller placeringsdata.
Importfilens toppnivåfält `schemaVersion` versionerar hela filformatet,
inklusive kandidatkrav och stöddata som föreslagna normreferenser.

`requirement-import.v4` är det kanoniska och enda stödda inläsningsformatet.
Det tillåter stöddata för behovsreferenser i en `Kravimportfil`. Vid
kravunderlagsimport kan rader peka på en befintlig behovsreferens med
`needsReferenceId` eller på `proposedNeedsReferences` via
`needsReferenceKey`. Vid kravbiblioteksimport ignoreras behovsreferensfält med
informationsmeddelande.

Version 4 gör `Kravimportbudget` till en del av det gemensamma kontraktet för
webbläsare, REST, AI-assisterat författande och MCP. Hela transportbegäran har
ett fast applikationstak på 10 MiB och importinnehållet har ett fast tak på
8 MiB. Administratören kan inom fasta säkerhetstak sänka högsta antal
kravrader från 500, respektive typ av föreslagen referens från 500, objekt i
varje nästlad samling från 200 och importinnehållets JSON-djup från 8. Det
genererade schemat uttrycker den aktuella budgeten utan att varje
inställningsändring skapar en ny schemaversion.

En förhandsgranskning eller MCP-valideringssession binds till den budget som
gäller när den skapas och blir inaktuell när budgeten ändras. Dyr
förhandsgranskning, validering och körning delar en pool med två samtidiga
operationer per applikationsnod. Databasarbetet delas i grupper om högst 50
rader inom samma transaktion, så att hela körningen fortfarande lyckas eller
återställs atomärt.

Efter schemavalidering laddas importfilen till en redigerbar granskningsyta där
användaren väljer rader, kompletterar obligatoriska sparvärden och löser eller
accepterar varningar för frivillig metadata. Webbläsarflödet persisterar
varken rå JSON eller en serverbaserad importsession. Körning skickar ett
statuslöst granskningsbevis och de redigerade raderna; servern validerar om
auktorisering, destinationskontext och referensdata innan alla valda rader
skapas atomärt. MCP använder i stället de kortlivade persisterade
valideringssessionerna i
[ADR 0048](./0048-principalbundna-och-kvoterade-mcp-importvalideringssessioner.md).

## Övervägda alternativ

- Separata filscheman per importläge: avvisat eftersom kravkandidaten är samma
  domänobjekt och destinationskontexten redan styrs av användarens val eller
  aktuell kravunderlagssida.
- Icke-redigerbar förhandsvisning: avvisat eftersom obligatoriska värden som
  saknas i importfilen måste kunna kompletteras innan krav sparas.
- Persisterad webbläsarsession eller rå webbläsarimportfil: avvisat eftersom
  skapade krav, händelser i åtgärdsloggen och frivilligt CSV-kvitto räcker som
  varaktiga spår, medan rå importdata skulle skapa onödiga retentions- och
  personuppgiftsfrågor.
- Enbart MCP-specifika gränser: avvisat eftersom samma importkontrakt används av
  flera ingångar och alla behöver omfattas av samma applikationsägda
  säkerhetstak.
- Delvis bekräftade databasbatcher: avvisat eftersom de bryter löftet att alla
  valda rader skapas atomärt.
- Distribuerad samtidighetsstyrning: avvisat eftersom kapaciteten hanteras per
  applikationsnod och en distribuerad kö skulle göra importflödet och driften
  väsentligt mer komplexa.
