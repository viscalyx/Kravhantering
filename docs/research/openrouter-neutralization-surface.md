# OpenRouter-beroendets neutraliseringsyta

## Fråga och avgränsning

Vilka delar av Kravhantering formas direkt eller indirekt av OpenRouter, och
vilka delar behöver neutraliseras för att AI-anslutningar ska bli utbytbara
utan att verksamhetsflödet för AI-assisterat författande förändras?

Inventeringen omfattar produktionskod, interna typer, REST- och SSE-kontrakt,
modell- och förmågekatalog, användar- och administrationsgränssnitt,
miljövariabler, hemligheter, felredigering, dataintegritet, krediter, kostnad,
loggning, tester, dokumentation, containrar och drift.

Repo:t är primär källa. Rapporten bedömer inte vilket externt agentprotokoll
som ska väljas.

## Sammanfattande svar

OpenRouter är utbytbart utan att ändra kravförfattandets verksamhetsflöde, men
dagens leverantörsgräns ligger för högt upp. REST-rutterna och
`AiRequirementGenerator` känner till OpenRouters modellidentifierare,
förmågenamn, datapolicy, resonemang, priser och krediter. Den gemensamma
importkoden importerar dessutom OpenRouter-ägda innehållstyper. Det finns alltså
ingen neutral AI-anslutningsport mellan appens användningsfall och
leverantören. Se
[OpenRouter-klienten](../../lib/ai/openrouter-client.ts),
[modellkatalogen](../../lib/ai/openrouter-model-catalog.ts),
[den delade ruttskoden](../../app/api/ai/requirement-import-shared.ts) och
[författardialogen](../../components/AiRequirementGenerator.tsx).

Neutraliseringen behöver omfatta fem sammanhängande ytor:

1. En appägd anrops- och resultatmodell mellan användningsfallen och varje
   anslutningsadapter.
2. Administratörsstyrd anslutnings-, modell- och förmågekonfiguration i stället
   för OpenRouter-styrda val i författardialogen.
3. En neutral förmågemodell för strukturerat resultat, bilder, strömning,
   resonemang och användningsmetadata.
4. Leverantörsoberoende hemligheter, fel, loggmetadata och driftkonfiguration.
5. Borttagning eller omplacering av OpenRouter-specifika katalog-, pris- och
   kreditfunktioner.

Följande ska däremot ligga kvar på applikationssidan: behörighetskontroll,
avstängningsregler, AI-säkerhet, begränsningar och throttling, destinations- och
promptbygge, kravimportens JSON-schema, slutlig schemavalidering,
felredigering, korrelations-id, kapacitetsloggning, mänsklig granskning och
ordinarie import. Dessa regler finns i
[genereringsrutten](../../app/api/ai/generate-requirement-import/route.ts),
[reparationsrutten](../../app/api/ai/repair-requirement-import-json/route.ts),
[AI-säkerheten](../../lib/ai/safety.ts),
[kravprompten](../../lib/ai/requirement-prompt.ts) och
[kravimportschemat](../../lib/requirements/import-schema.ts).

Det finns ingen direkt OpenRouter-beroende npm-klient. Integrationen använder
`fetch` mot ett OpenAI-kompatibelt HTTP- och SSE-format. Det minskar
paketkopplingen men inte kontraktskopplingen:
[package.json](../../package.json) och
[OpenRouter-klienten](../../lib/ai/openrouter-client.ts).

## Nuvarande anropskedja

### Generering

1. Författardialogen hämtar modeller och krediter från `/api/ai/models` och
   `/api/ai/credits`, väljer modell och skickar modell, resonemangsnivå och
   OpenRouter-datapolicy tillsammans med behov, antal och bilder.
   [Författardialogen](../../components/AiRequirementGenerator.tsx)
2. Genereringsrutten autentiserar och auktoriserar, tillämpar throttling och
   avstängningsregler samt screenar indata innan leverantörsarbete.
   [Genereringsrutten](../../app/api/ai/generate-requirement-import/route.ts)
3. Rutten bygger destinationsspecifik importinstruktion, systemprompt,
   användarprompt och appägt JSON-schema.
   [Kravprompten](../../lib/ai/requirement-prompt.ts)
4. Rutten löser den valda modellens OpenRouter-förmågor och anropar den
   strömmande OpenRouter-klienten.
   [Modellkatalogen](../../lib/ai/openrouter-model-catalog.ts)
5. OpenRouter-klienten översätter till `chat/completions`, OpenRouters
   `reasoning`, `provider`, `response_format` och strömmande deltaformat.
   [OpenRouter-klienten](../../lib/ai/openrouter-client.ts)
6. Rutten screenar resonemang och slutresultat, validerar kravimportfilen och
   skickar appägda SSE-händelser till dialogen.
   [Genereringsrutten](../../app/api/ai/generate-requirement-import/route.ts)
7. Dialogen visar resultatet i importens befintliga granskningsflöde. Ett krav
   sparas först genom ordinarie import.
   [ADR 0034](../adr/0034-ai-assisterat-forfattande-anvander-kravimportkontraktet.md)

### Reparation

Reparationen är ett separat, icke-strömmande anrop. Rutten tar emot felaktig
JSON och valideringsfel, gör samma tillgänglighets-, behörighets- och
säkerhetskontroller, bygger en reparationsprompt, använder samma valda
OpenRouter-modell och validerar det reparerade resultatet mot importschemat.
[Reparationsrutten](../../app/api/ai/repair-requirement-import-json/route.ts)
och [reparationsprompten](../../lib/ai/requirement-prompt.ts).

Ingen kod lagrar en beständig modell- eller agentsession mellan generering,
omgenerering och reparation. Detta är en appägd engångsanropsgräns som en
adapter kan uppfylla även om en extern agentmiljö skapar en tillfällig intern
session.

## Direkt OpenRouter-specifik koppling

### Transport och autentisering

`lib/ai/openrouter-client.ts` äger:

- fast bas-URL `https://openrouter.ai/api/v1`;
- Bearer-autentisering med `OPENROUTER_API_KEY`;
- `POST /chat/completions`, `GET /models`, `GET /auth/key` och
  `GET /credits`;
- OpenAI-kompatibla `messages`, `image_url`, `response_format` och SSE-delta;
- OpenRouters `include_reasoning`, `reasoning`, `reasoning_details` och
  `provider`;
- OpenRouters usagefält och `cost`;
- leverantörsspecifika feltexter.

Hela denna översättning hör hemma bakom en adapter. Timeouter,
anropsavbrytning och kravet på ett validerbart resultat är appägda krav, men
värden och mekanik kan implementeras per adapter.

### Interna typer som läcker leverantörskontraktet

Följande typer ligger i OpenRouter-klienten men används ovanför
leverantörsgränsen:

- `OpenRouterModel`;
- `GenerationStats`;
- `StreamEvent`;
- `NonStreamingResult`;
- `TextContentPart`, `ImageContentPart` och `ContentPart`;
- `ProviderPreferences`;
- `KeyInfo`.

`requirement-import-shared.ts` importerar `ContentPart`,
`requirement-prompt.ts` importerar `GenerationStats`, modellrutten returnerar
`OpenRouterModel`, och dialogen duplicerar flera av typerna lokalt.
[Klienttyperna](../../lib/ai/openrouter-client.ts),
[delad ruttskod](../../app/api/ai/requirement-import-shared.ts),
[prompttyperna](../../lib/ai/requirement-prompt.ts) och
[dialogtyperna](../../components/AiRequirementGenerator.tsx).

Neutralisering kräver appägda motsvarigheter för indata, bilder,
förloppshändelser, slutresultat, förmågor och användningsmetadata. En adapter
ska översätta dessa till och från sitt protokoll. Appkoden ska inte importera
typer från en namngiven adapter.

### Modell- och förmågekatalog

Modellkatalogen kräver alltid OpenRouters parametrar `reasoning`, `stream` och
`response_format`. Den gör ett extra kataloganrop för
`structured_outputs`, härleder `vision` ur modalitetssträngen och härleder
leverantörsnamn ur delen före `/` i modell-id:t.
[Klientens modellista](../../lib/ai/openrouter-client.ts) och
[katalogens berikning](../../lib/ai/openrouter-model-catalog.ts).

`/api/ai/models` exponerar OpenRouter-modellen direkt, tar emot
`supported_parameters`, har ett cacheindex per parameterkombination och
hanterar explicit kataloguppdatering. Det är ett användarorienterat
OpenRouter-katalogkontrakt, inte en generell anslutningsport.
[Modellrutten](../../app/api/ai/models/route.ts).

En neutral förmågemodell kan behålla appens frågor:

- Kan anslutningen ge strukturerat, validerbart resultat?
- Kan profilen ta emot bilder?
- Kan den leverera förlopp som appens SSE-kontrakt kan återge?
- Kan den redovisa resonemang och användning när policyn tillåter det?
- Kan ett pågående anrop avbrytas?

Den ska inte standardisera OpenRouters parameternamn eller anta att en extern
agentmiljö har en global, dynamisk modellkatalog.

### Modellval och standardmodell

Klienten använder `NEXT_PUBLIC_DEFAULT_MODEL` och annars det inbyggda
`anthropic/claude-sonnet-4`. Dialogen prioriterar billigaste tillgängliga
favorit, därefter standardmodell och katalogordning.
[Standardmodellen](../../lib/ai/openrouter-client.ts),
[valalgoritmen](../../components/AiRequirementGenerator.tsx) och
[styrdokumentationen](../governance/reference-data-and-ai.md).

Modell-id i användarens genererings- och reparationspayload är därmed en direkt
OpenRouter-koppling. En administratörsstyrd körprofil per anropstyp behöver
ersätta den. Användningsfallet kan fortfarande logga ett neutralt
anslutnings- och modell-id när adaptern tillhandahåller det.

### Strukturerat resultat

Appen äger kravimportens JSON-schema och slutlig Zod-validering. OpenRouter-
klienten äger däremot strategin som mappar schemat till `json_schema` när
`structured_outputs` finns och annars till `json_object`.
[Schemastrategin](../../lib/ai/openrouter-client.ts),
[schemaanpassningen](../../lib/ai/requirement-prompt.ts) och
[slutvalideringen](../../app/api/ai/generate-requirement-import/route.ts).

Schema och slutvalidering ska bevaras. Hur en anslutning uppnår resultatet är en
adapterförmåga: strikt schema, JSON-läge, agentinstruktion eller en annan
protokollmekanism. En profil som inte kan ge tillräckligt validerbart resultat
ska inte vara aktiverbar för anropstypen.

### Bilder

Appen äger gränserna tre bilder, 10 MiB per bild, tillåtna MIME-typer,
base64-validering och säkerhetsscreening av bildmetadata. Översättningen till
OpenAI-formatets `image_url` ligger i delad ruttskod men bygger på typen från
OpenRouter-klienten.
[Bildvalideringen](../../app/api/ai/requirement-import-shared.ts) och
[bild-UI:t](../../components/AiRequirementGenerator.tsx).

Gränserna och det synliga flödet kan bevaras. Bilden behöver flyttas genom en
neutral appägd innehållstyp och översättas per adapter. En körprofil utan
bildförmåga ska inte användas för anrop med bilder.

### Datapolicy

Dialogen lagrar användarval i `ai-data-policies` och skickar
`data_collection: deny`, `zdr` och `enforce_distillable_text` som
`providerPreferences`. Ruttschemat och OpenRouter-klienten speglar dessa namn
direkt.
[Dialogens policyöversättning](../../components/AiRequirementGenerator.tsx),
[ruttschemat](../../app/api/ai/requirement-import-shared.ts) och
[klientens providerfält](../../lib/ai/openrouter-client.ts).

Detta är OpenRouter-routing, inte en generell dataskyddspolicy. Appens invariant
är att administratören bara ska kunna aktivera anslutningar som uppfyller
organisationens beslut om extern behandling, lagring, träning, egress och
sekretess. Adaptern kan ha leverantörsspecifik konfiguration, men
författaranropet ska inte bära OpenRouter-fält.

### Resonemang och strömning

Dialogen kräver `reasoning` och `stream`, låter användaren välja
resonemangsnivå, visar resonemang under körning och skickar
`reasoningEffort`. Klienten mappar detta till OpenRouter och normaliserar
`reasoning` eller `reasoning_details`.
[Dialogens förmågor](../../components/AiRequirementGenerator.tsx) och
[strömklienten](../../lib/ai/openrouter-client.ts).

Appens SSE-händelser `thinking`, `generating`, `done`, `validation_error` och
`error` är däremot appägda. Rutten kan behålla dem och syntetisera en
förloppsfas även när adaptern bara lämnar ett slutresultat. Texten
`thinking` och exakt resonemangsnivå behöver behandlas som valfria,
administratörsstyrda förmågor.

### Krediter, pris och kostnad

`/api/ai/credits` använder OpenRouters nyckel- och management-API.
Dialogen visar nyckelgräns, användning, fri eller betald nivå och
organisationskrediter. Modellistan visar OpenRouters prompt-, completion- och
reasoningpris. Genereringsresultat och kapacitetsloggning antar ett numeriskt
`cost`-fält.
[Kreditkoden](../../lib/ai/openrouter-client.ts),
[kreditrutten](../../app/api/ai/credits/route.ts),
[pris- och kredit-UI:t](../../components/AiRequirementGenerator.tsx) och
[kapacitetsloggningen](../../lib/observability/capacity.ts).

Kreditsaldo, fri nivå och OpenRouter-priser ska inte ingå i det generella
författarflödet. Generisk användningsmetadata kan vara valfri och exempelvis
innehålla tokenantal, varaktighet och en adapterrapporterad kostnad med
uttrycklig valuta och betydelse. Avsaknad av kostnadsmetadata får inte göra ett
annars giltigt resultat ogiltigt.

## Indirekt koppling i användar- och administrationsgränssnitt

### Författardialogen

Verksamhetsflödet består av behov och sammanhang, antal kandidater, valfri bild,
generering, förlopp, analys och råresultat, reparation, urval samt övergång till
importgranskning. Detta kan bevaras.

Följande ytor är OpenRouter-motiverade och behöver tas bort från eller göras
icke-interaktiva i författardialogen:

- modellista, sökning, grupperad leverantörsvisning och favoriter;
- prompt-, completion- och reasoningpriser;
- kredit- och organisationssaldo;
- val av resonemangsnivå;
- val och antal för `structured_outputs` och `vision`;
- `data_collection`, `zdr` och `enforce_distillable_text`;
- localStorage-nycklarna `ai-favorite-models`, `ai-model-filters` och
  `ai-data-policies`.

Belägg finns samlat i
[AiRequirementGenerator](../../components/AiRequirementGenerator.tsx) och
[förklaringsdialogen](../../components/AiRequestExplanationDialog.tsx).

Visning av förlopp, tokenantal, kostnad och resonemang behöver tåla att en
anslutning inte erbjuder metadata. Resultat- och importgranskningen är redan
oberoende av OpenRouter efter att payloaden har validerats.

### Administrationsgränssnittet

Admin Center kan i dag slå av kravgenerering och styra AI-säkerhetsregler,
forensisk loggning samt MCP-gränser. Det saknar tabeller och API-kontrakt för
AI-anslutningar, hemlighetsreferenser, körprofiler, modellrouting och
förmågepolicy.
[Admin-API:t](../../app/api/admin/ai-settings/route.ts),
[AI-inställningsmodellen](../../lib/ai/generation-availability.ts),
[DAL-lagret](../../lib/dal/ai-settings.ts) och
[adminpanelen](../../app/%5Blocale%5D/admin/panels/settings/ai-settings-panel.tsx).

Den befintliga singleton-raden `ai_settings` innehåller endast den globala
genereringsflaggan och AI-/MCP-inställningar. Nya anslutningar och
körprofiler är därför ny beständig konfiguration, inte en enkel namnändring av
ett befintligt fält.
[Entiteten](../../lib/typeorm/entities/ai-setting.ts) och
[migrationen](../../typeorm/migrations/0037_ai_settings.mjs).

## Appägda invariants som ska bevaras

### Auktoritet och mänsklig granskning

AI-resultat är stöddata och blir inte auktoritativt krav förrän en behörig
användare sparar det genom ordinarie arbetsflöde. Samma taxonomi,
auktorisering, livscykel, spårbarhet och retention gäller efter import.
[ADR 0015](../adr/0015-ai-assisterat-forfattande.md) och
[ADR 0034](../adr/0034-ai-assisterat-forfattande-anvander-kravimportkontraktet.md).

### Kanoniskt importkontrakt

AI-generering och reparation ska fortsätta lämna en `Kravimportfil`.
Kravhantering äger destinationsspecifik importinstruktion, lokaliserade
promptdelar, JSON-schema, Zod-validering och importgranskning.
[Referensdata och AI](../governance/reference-data-and-ai.md),
[importservicen](../../lib/requirements/import-service.ts) och
[importschemat](../../lib/requirements/import-schema.ts).

### Behörighet och transportskydd

Generering och reparation är skyddade mutationer med samma
behörighetssammanhang som kravförfattandet. CSRF, autentisering,
auktorisering, request-id och korrelations-id ligger utanför adaptern.
[Genereringsrutten](../../app/api/ai/generate-requirement-import/route.ts),
[reparationsrutten](../../app/api/ai/repair-requirement-import-json/route.ts)
och [skyddad mutationsrutt](../../lib/http/secure-mutation-route.ts).

### Tillgänglighet och fail closed

Admin-inställningen och `AI_REQUIREMENT_GENERATION_DISABLED` ska fortsatt kunna
stoppa anrop före katalog-, prompt- och leverantörsarbete. Fel vid läsning av
AI-säkerhetsregler ska också stoppa flödet.
[Tillgänglighets-DAL](../../lib/dal/ai-settings.ts),
[driftspärren](../../lib/ai/scan-guard.ts) och
[ADR 0038](../adr/0038-db-forvaltade-ai-sakerhetsregler.md).

### AI-säkerhet

Indata ska screenas före extern behandling. Strömmat resonemang och
slutresultat ska screenas innan de exponeras. Osäkert innehåll ska aldrig
returneras som råtext eller valideringspayload. Säkerhetsmetadata och separat
förensisk loggning ska behålla sina olika innehållsgränser.
[AI-säkerheten](../../lib/ai/safety.ts),
[AISVS-mappningen](../security-privacy/aisvs-ai-mcp-control-mapping.md) och
[ADR 0039](../adr/0039-forensisk-loggning-av-ai-sakerhetsblockeringar.md).

En ny adapter får inte flytta appens enda säkerhetskontroll till den externa
agentmiljön. Externa skydd kan komplettera, men inte ersätta, appens in- och
utdatakontroller.

### Begränsningar, avbrytning och kapacitet

Text-, bild- och arraygränser, fem AI-anrop per minut per aktör och process,
`Retry-After`, långsamhetströskel, avbrytning via `AbortSignal` och
kapacitetshändelser är appägda. Adaptertimeouter behöver rymmas inom dessa
regler.
[Delade gränser](../../app/api/ai/requirement-import-shared.ts),
[kapacitetsdokumentationen](../operations/capacity-management.md) och
[OpenRouter-timeouterna](../../lib/ai/openrouter-client.ts).

### Säkra fel

Klienter ska fortsatt få stabila, sanerade fel som
`AI provider is unavailable`, medan intern diagnostik redigerar Bearer-token,
JWT, HSA-id, hemlighetstilldelningar och SQL-fragment.
[Säkra fel](../../lib/http/safe-errors.ts).

Mönstret för `sk-or-*` är OpenRouter-specifikt och ska ligga i adapter- eller
hemlighetsredigeringens utökbara regeluppsättning. Den generella
felredigeringen och förbudet mot att exponera leverantörssvar ska bestå.

### Loggning

Kapacitetsloggningen äger operation, utfall, status, varaktighet, bildantal,
bildstorlek och tokenantal. AI-säkerhetsloggen äger beslut, regelmetadata,
blocked step, riktning och korrelations-id. Modell och leverantör kan
normaliseras till anslutnings- och modellmetadata.
[Genereringsloggningen](../../app/api/ai/generate-requirement-import/route.ts),
[reparationsloggningen](../../app/api/ai/repair-requirement-import-json/route.ts)
och [säkerhetsloggningen](../../lib/ai/safety.ts).

Prompt, rått modellresultat, bilddata och reparations-JSON ska inte börja
förekomma i vanlig kapacitets- eller säkerhetsmetadata när adaptrar införs.

## REST- och SSE-kontrakt

### Kontrakt som kan bestå

- `POST /api/ai/generate-requirement-import` som det synliga
  genereringsanropet.
- `POST /api/ai/repair-requirement-import-json` som separat reparation.
- Kravimportens payload, schemafel och importgranskning.
- SSE-händelserna `thinking`, `generating`, `done`, `validation_error` och
  `error`, med valfria metadatafält.
- Sanerade 400-, 422-, 429- och 503-beteenden.
- Avbrytning när webbläsaren avslutar anropet.

Rutterna ligger medvetet utanför OpenAPI- och Schemathesis-kontraktet i v1.
[API-säkerhetsdokumentationen](../security-privacy/api-security.md).

### Kontrakt som behöver neutraliseras

- `model`, `providerPreferences` och `reasoningEffort` i genererings- och
  reparationspayloaden.
- `model`, OpenRouter-formad `stats` och alltid närvarande `thinking` i
  slutresultatet.
- hela användarkontraktet för `GET /api/ai/models`;
- hela OpenRouter-kreditkontraktet för `GET /api/ai/credits`;
- `supported_parameters` som frågeparameter;
- antagandet att ett genereringsanrop alltid kan strömma modellresonemang.

Utåt kan `model` tillfälligt finnas kvar som diagnostisk responsmetadata, men
det ska inte vara användarstyrd routing. Författar-UI:t ska kunna arbeta utan
modell-, kostnads- eller resonemangsmetadata.

## Miljövariabler, hemligheter, containrar och drift

Direkta OpenRouter-värden finns i:

- `OPENROUTER_API_KEY`;
- `OPENROUTER_MGMT_API_KEY`;
- `NEXT_PUBLIC_DEFAULT_MODEL`;
- den hårda driftspärren `AI_REQUIREMENT_GENERATION_DISABLED`.

De dokumenteras eller kopieras i
[.env.example](../../.env.example),
[appcontainerns exempel](../../containers/app/.env.app.example),
[produktionsmallen](../../containers/production/env/app.env.template),
[devspace-hemligheterna](../../dev/devspaces/kravhantering-secrets.example.yaml),
[containerdokumentationen](../../containers/app/README.md),
[RHEL-driftsättningen](../operations/rhel10-production-deploy.md) och
[single-node-driftsättningen](../operations/rhel10-production-single-node-self-contained-deploy.md).

Säkerhets- och prodlike-jobb tömmer OpenRouter-nycklar och använder
driftspärren för att förhindra extern trafik.
[Prodlike-action](../../.github/actions/prodlike-stack/action.yml),
[full DAST](../../.github/workflows/security-dast-full.yml) och
[MCP-säkerhetsjobbet](../../.github/workflows/security-mcp.yml).

Neutralisering behöver:

- behålla en generell driftspärr;
- ersätta publikt standardmodellval med serverstyrda körprofiler;
- referera till hemligheter per anslutning utan att returnera dem i admin-API;
- låta en adapter deklarera nödvändiga hemligheter och endpointkonfiguration;
- uppdatera säkerhetsjobb så att alla externa AI-anslutningar är avstängda
  under aktiva skanningar;
- behålla principen att riktiga nycklar bara tillförs vid körning.

En enda generell API-nyckelvariabel räcker inte för flera samtidiga externa
agentmiljöer. Hemlighetsmodellen behöver stödja flera namngivna anslutningar
utan att lagra klartext i SQL Server eller klientkonfiguration.

## Dataintegritet och extern behandling

Kravhantering betraktar prompt, instruktion, bilder, taxonomi, modellval,
AI-svar och användningsmetadata som information som kan lämna applikationen.
OpenRouter och valda modellleverantörer är uttryckligt dokumenterade mottagare
när AI-funktionen är aktiverad.
[Informationsmängder](../security-privacy/informationsmangder-kravhantering.md)
och
[ADR 0021](../adr/0021-uttrycklig-extern-behandling-av-produktionsdata.md).

När anslutningar blir utbytbara ska dokumentationen och adminmodellen beskriva
den faktiskt aktiva anslutningen, dess eventuella underleverantörer,
dataskyddsroll, geografiska behandling, retention, träning, loggning och
egress. Att ersätta ordet OpenRouter med ett generiskt ord räcker inte:
förvaltningen behöver kunna avgöra vilken extern part varje körprofil skickar
information till.

## Testyta

### Tester som är direkt OpenRouter-specifika

- [openrouter-client.test.ts](../../tests/unit/openrouter-client.test.ts)
  verifierar HTTP-body, SSE-delta, resonemang, timeouter, katalog och krediter.
- [openrouter-model-catalog.test.ts](../../tests/unit/openrouter-model-catalog.test.ts)
  verifierar OpenRouter-parametrar, `vision` och `structured_outputs`.
- [ai-models-route.test.ts](../../tests/unit/ai-models-route.test.ts) och
  [ai-credits-route.test.ts](../../tests/unit/ai-credits-route.test.ts)
  verifierar katalog- och kreditkontrakten.
- [safe-errors.test.ts](../../tests/unit/safe-errors.test.ts) verifierar bland
  annat `sk-or-*`-redigering.

Dessa ska delas i neutrala portkontraktstester och adapterspecifika tester.

### Tester som blandar appinvariants och leverantör

- [genereringsrutten](../../tests/unit/ai-generate-requirements-route.test.ts)
  och
  [reparationsrutten](../../tests/unit/ai-repair-requirement-import-json-route.test.ts)
  mockar OpenRouter-funktioner men verifierar även behörighet, säkerhet,
  validering, loggning och säkra fel.
- [författardialogens enhetstest](../../tests/unit/ai-requirement-generator.test.tsx)
  verifierar både verksamhetsflödet och modell-, kredit-, pris-, policy- och
  resonemangs-UI.
- [importgranskningens integrationstest](../../tests/integration/requirements/ai-assisted-authoring-import-review.spec.ts)
  stubbar alla fyra AI-rutter samtidigt som det verifierar generering,
  reparation och importgranskning.
- [adminintegrationstestet](../../tests/integration/admin/ai-settings.spec.ts)
  verifierar avstängningsregler men stubbar också OpenRouter-katalog och
  krediter.

Appinvariants ska flyttas till leverantörsoberoende test-fixtures. Varje adapter
behöver ett gemensamt kontrakttest för:

- textgenerering och reparation;
- bildöverföring när förmågan deklareras;
- validerbart slutresultat;
- avbrytning och timeout;
- normaliserade förlopps- och felhändelser;
- valfri användningsmetadata;
- frånvaro av läckta hemligheter och leverantörsfel.

### Säkerhets- och driftstester

Säkerhetstester och skanningar förutsätter i dag tomma OpenRouter-nycklar och
ingen liveleverantör.
[DAST-dokumentationen](../security-privacy/security-dast-full.md),
[MCP-DAST](../security-privacy/mcp-seeded-dast.md) och
[utvecklarflödet](../development/ai-assisted-authoring-developer-workflow.md).

De ska i stället verifiera att ingen konfigurerad adapter kan nås i
säkerhetskörningar. Liveanrop ska fortsatt ligga utanför automatiserad CI.

## Dokumentation och visuella artefakter

OpenRouter nämns i:

- ADR:er om AI och extern behandling;
- AI-utvecklarflödet och utvecklingsmiljöer;
- styrning av referensdata och AI;
- informationsmängder och AISVS-mappning;
- DAST- och säkerhets-CI-dokumentation;
- RHEL- och containerdrift;
- svensk och engelsk UI-text;
- AI-arkitekturbilder och användarguidens skärmbilder.

Den fullständiga träfflistan finns genom repo-sökning efter `OpenRouter`,
`OPENROUTER` och `NEXT_PUBLIC_DEFAULT_MODEL`. Centrala källor är
[AI-utvecklarflödet](../development/ai-assisted-authoring-developer-workflow.md),
[AI-styrningen](../governance/reference-data-and-ai.md),
[AISVS-mappningen](../security-privacy/aisvs-ai-mcp-control-mapping.md),
[engelska meddelanden](../../messages/en.json) och
[svenska meddelanden](../../messages/sv.json).

Arkitekturbilden
[ai-assisted-authoring-llm-integration-architecture.png](../images/ai-assisted-authoring-llm-integration-architecture.png)
visar uttryckligen OpenRouter och behöver ersättas eller uppdateras när den
neutrala gränsen implementeras. Användarguidens skärmbilder behöver uppdateras
när modell-, kredit-, förmåge- och datapolicykontrollerna försvinner från
författardialogen.

## Rekommenderad neutral gräns

En minsta appägd port behöver uttrycka:

- anropstyp: generering utan bilder, generering med bilder eller
  JSON-reparation;
- körprofilens stabila id och adaptertyp;
- lokaliserade system- och användarinstruktioner;
- neutral text- och bildindata;
- obligatoriskt kravimportschema;
- `AbortSignal` och appägd tidsbudget;
- förloppshändelser utan krav på modellens råa SSE-format;
- ett slutresultat med rå JSON-text, valfritt redovisat resonemang,
  normaliserad användning och diagnostiska anslutnings-/modell-id:n;
- en klassificerad feltyp som appen mappar till säkra REST- och SSE-fel.

Porten ska inte uttrycka:

- OpenRouter-URL eller nyckelformat;
- `supported_parameters`;
- `providerPreferences`;
- OpenRouters `reasoning`-objekt;
- OpenAI-formatets `image_url`;
- OpenRouter-krediter eller fri nivå;
- antagandet att leverantör och modell kan härledas ur `modell/id`;
- en beständig agentsession.

Adaptern äger protokollhandshake, autentisering, endpoint, sessionen som krävs
för ett enskilt anrop, modellidentifierare, schemaförhandling, strömtolkning,
leverantörsfel och leverantörsspecifik användningsmetadata. Applikationen äger
allt före och efter denna port.

## Neutraliseringsordning

Följande ordning minskar risken att OpenRouter-detaljer flyttas in i en ny
abstraktion:

1. Definiera appens neutrala förmågor, anrop, förlopp, resultat och fel utifrån
   invariants ovan.
2. Lägg den befintliga OpenRouter-koden bakom en adapter och kör gemensamma
   kontrakttester mot den.
3. Inför beständiga AI-anslutningar, hemlighetsreferenser och tre
   administratörsstyrda körprofiler.
4. Flytta modell-, datapolicy-, resonemangs- och förmågeval från
   författarpayloaden till profilvalideringen.
5. Gör författar-UI och appens SSE-hantering toleranta mot saknat resonemang,
   pris, kostnad och tokenmetadata.
6. Ta bort eller omplacera `/api/ai/models`, `/api/ai/credits` och tillhörande
   localStorage-, UI- och översättningsytor.
7. Generalisera env-, secret-, felredigerings-, logg-, CI-, container- och
   driftdokumentation.
8. Lägg till ytterligare adaptrar först när den neutrala porten och
   kontrakttesterna är stabila.

## Slutsats

Den minsta säkra förändringen är inte att byta URL eller använda ett annat
OpenAI-kompatibelt SDK. Det skulle lämna modellkatalog, förmågenamn,
datapolicy, resonemang, pris, kredit och UI-kontrakt OpenRouter-formade.

Rätt neutraliseringsyta går mellan Kravhanterings appägda
genererings-/reparationsorkestrering och en adapter. Då kan samma synliga
författar-, gransknings- och importflöde bestå, samtidigt som transport,
agentmiljö, modell och leverantör blir utbytbara genom administratörsstyrda
körprofiler.
