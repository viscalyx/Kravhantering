# Standardprotokoll för Kravhanterings AI-anropsgräns

Datum: 2026-07-30

## Sammanfattning

Inget granskat agentprotokoll bör vara Kravhanterings interna kärnkontrakt.
Agent Host Protocol (AHP), Agent Client Protocol (ACP), Model Context Protocol
(MCP) och Agent2Agent (A2A) standardiserar andra ansvar än det avgränsade
AI-anrop som Kravhantering behöver.

[Open Responses](https://www.openresponses.org/) ligger närmast den önskade
server-till-server-gränsen. Protokollet omfattar modellval, meddelanden,
bildindata, strikt JSON-schema, synkront svar, semantisk strömning och
användningsmetadata i ett leverantörsoberoende HTTP-kontrakt. Det bör därför
vara den första standardiserade anslutningsprofil som utvärderas vid
implementation. Det bör inte kopieras rakt av till applikationens interna
domänkontrakt eftersom det:

- saknar standardiserad förmågeförhandling;
- saknar en applikationsoperation för att avbryta ett pågående svar;
- innehåller fler modell- och agentfunktioner än Kravhantering behöver;
- har kort historik och ännu få daterade specifikationsutgåvor.

Rekommenderad riktning:

1. Definiera ett litet, applikationsägt TypeScript-kontrakt för ett
   anropsavgränsat `AI-anrop`.
2. Implementera protokolladaptrar bakom kontraktet. Börja med befintlig
   OpenRouter-trafik och en Open Responses-profil.
3. Låt en extern agentmiljö ansluta genom Open Responses om den erbjuder
   profilen. En miljö som endast erbjuder AHP, ACP eller A2A kräver en separat
   adapter och får inte skapa villkorslogik i författarflödet.
4. Behåll AI-säkerhet, schema-validering, tidsgränser, behörighet,
   kapacitetsmätning och felnormalisering i Kravhantering, utanför adaptrarna.
5. Lägg inte MCP-sampling till den nya gränsen. Den aktuella MCP-specifikationen
   markerar sampling som föråldrad och säger att nya implementationer ska
   integrera direkt med modell-API:er.

## Beslutsgrund

### Kravhanterings faktiska gräns

Kravhantering behöver inte en beständig agentkonversation. Varje operation ska
vara ett fristående anrop, även om en extern agentmiljö gör flera modellsteg
internt. En adapter får skapa och ta bort en tillfällig protokollsession när
motparten kräver det.

Gränsen måste stödja:

- färdigbyggda system-, användar- och vid behov assistentmeddelanden;
- noll till tre bilder i befintliga MIME-typer;
- ett tvingande svarsformat uttryckt som JSON-schema;
- en administratörsvald anslutning och modell per anropstyp;
- de körparametrar som en administratörsprofil tillåter;
- antingen avbrytbar strömning eller ett slutresultat;
- normaliserat slutresultat, fel, modellidentitet och valfri
  användningsmetadata;
- ingen automatisk reservväg till en annan anslutning eller modell.

Det nuvarande interna OpenRouter-anropet tar redan emot meddelanden,
modellidentitet, JSON-schema, leverantörsinställningar, resonemangsnivå och
`AbortSignal`. Det erbjuder både strömmande och icke-strömmande körning.
Se
[`openrouter-client.ts`](../../lib/ai/openrouter-client.ts).

Genereringsrutten bygger instruktionerna, granskar indata, strömmar
modellresultatet och validerar det mot applikationens import-schema.
JSON-reparationen gör motsvarande arbete med ett icke-strömmande anrop. Dessa
applikationsansvar ska inte flytta in i ett externt protokoll. Se
[`generate-requirement-import/route.ts`](../../app/api/ai/generate-requirement-import/route.ts)
och
[`repair-requirement-import-json/route.ts`](../../app/api/ai/repair-requirement-import-json/route.ts).

### Hårda urvalskrav

Ett generellt anslutningsprotokoll passar endast om det kan representera
följande utan leverantörsspecifika fält i användningsfallet:

1. Textmeddelanden, bildindata och ett tvingande JSON-schema.
2. Ett uttryckligt modellval från den aktiva administratörsprofilen.
3. Ett avgränsat anrop utan krav på beständig konversation.
4. Både slutresultat och strömhändelser, beroende på anropstyp.
5. Avbrott som kan kopplas till ett `AbortSignal`.
6. Fjärrdrift med server-till-server-autentisering.
7. TypeScript-stöd och en versioneringsmodell som kan låsas per anslutning.

Förmågeförhandling är önskvärd men ersätter inte administratörens
aktiveringskontroll. En anslutning ska verifieras mot körprofilens krav innan
den aktiveras.

## Jämförelse

<!-- markdownlint-disable MD013 -->
| Kandidat | Primärt ansvar | Transport och fjärrdrift | Tillstånd | Förmågor och autentisering | TypeScript och mognad | Passning |
| --- | --- | --- | --- | --- | --- | --- |
| [Open Responses](https://www.openresponses.org/specification) | Leverantörsoberoende modell- och agentanrop | HTTP/JSON, SSE och valfri WebSocket; fjärrdrift är normalfallet | Ett anrop kan vara fristående med `store: false`; tidigare svars-ID är valfritt | Ingen förmågeförhandling; Bearer-token; strikt JSON-schema, bilder, modellparametrar, strömning och användning finns | OpenAPI-schema och acceptanstester; daterade utgåvor sedan januari 2026 | Bäst som första extern profil, inte som internt kärnkontrakt |
| Modell-API-dialekter | Direkt inferens hos en leverantör eller router | Normalt HTTPS/JSON och SSE | Oftast anropsavgränsat; vissa API:er erbjuder lagrade svar | API-nyckel; förmågor och parametrar varierar per leverantör och modell | Mogna SDK:er men inget gemensamt normativt kontrakt | Behövs bakom adaptrar; får inte läcka till användningsfallet |
| [AHP](https://microsoft.github.io/agent-host-protocol/specification/overview.html) | Synkroniserad, flerklientig vy över agent-, sessions- och chattillstånd | Tillförlitlig dubbelriktad ström; WebSocket är vanlig men transporten väljs utanför protokollet | Sessioner, chattar, prenumerationer och återanslutning är centrala | Omfattande agent- och klientförmågor; transportautentisering plus Bearer-token för skyddade resurser | Officiellt TypeScript-paket; specifikationen är ett instabilt utkast | För stort och saknar standardfält för tvingande modellsvar |
| [Agent Client Protocol](https://agentclientprotocol.com/protocol/v1/overview) | Editor- eller IDE-klient till kodagent | JSON-RPC över `stdio`; fjärr-HTTP är fortfarande utkast | En session måste skapas före varje prompttur | Bildförmåga och avbrott finns; autentisering utförs av agenten; inget tvingande svars-schema | Officiell TypeScript-SDK; v1 är aktuell och v2 är utkast | Möjlig adapter för en kodagent, inte generell AI-anropsgräns |
| [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) | LLM-applikation till externa verktyg, data och kontext | JSON-RPC över `stdio` eller Streamable HTTP | Nu stateless med metadata per anrop | Upptäckt och förmågor är starka; HTTP har OAuth-ramverk; sampling är föråldrad | TypeScript är normativt schema; den nya SDK-generationen är ännu under införande | Ska användas för verktyg och kontext, inte för nya modell-anrop |
| [A2A 1.0](https://a2a-protocol.org/latest/specification/) | Samarbete mellan opaka fjärragenter | HTTP/JSON, JSON-RPC eller gRPC; strömning och webhook finns | Stateless meddelande eller beständig uppgift och kontext | Agentkort annonserar färdigheter, medietyper, strömning och säkerhetsscheman | v1 är stabil; officiell JavaScript-SDK har v1-stöd som alfaversion | Möjlig framtida agentadapter; saknar standardiserat modellval och tvingande JSON-schema |
<!-- markdownlint-enable MD013 -->

### Open Responses

Open Responses är uttryckligen en öppen, flerleverantörsspecifikation för
modellgränssnitt. Den standardiserar indata, utdata, verktygsanrop och
semantiska strömhändelser. HTTP-svar är JSON eller SSE och WebSocket använder
samma händelseobjekt.
[Specifikationen](https://www.openresponses.org/specification)
anger också att `store: false` kan användas utan beständig lagring.

Det fullständiga OpenAPI-kontraktet innehåller:

- `model`, meddelanden och instruktioner;
- URL- eller base64-baserad bildindata;
- `text.format` med strikt JSON-schema;
- temperatur, tokenbudget, resonemang och andra körparametrar;
- synkront svar, SSE-ström och användningsdata.

Se
[Open Responses referens](https://www.openresponses.org/reference)
och särskilt dess
[JSON-schemaformat](https://www.openresponses.org/reference#jsonschemaresponseformatparam).

Projektet har ett öppet tekniskt styrdokument, daterade specifikationsutgåvor,
ett publicerat OpenAPI-schema och acceptanstester för bland annat text,
systemmeddelande, strömning, verktyg, bilder och flertursindata. Det gör profilen
maskinellt verifierbar.
[Styrningen](https://www.openresponses.org/governance),
[ändringsloggen](https://www.openresponses.org/changelog) och
[acceptanstesterna](https://www.openresponses.org/compliance) är primärkällor.

Begränsningar för Kravhantering:

- Specifikationen definierar inget upptäckts- eller förmågeanrop. En modell kan
  därför inte antas stödja alla standardfält bara för att basadressen svarar.
- Bearer-token är det enda specificerade autentiseringshuvudet. mTLS,
  OAuth-upptäckt och alternativa tjänsteidentiteter ligger utanför kontraktet.
- Ett pågående svar saknar en standardiserad `cancel`-operation. Klienten kan
  avbryta HTTP-begäran eller stänga strömmen, men protokollet garanterar inte
  hur motpartens beräkning avslutas.
- Specifikationen innehåller leverantörsnära val som inte ska bli en del av
  Kravhanterings stabila domänmodell.

Slutsats: inför en versionslåst Open Responses-profil som första externa
standardanslutning. Kräv ett aktiveringstest för exakt de förmågor som den
administratörsvalda körprofilen behöver.

### Modell-API-konventioner och OpenRouter

OpenAI-liknande Chat Completions-API:er är en de facto-konvention, inte en
leverantörsneutral standard. OpenRouter beskriver självt sitt kontrakt som
mycket likt OpenAI Chat API med mindre skillnader. Det normaliserar flera
leverantörer men har även egna routing-, datainsamlings- och
resonemangsparametrar.
[OpenRouters API-referens](https://openrouter.ai/docs/api_reference/overview)
visar både de gemensamma och OpenRouter-specifika fälten.

OpenRouter Agent SDK är ett leverantörsbundet bibliotek för agentloopar,
verktyg, stopvillkor och konversationstillstånd. Dokumentationen hänvisar till
lättare klient-SDK:er när behovet endast är direkta modell-anrop. SDK:n löser
alltså inte standardiseringen av Kravhanterings externa gräns.
[OpenRouter Agent SDK](https://openrouter.ai/docs/agent-sdk/overview)
är fortfarande relevant som en möjlig implementation bakom en anslutning.

Direkta modell-API:er kan fortsatt stödjas genom protokolladaptrar. Deras
modellkataloger, API-nycklar, resonemangsfält och felkoder får inte förekomma i
det applikationsägda användningsfallet.

### Agent Host Protocol

AHP standardiserar ett fristående agentvärdsystem där flera klienter delar en
synkroniserad vy över sessioner och chattar. JSON-RPC-meddelanden går över en
tillförlitlig, ordnad och dubbelriktad ström. WebSocket är vanlig för
fjärranslutningar, men transporten förhandlas inte i protokollet.
[Översikten](https://microsoft.github.io/agent-host-protocol/specification/overview.html)
och
[transportdelen](https://microsoft.github.io/agent-host-protocol/specification/transport.html)
beskriver modellen.

Chattprotokollet har modellval, bilagor, strömmande svarsdelar,
användningsmetadata och en turn-avbrottsåtgärd. Det saknar däremot ett
standardfält där Kravhantering kan skicka ett tvingande JSON-schema och
bestämda modellparametrar för ett enskilt anrop.
[Chattkanalen](https://microsoft.github.io/agent-host-protocol/specification/chat-channel.html)
är byggd för beständig chattstatus, verktygsinteraktion och flera samtidiga
klienter.

AHP har officiellt TypeScript-stöd och förhandlar SemVer-versioner, men
specifikationen är markerad som ett aktivt utkast där brytande ändringar
förväntas.
[Klientbiblioteken](https://microsoft.github.io/agent-host-protocol/guide/clients.html)
minskar implementationskostnaden men ändrar inte ansvarsmissmatchningen.

Slutsats: använd inte AHP som kärnkontrakt. En framtida AHP-adapter kan skapa en
tillfällig session och chatt, men den måste dessutom avtala hur
Kravhanterings JSON-schema, modellprofil och slutresultat representeras. Den
överenskommelsen blir en Kravhantering-profil ovanpå AHP, inte generell
AHP-kompatibilitet.

### Agent Client Protocol

Agent Client Protocol standardiserar kommunikation mellan en editor eller IDE
och en kodagent. En klient initierar anslutningen, skapar en session och skickar
sedan en `session/prompt`. Agenten strömmar meddelande-, verktygs- och
planhändelser tills turen avslutas.
[Introduktionen](https://agentclientprotocol.com/get-started/introduction)
och [protokollöversikten](https://agentclientprotocol.com/protocol/v1/overview)
avgränsar detta ansvar.

ACP förhandlar en heltalsbaserad huvudversion och bland annat förmågor för
bilder, filsystem och terminaler. Alla agenter måste stödja sessionsskapande,
prompt,
uppdatering och avbrott.
[Initieringen](https://agentclientprotocol.com/protocol/v1/initialization)
och [avbrottsreglerna](https://agentclientprotocol.com/protocol/v1/cancellation)
är tydliga på dessa punkter.

För Kravhantering saknas standardiserade fält för systemmeddelanden,
tvingande svars-schema och modellens körparametrar. `stdio` är den
rekommenderade transporten, medan Streamable HTTP fortfarande är ett
utkast. Det gör fjärrdrift och tjänsteautentisering mindre interoperabla.
[Transportdelen](https://agentclientprotocol.com/protocol/v1/transports)
anger denna mognad.

Det finns en officiell TypeScript-SDK för båda protokollsidorna. v1 är aktuell
och v2 är utkast.
[TypeScript-biblioteket](https://agentclientprotocol.com/libraries/typescript)
gör ACP praktiskt för kodagentintegration, men det ändrar inte att
Kravhantering varken är en editor eller behöver kodagentens filsystem och
terminal.

Slutsats: ACP kan vara en framtida adapter till en specifik agentmiljö som
redan erbjuder protokollet. Det är inte ett generellt modell- eller
författarprotokoll.

### Model Context Protocol

Den aktuella MCP-utgåvan `2026-07-28` är stateless och bär protokollversion och
klientförmågor i varje anrop. `server/discover` annonserar serverversioner och
förmågor. Standardtransporterna är `stdio` och Streamable HTTP, och
HTTP-transporten har ett omfattande OAuth-ramverk.
[Arkitekturen](https://modelcontextprotocol.io/specification/2026-07-28/architecture),
[basprotokollet](https://modelcontextprotocol.io/specification/2026-07-28/basic)
och
[transportöversikten](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
visar att MCP nu passar anropsavgränsad verktygs- och kontextintegration bättre
än tidigare utgåvor.

MCP:s roll är ändå motsatt den aktuella gränsen. Kravhantering skulle behöva
agera MCP-server och begära modell-sampling från en MCP-klient som del av ett
annat MCP-anrop. Sampling saknar tvingande svarsschema och en egen
strömhändelsemodell för modelltext.

Viktigast är att sampling är föråldrad från och med `2026-07-28`.
Specifikationen säger uttryckligen att nya implementationer inte ska anta
funktionen och i stället ska integrera direkt med LLM-leverantörernas API:er.
[MCP Sampling](https://modelcontextprotocol.io/specification/2026-07-28/client/sampling)
gör därför MCP olämpligt som ny grund för Kravhanterings AI-anrop.

Det normativa schemat är TypeScript. Det officiella TypeScript-SDK:ts v2-spår
är ännu under utveckling, medan v1 förblir rekommenderat för
produktionsanvändning under övergången.
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
visar den samtidiga specifikations- och SDK-migreringen.

Slutsats: behåll MCP för dess avsedda roller, exempelvis att exponera eller
använda verktyg, data och kontext. Använd det inte som modell-anropsgräns.

### Agent2Agent

A2A 1.0 standardiserar samarbete mellan opaka fjärragenter. Ett agentkort
annonserar adresser, färdigheter, in- och utdatamedietyper, strömning och
säkerhetsscheman. Ett meddelande kan ge ett omedelbart svar eller skapa en
uppgift med status, artefakter, strömning och avbrott.
[A2A 1.0](https://a2a-protocol.org/latest/announcing-1.0/) är markerat som en
stabil produktionsutgåva och
[specifikationen](https://a2a-protocol.org/latest/specification/)
definierar HTTP/JSON-, JSON-RPC- och gRPC-bindningar.

A2A kan överföra text, binära bilder och strukturerad JSON. Klienten kan ange
accepterade utdatamedietyper. Däremot finns inget generellt fält för att välja
agentens underliggande modell eller kräva att slutresultatet följer ett visst
JSON-schema. Ett sådant krav måste uttryckas som färdighetsspecifik metadata
eller en A2A-utökning.

Det officiella JavaScript-SDK:t implementerar fortfarande v0.3 som stabil
linje, medan v1 finns som alfaversion.
[A2A JavaScript SDK](https://github.com/a2aproject/a2a-js)
innebär därför en kortsiktig versionsrisk för en TypeScript-applikation trots
att själva protokollet har nått 1.0.

Slutsats: A2A är den mest relevanta kandidaten om destinationen senare utökas
från modell-anrop till delegering av namngivna verksamhetsuppgifter till
fjärragenter. För nuvarande destination kräver A2A en egen
Kravhantering-utökning och ger mindre interoperabilitet än Open Responses.

Det äldre IBM/BeeAI-protokollet med namnet Agent Communication Protocol är inte
en separat kandidat. Projektet är arkiverat och ingår i A2A.
[Det arkiverade projektet](https://github.com/i-am-bee/acp)
pekar vidare till A2A.

### Övriga angränsande protokoll

Agent User Interaction Protocol (AG-UI) standardiserar händelser mellan en
agent och ett användargränssnitt. Det omfattar körnings-, text-, verktygs- och
tillståndshändelser över bland annat HTTP/SSE, men inte tvingande modell-anrop.
[AG-UI:s arkitektur](https://docs.ag-ui.com/concepts/architecture)
gör det relevant om Kravhantering senare ersätter själva författardialogens
klient-server-protokoll. Dialogen ska vara oförändrad i denna destination, så
AG-UI är utanför den aktuella gränsen.

Secure Low-Latency Interactive Messaging (SLIM) är en säker transport för
protokoll som A2A. Det definierar leverans och kryptering, inte innehållet i ett
AI-anrop.
[SLIM-översikten](https://docs.agntcy.org/slim/overview/)
gör det till ett möjligt framtida transportval, inte ett ersättningskontrakt.

## Rekommenderad målbild

### Applikationsägt kärnkontrakt

Det interna kontraktet ska beskriva Kravhanterings behov och vara mindre än
varje externt protokoll. Det behöver minst följande begrepp:

- `AI-anrop`: meddelanden, bilder, tvingande schema och profilbundna
  körparametrar;
- `AI-anslutning`: konfiguration, autentiseringsreferens,
  protokolladapter och deklarerade förmågor;
- `AI-körprofil`: exakt en anslutning och modell för en anropstyp samt de
  förmågor som är tillåtna eller obligatoriska;
- `AI-strömhändelse`: innehållsdelta, AI-analysdelta, slutresultat eller
  normaliserat fel;
- `AI-anropsresultat`: rått slutresultat, modellidentitet och valfri
  användningsmetadata.

Kontraktet ska ta ett `AbortSignal`. Adaptergränsen ska göra avbrottet
observerbart för anroparen även när ett externt protokoll endast erbjuder
transportavbrott eller kooperativt avbrott.

Kärnkontraktet ska inte innehålla:

- OpenRouter-routing och datainsamlingsfält;
- AHP-kanaler, ACP-sessioner eller A2A-uppgifter;
- MCP-roller eller server-/klientinversion;
- leverantörsspecifika felkoder;
- beständigt konversationstillstånd.

### Protokolladaptrar

Adaptrar ansvarar endast för att:

1. översätta kärnanropet till det externa protokollet;
2. verifiera eller deklarera anslutningens förmågor;
3. mappa ström, slutresultat, användning, avbrott och fel;
4. skapa och städa tillfälligt protokolltillstånd när det krävs.

Adaptrar ska inte bygga verksamhetsprompter, besluta modell, göra automatisk
reservrouting eller validera kravkandidater. Det gör att OpenRouter,
Open Responses och eventuella framtida agentmiljöer kan bytas utan att
författardialogen eller användningsfallet känner till motparten.

### Första standardprofilen

En första Open Responses-profil bör låsa:

- en daterad specifikationsutgåva;
- `POST /v1/responses` med `store: false`;
- Bearer-autentisering över TLS;
- meddelanderoller och bildindata som Kravhantering redan använder;
- `text.format.type: "json_schema"` med `strict: true`;
- både JSON-slutresultat och SSE för de aktuella anropstyperna;
- normaliserad användningsmetadata;
- transportavbrott kopplat till `AbortSignal`;
- ett aktiveringstest som bekräftar schema, vald modell, bilder vid behov,
  strömning, avbrott och felhantering.

Om en anslutning inte klarar profilens aktiveringstest får administratören inte
aktivera den för den aktuella anropstypen.

## Konsekvenser för fortsatt planering

- Det behövs ett beslut om kärnkontraktets exakta TypeScript-typer och
  normaliserade felmodell.
- Det behövs ett beslut om hur anslutningar deklarerar förmågor när
  protokollet saknar upptäckt. Ett verifierat manifest och ett aktivt
  anslutningstest är den enklaste utgångspunkten.
- Open Responses-profilen bör verifieras i en prototyp mot minst OpenRouter
  och en fristående agentmiljö eller lokal modellserver.
- AHP, ACP och A2A bör inte implementeras förrän en konkret agentmiljö endast
  kan nås genom ett av dem och en separat adapter kan motiveras.
- MCP-arbetet i Kravhantering ska hållas arkitektoniskt åtskilt från
  AI-anropsmotorn.

## Källor

Alla externa sakuppgifter ovan bygger på protokollens egna specifikationer,
officiella dokumentationer eller officiella källkodsförråd:

- [Open Responses](https://www.openresponses.org/)
- [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/)
- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/specification/2026-07-28)
- [Agent2Agent](https://a2a-protocol.org/latest/)
- [OpenRouter-dokumentation](https://openrouter.ai/docs/)
- [AG-UI-dokumentation](https://docs.ag-ui.com/)
- [AGNTCY SLIM-dokumentation](https://docs.agntcy.org/slim/overview/)
