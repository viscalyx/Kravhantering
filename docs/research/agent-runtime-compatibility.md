# Externa agentmiljöer för AI-anslutningar

Datum: 2026-07-30

## Fråga och avgränsning

Vilka externa agentmiljöer kan, enligt sina officiella kontrakt, fungera bakom
en administratörskonfigurerad AI-anslutning för Kravhanterings nuvarande
AI-assisterade författande?

Kartläggningen bedömer körbara servermiljöer och deras programmeringsgränssnitt.
En modellleverantör, ett modellbibliotek eller ett SDK utan servergränssnitt är
inte i sig en agentmiljö som Kravhantering kan ansluta till.

Bedömningen utgår från att:

- användargränssnittet och verksamhetsflödet förblir oförändrade,
- Kravhantering bygger instruktioner och obligatoriskt svarsformat,
- varje AI-anrop är avgränsat och tillståndslöst ur Kravhanterings perspektiv,
- administratören väljer AI-anslutning och tillåten funktionalitet per anropstyp,
- förslagsgenerering strömmas medan JSON-reparation inte behöver strömmas,
- bildstöd är en befintlig, valbar förmåga och
- Kravhantering validerar alltid det slutliga svaret innan det används.

Rapporten bedömer inte vilket generellt agentprotokoll som ska väljas. Den
identifierar vilka agentmiljöer som kan ligga bakom en framtida adapter och
vilka krav en sådan adapter behöver uppfylla.

## Slutsats

Det finns ingen verifierad, leverantörsoberoende agentmiljö som direkt uppfyller
hela Kravhanterings anropskontrakt utan en adapter eller en särskilt konfigurerad
agent.

Två miljöer är tillräckligt dokumenterade för en första adapter nu:

1. Dify Workflow API, med ett publicerat och förkonfigurerat arbetsflöde per
   anropstyp.
2. LangGraph Agent Server, med en särskild graf som accepterar
   Kravhanterings anropsdata och lämnar ett validerbart resultat.

Amazon Bedrock AgentCore Runtime kan också användas nu, men bara genom att en
Kravhanteringsspecifik adapter eller agent driftsätts i den. Det visar att
värdtjänsten är användbar, inte att den ger ett portabelt agentkontrakt.

Google Agent Development Kit, Microsoft Agent Framework och A2A-exponerade
miljöer är rimliga framtida adaptermål. De behöver ett gemensamt
Kravhanteringsprofilkontrakt och praktiska överensstämmelseprov innan en
administratör kan aktivera dem.

Amazon Bedrock AgentCore Harness är intressant som hanterad agentmiljö och
accepterar instruktioner och modellval per anrop. Dess nuvarande
`InvokeHarness`-kontrakt saknar dock bildblock och ett obligatoriskt
JSON-schema för slutresultatet. Det är därför ett prototypspår, inte en
fullständig ersättare nu.

Agent Host Protocol och Agent Client Protocol passar inte det aktuella
verksamhetsflödet. De standardiserar värd- respektive klientinteraktion för
interaktiva agent- och kodagentsessioner, inte avgränsade anrop med ett
applikationsbestämt slutresultat. OpenRouter Agent SDK och OpenAI Agents SDK är
bibliotek, inte externa agentmiljöer.

## Minsta kontrakt för en AI-anslutning

En adapter bör göra agentmiljön till ett internt, leverantörsoberoende
anropskontrakt. Följande krav gäller för aktivering:

- stabilt servergränssnitt för fjärr- eller sidecardrift,
- maskin-till-maskin-autentisering och avgränsad hemlighetshantering,
- applikationsbyggda system- och användarinstruktioner per anrop,
- applikationsbyggt svarsformat eller ett förkonfigurerat likvärdigt schema,
- möjlighet att lämna ett slutligt JSON-resultat som Kravhantering kan validera,
- strömning för förslagsgenerering,
- explicit avbrytning eller verifierad avbrytning när klienten kopplar ned,
- bildindata när administratören aktiverar bildprofilen,
- tidsgränser och begränsningar för resursanvändning samt
- deklarerade och praktiskt verifierade förmågor per anropstyp.

Kravhantering bör behandla externa förmågedeklarationer som information, inte
som bevis. Aktivering kräver ett överensstämmelseprov mot den valda
AI-anslutningen, agentversionen och modellen.

## Jämförelse

`Nu via adapter` betyder att de officiella kontrakten täcker tillräckligt för
att implementera och prova det befintliga flödet. Det betyder inte att
agentmiljön är en direkt ersättare utan konfiguration.

<!-- markdownlint-disable MD013 -->
| Agentmiljö | Bedömning | Drift och API | Instruktion och struktur | Bild | Strömning och avbrytning | Autentisering och förmågor |
| --- | --- | --- | --- | --- | --- | --- |
| Dify Workflow API | Nu via adapter | Publicerad REST-API; moln eller egen drift; anrop är oberoende | Instruktioner skickas som arbetsflödesindata; schema konfigureras i arbetsflödet | Ja, via filuppladdning och filindata | SSE och stopp av strömmande uppgift | Bearer-nyckel per app; appparametrar och modellfunktioner finns men räcker inte som aktiveringsbevis |
| LangGraph Agent Server | Nu via adapter | REST-API; fjärr- eller egen drift; tillståndslösa körningar finns | Indata och konfiguration per körning; strukturerat svar byggs i agenten | Beror på graf och modellintegration | Strömning och körningsavbrott finns | API-nyckel eller egen autentisering; modellprofilen ger bara partiell förmågeinformation |
| Amazon Bedrock AgentCore Runtime | Nu med egen driftsatt adapter | Hanterad containerkörning; JSON eller valfri nyttolast | Hela Kravhanteringskontraktet måste implementeras i containern | Ja, demonstrerat för egen runtime | SSE och stopp av aktiv runtimesession | IAM SigV4 eller OAuth 2.0/JWT; inga portabla modellförmågor |
| Amazon Bedrock AgentCore Harness | Prototyp | Hanterad och versionssatt `InvokeHarness`-API | Systemprompt, meddelanden och modell kan anges per anrop; inget strikt slutschema | Nej i nuvarande meddelandekontrakt | Händelseström och tidsgräns; separat stopp gäller Runtime och behöver verifieras för Harness | IAM; GA; flerleverantörsstöd men ingen komplett förmågedeklaration |
| Google Agent Development Kit | Framtida adapter | Egen container eller hanterad drift; kan exponera A2A | Dynamisk instruktion och `output_schema` i en särskild agent | Stöds i ADK-verktyg och meddelanden, men måste verifieras i valt serverkontrakt | Strömning finns; A2A-avbrott måste verifieras i agenten | Driftsättningen styr autentisering; A2A Agent Card är grovkornigt |
| Microsoft Agent Framework | Framtida adapter | Egen drift eller Microsoft Foundry; A2A och OpenAI-kompatibla värdadaptrar | Strukturerade svar finns när underliggande modellklient stöder dem | Mappning i valt värdprotokoll måste verifieras | Strömning och intern avbrytning finns; fjärrkontraktet måste provas | Applikationen eller Azure styr autentisering; flera självdriftspaket är förhandsversioner |
| A2A-kompatibel extern agent | Framtida standardyta | HTTP, JSON-RPC och Agent Card | Strukturerade datadelar finns; inget krav på Kravhanterings JSON-schema | Fil- och datadelar finns | Strömning och `CancelTask` finns när agenten stöder det | Agent Card deklarerar säkerhet, medietyper och grova förmågor |
<!-- markdownlint-enable MD013 -->

## Kandidater som kan provas nu

### Dify Workflow API

Dify publicerar varje app som ett REST-API med en appunik Bearer-nyckel.
Workflow API beskriver anrop som oberoende och erbjuder både blockerande och
strömmande svar. Ett strömmande anrop får ett uppgifts-ID som kan användas för
att stoppa körningen. Arbetsflödet kan ta emot uppladdade bilder och andra filer.
[Dify API guide][dify-api] [Dify Workflow API][dify-workflow]
[Dify streaming][dify-streaming]

Ett Dify-arbetsflöde kan använda en LLM-nod med strukturerat utdata enligt ett
konfigurerat schema. Dify har även ett normaliserat modellgränssnitt där
modellpluginer kan deklarera exempelvis bild- och verktygsstöd.
[Dify app orchestration][dify-orchestration]
[Dify model schema][dify-model-schema]

För Kravhantering innebär det:

- administratören publicerar en Dify-app per anropstyp,
- Kravhanterings adapter mappar instruktion, schema, referensdata och bilder
  till definierade arbetsflödesindata,
- arbetsflödets slutschema hålls kompatibelt med Kravhanterings schema och
- adaptern använder strömmande läge även internt när aktiv avbrytning behövs.

Begränsningen är att schema och tillåtna indata främst hör till den publicerade
Dify-appen. Kravhantering kan inte anta att ett godtyckligt schema kan skickas
med varje anrop. Dify passar därför som en administratörskonfigurerad
agentmiljö, inte som en helt dynamisk modellproxy.

Dify dokumenterar egen drift med Docker Compose. Det gör både fjärr- och
sidecardrift möjliga, men driftformen måste dimensioneras och säkras separat.
[Dify self-hosting][dify-self-hosting]

### LangGraph Agent Server

LangGraph Agent Server exponerar assistenter, trådar och körningar via ett
server-API. En körning kan vara tillståndslös och ta emot indata samt
konfigurationsöverskrivningar. Servern erbjuder strömning och explicit
avbrytning, inklusive avbrytning när strömanslutningen bryts.
[LangGraph Agent Server][langgraph-server]
[LangGraph runs][langgraph-runs]
[LangGraph cancellation][langgraph-cancel]

En LangGraph-agent kan konfigureras med strukturerat svarsformat. Det slutliga
strukturerade svaret blir en del av agentens tillstånd. Egen autentisering kan
läggas framför servern; en fristående egen server kan paketeras som
containerbild och köras i Kubernetes, Docker eller på en virtuell maskin.
[LangChain structured output][langgraph-structured]
[LangGraph authentication][langgraph-auth]
[Standalone Agent Server][langgraph-standalone]

För Kravhantering krävs en särskild graf som:

- accepterar instruktioner, obligatoriskt schema, bilder och referensdata,
- behandlar varje AI-anrop som en ny tillståndslös körning,
- endast lämnar det avtalade slutresultatet till adaptern och
- avbryter den underliggande körningen när Kravhanterings anrop avbryts.

Bildstöd är en egenskap hos grafens meddelandemodell och valda
modellintegration, inte en komplett förmåga som Agent Server deklarerar.
LangChains modellprofiler kan ange strukturerat svarsformat, men de ersätter
inte ett prov av hela grafen. Serverns ändringslogg visar dessutom en aktivt
utvecklad API-yta, vilket motiverar låst serverversion och ett adaptertest vid
uppgradering. [LangGraph server changelog][langgraph-changelog]

### Amazon Bedrock AgentCore Runtime

AgentCore Runtime kör en egen agentcontainer bakom en hanterad anrops-API.
Containern implementerar `/invocations` och kan lämna JSON eller SSE. Den
externa Runtime-API:n accepterar en stor binär nyttolast; AWS visar även
multimodala anrop med bas64-kodad bild. En aktiv runtimesession kan stoppas,
vilket också stoppar pågående strömning.
[AgentCore HTTP contract][agentcore-http]
[AgentCore invocation][agentcore-invoke]
[AgentCore stop session][agentcore-stop]

Runtime stöder IAM SigV4 och OAuth 2.0/JWT som inkommande autentisering.
[AgentCore authentication][agentcore-auth]

Detta kan uppfylla hela Kravhanteringsflödet nu om den driftsatta containern
själv implementerar Kravhanterings kontrakt. AgentCore Runtime är då en
värdtjänst för adaptern, inte ett leverantörsoberoende kontrakt. Den bör därför
inte vara den enda integrationsformen om portabilitet är huvudmålet.

## Kandidater för framtida adaptrar

### Amazon Bedrock AgentCore Harness

AgentCore skiljer uttryckligen mellan Runtime, där kunden tillhandahåller
agentkoden, och Harness, där AWS tillhandahåller agentloopen. Harness är
allmänt tillgänglig och kan använda modeller från Amazon Bedrock, OpenAI,
Google Gemini och LiteLLM-kompatibla leverantörer.
[AgentCore Harness][agentcore-harness]
[Harness and Runtime][agentcore-harness-runtime]

`InvokeHarness` accepterar meddelanden, systemprompt, modell, verktyg,
färdigheter, tidsgräns och resursgränser per anrop. Svaret är en händelseström
med text, verktygsanrop, stopporsak samt användnings- och latensmetadata.
[InvokeHarness][agentcore-invoke-harness]
[Harness streaming][agentcore-harness-start]

Två kontraktsluckor blockerar full kompatibilitet:

- `HarnessContentBlock` har text-, resonemangs- och verktygsblock men inget
  bildblock.
- `InvokeHarness` har inget fält för ett obligatoriskt JSON-schema eller annat
  strikt slutformat.

[Harness content block][agentcore-harness-content]

Ett anrop har en tidsgräns, men AWS dokumenterar `StopRuntimeSession` mot ett
runtime-ARN. Hur ett pågående Harness-anrop aktivt stoppas behöver därför
verifieras. En prototyp bör även kontrollera om ett fält med
leverantörsspecifika parametrar kan begära strukturerat svar utan att göra
adaptern
leverantörsspecifik. Fram till dess passar Harness endast anropstyper utan
bilder och med textbaserad JSON som Kravhantering validerar och kan avvisa.

### Google Agent Development Kit

Google Agent Development Kit kan driftsättas i containerbaserade miljöer och
ADK-projekt kan exponera A2A-rutter. Google Agents CLI kan anropa både en
ADK-server över SSE och en A2A-agent samt skicka bild-, PDF-, ljud- och
videofiler. [Google Agents CLI][google-agents-cli]
[Google agent deployment][google-agent-deployment]
[Google project server][google-project]

ADK:s `LlmAgent` har dynamiska instruktioner, kan utesluta tidigare innehåll
och kan validera utdata mot Pydantic-, objekt- eller Google-schema.
[ADK LlmAgent source][google-llm-agent]

En ADK-agent är därför en rimlig implementering bakom en framtida A2A-adapter.
Före aktivering behöver ett prov visa att:

- Kravhanterings instruktioner och schema faktiskt används per anrop,
- bildernas medietyp bevaras genom den exponerade serverrutten,
- ett avbrott når den körande modellen och
- agenten inte återanvänder konversationstillstånd mellan AI-anrop.

### Microsoft Agent Framework

Microsoft Agent Framework skiljer agenthosting från protokollet som används
för att exponera agenten. Ramverket har värdadaptrar för bland annat A2A och
OpenAI-kompatibla gränssnitt. Egen drift ger applikationen ansvar för
autentisering, routning, lagring, skalning och begärandepolicy.
[Microsoft hosting overview][microsoft-hosting]
[Microsoft self-hosting][microsoft-self-hosting]

Ramverket stöder strukturerade svar när den valda modellklienten stöder
svarsformatet. Dess interna körningsgränssnitt stöder strömning och
avbrytningssignal. En A2A-värd kan exponera strömning och Agent Card, men
applikationen behöver själv ange rutter, datalager, autentisering och
driftsättning. [Microsoft structured output][microsoft-structured]
[Microsoft A2A hosting][microsoft-a2a-hosting]

Flera Pythonpaket för egen drift anges som förhandsversioner. Microsoft
Foundry-hosting minskar driftansvaret men skapar en Azure-specifik anslutning.
En framtida adapter bör därför rikta sig mot det publicerade A2A- eller
Responses-kontraktet, inte mot ramverkets interna objekt.

### A2A som gemensam yta

A2A definierar en fjärragent med ett Agent Card. Kortet kan ange slutpunkt,
säkerhetsscheman, strömning, pushnotiser, färdigheter och förvalda in- och
utmedietyper. Protokollet har meddelanden, filer, strukturerade datadelar,
uppgifter, strömning och avbrytning av en uppgift.
[A2A specification][a2a-specification] [A2A protocol schema][a2a-proto]

Det löser flera transportfrågor men inte hela Kravhanteringskontraktet:

- ett Agent Card intygar inte att agenten accepterar ett godtyckligt JSON-schema,
- `CancelTask` fungerar endast för en uppgift som agenten kan avbryta,
- ett strukturerat datafält garanterar inte det obligatoriska slutformatet och
- bild- eller filmedietyp anger transportstöd, inte den valda modellens förmåga.

En framtida A2A-adapter behöver därför en Kravhanteringsprofil som definierar
indata, slutartefakt, fel, strömmande händelser och avbrytningsbeteende.
Agentkortet kan användas för tidig filtrering, medan aktiveringsprovet avgör om
profilen verkligen uppfylls.

## Alternativ som inte är direkta agentmiljöer

### Agent Host Protocol

Agent Host Protocol är ett utkast för synkroniserat tillstånd mellan en
agentvärd och flera interaktiva klienter. Protokollets egen doktrin anger att
det inte ersätter protokollet mellan värden och agenten och att det inte
standardiserar agentloop, modellleverantör eller verktygsschema.
[AHP overview][ahp-overview] [AHP doctrine][ahp-doctrine]

Specifikationen varnar för brytande ändringar och saknar ett kontrakt för
applikationsbestämt JSON-slutresultat. AHP kan bli relevant om Kravhantering i
framtiden ska vara en interaktiv klient till delade agentsessioner. Det behövs
inte för att byta motor bakom det befintliga författandeflödet.
[AHP specification status][ahp-specification]

### Agent Client Protocol

Agent Client Protocol standardiserar kommunikationen mellan en kodredigerare
och en kodagent. Standardarkitekturen startar agenten som en lokal
underprocess via standardindata och standardutdata och ger agenten tillgång
till redigerarens filer, terminal och behörighetsdialoger. Fjärrtransport anges
som pågående arbete. [ACP introduction][acp-introduction]
[ACP architecture][acp-architecture]

Detta är en annan förtroende- och livscykelmodell än ett serveranrop från en
verksamhetsapplikation. ACP:s avbrott och sessionsstängning gör inte protokollet
till ett svarsformatskontrakt. En enskild ACP-agent kan i framtiden kapslas av
en sidecar, men Kravhantering får då ändå äga ett separat fjärrkontrakt.

### Agent-SDK:er

OpenRouter Agent SDK erbjuder agentloop, verktyg, tillstånd och strömning som
ett TypeScript-bibliotek och använder OpenRouter. Det är inte en fjärrkörbar
agentmiljö och tar inte bort OpenRouter-beroendet.
[OpenRouter Agent SDK][openrouter-agent-sdk]

OpenAI Agents SDK har körningsbibliotek för strukturerat utdata, strömning och
avbrytning. Det kan ingå i en egen sidecar, men serverdrift, autentisering och
det externa kontraktet måste byggas separat.
[OpenAI Agents SDK running][openai-agents-running]
[OpenAI Agents SDK streaming][openai-agents-streaming]

SDK:erna är möjliga implementationer av en Kravhanteringsadapter. De ska inte
presenteras för administratören som anslutningsstandarder.

## Rekommenderad provordning

### 1. Lås Kravhanterings interna kontrakt

Definiera ett internt kontrakt för AI-assisterat författande innan en extern
adapter byggs. Kontraktet bör minst innehålla:

- anropstyp,
- system- och användarinstruktion,
- obligatoriskt slutschema,
- text- och bildindata,
- strömmande text- eller resultathändelser,
- avbrytningssignal och tidsgräns,
- validerat slutresultat,
- normaliserat fel samt
- frivillig användnings- och kostnadsmetadata.

Kontraktet bör inte exponera leverantörens modellobjekt, sessionsobjekt eller
verktygsloop.

### 2. Bygg två avgränsade prov

Första provet använder Dify Workflow API. Det verifierar en
administratörskonfigurerad extern miljö med fördefinierade arbetsflöden,
bildindata, strömning och stopp.

Andra provet använder en A2A-agent, exempelvis Google ADK. Det verifierar hur
långt ett standardiserat agentprotokoll räcker och vilka delar som måste ingå
i Kravhanteringsprofilen.

LangGraph Agent Server är ett bra tredje prov om projektet behöver en
koddefinierad, självdriftad agentmiljö före A2A-provet.

### 3. Aktivera per profil, inte per produktnamn

Administratören bör välja anslutning och tillåten profil per anropstyp.
Aktiveringsprovet bör kontrollera:

1. giltigt textanrop med exakt slutschema,
2. avvisning av ogiltigt eller ofullständigt JSON,
3. strömmande generering,
4. avbrytning och kontroll att fjärrkörningen upphör,
5. bildanrop för bildprofilen,
6. tidsgräns och normaliserat fel,
7. frånvaro av oönskat sessionstillstånd,
8. autentisering med minsta nödvändiga behörighet och
9. att deklarerade förmågor motsvarar observerat beteende.

Resultatet kopplas till en bestämd agentversion, modellkonfiguration och
adapterversion. En ändring av någon av dem kräver nytt prov.

## Källor

Alla källor är officiella specifikationer, produktdokumentationer eller
förstapartskod.

[dify-api]: https://docs.dify.ai/en/api-reference/guides/get-started
[dify-workflow]: https://docs.dify.ai/en/api-reference/guides/workflow
[dify-streaming]: https://docs.dify.ai/en/api-reference/guides/streaming
[dify-orchestration]: https://docs.dify.ai/en/guides/application-orchestrate/creating-an-application
[dify-model-schema]: https://docs.dify.ai/en/develop-plugin/features-and-specs/plugin-types/model-schema
[dify-self-hosting]: https://github.com/langgenius/dify/blob/main/docker/README.md
[langgraph-server]: https://docs.langchain.com/langsmith/agent-server
[langgraph-runs]: https://docs.langchain.com/langsmith/runs
[langgraph-cancel]: https://docs.langchain.com/langsmith/cancel-run
[langgraph-structured]: https://docs.langchain.com/oss/python/langchain/structured-output
[langgraph-auth]: https://docs.langchain.com/langsmith/auth
[langgraph-standalone]: https://docs.langchain.com/langsmith/deploy-standalone-server
[langgraph-changelog]: https://docs.langchain.com/langsmith/agent-server-changelog
[agentcore-http]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html
[agentcore-invoke]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
[agentcore-stop]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-stop-session.html
[agentcore-auth]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html
[agentcore-harness]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html
[agentcore-harness-runtime]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
[agentcore-invoke-harness]: https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html
[agentcore-harness-start]: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html
[agentcore-harness-content]: https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessContentBlock.html
[google-agents-cli]: https://google.github.io/agents-cli/cli/
[google-agent-deployment]: https://google.github.io/agents-cli/guide/deployment/
[google-project]: https://google.github.io/agents-cli/guide/project-structure/
[google-llm-agent]: https://github.com/google/adk-python/blob/v1.34.0/src/google/adk/agents/llm_agent.py
[microsoft-hosting]: https://learn.microsoft.com/en-us/agent-framework/hosting/
[microsoft-self-hosting]: https://learn.microsoft.com/en-us/agent-framework/hosting/self-hosting
[microsoft-structured]: https://learn.microsoft.com/en-us/agent-framework/agents/structured-outputs
[microsoft-a2a-hosting]: https://learn.microsoft.com/en-us/agent-framework/hosting/self-hosting/a2a
[a2a-specification]: https://github.com/a2aproject/A2A/blob/main/docs/specification.md
[a2a-proto]: https://github.com/a2aproject/A2A/blob/main/specification/a2a.proto
[ahp-overview]: https://microsoft.github.io/agent-host-protocol/
[ahp-doctrine]: https://microsoft.github.io/agent-host-protocol/guide/doctrine.html
[ahp-specification]: https://microsoft.github.io/agent-host-protocol/specification/overview.html
[acp-introduction]: https://agentclientprotocol.com/get-started/introduction
[acp-architecture]: https://agentclientprotocol.com/get-started/architecture
[openrouter-agent-sdk]: https://openrouter.ai/docs/agent-sdk/overview
[openai-agents-running]: https://openai.github.io/openai-agents-python/running_agents/
[openai-agents-streaming]: https://openai.github.io/openai-agents-js/guides/streaming/
