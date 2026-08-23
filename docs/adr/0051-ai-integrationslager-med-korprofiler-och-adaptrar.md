# AI-integrationslager med körprofiler och adaptrar

Status: Antagen 2026-08-19.

Kravhantering utför AI-anrop genom ett applikationsägt AI-integrationslager
med två kontraktsnivåer. `AIIntegrationLayer.run(...)` tar anropstyp,
uppgiftskuvert och teknisk körkontext, väljer den administratörsstyrda
stabila körprofilen och löser dess AI-anslutning,
anslutningsmodellrevision och adapter. `AIConnectionAdapter.run(...)` får de
redan upplösta objekten och får inte välja körprofil eller ändra produktens
fasta förmågekrav.

Routes och verksamhetslager känner därmed bara AI-integrationslagrets
leverantörsneutrala kontrakt. Endpoint, autentisering, protokollöversättning,
externt modell-ID, tillfällig intern agentsession, strömtolkning och
leverantörsfel tillhör adaptern. Adapterspecifik konfiguration får inte läcka
ut som fria inställnings- eller tilläggsfält i det gemensamma kontraktet.

## Anropskontrakt

Uppgiftskuvertet innehåller en av de fasta anropstyperna generering utan
bilder, generering med bilder eller reparation av ogiltig import-JSON. Det bär
separata styrande instruktioner, neutrala text- och bilddelar,
applikationsägt JSON Schema samt avbrottssignal och tekniska spårnings-ID:n.
Användaridentitet, behörighetssammanhang och importdestination passerar inte
adaptergränsen.

De två nivåerna delar en normaliserad ström av interna händelser. Icke-terminala
`analysis_delta` och `output_delta` får användas för intern återkoppling, men
`output_delta` är inte klientdata. Varje körning avslutas med exakt ett
självbärande terminalutfall: `completed`, `cancelled` eller `failed`. Tyst
avslut är ogiltigt.

Ingen partiell modelltext får nå klient eller import. AI-integrationslagrets
säkerhetsgrind karantänbuffrar adapterströmmen och släpper ett slutfört
resultat först efter fullständig slutscreening och schemavalidering. För varje
karantänlagd delta får grinden släppa en innehållsfri `heartbeat`; dess
generator gör inte nästa adapterpull förrän konsumenten begär nästa händelse.
Det bevarar pull-baserat backpressure utan att publicera modelltext. Ett
`completed`-utfall bär därför hela det godkända råresultatet, eventuell
AI-analys, normaliserad användningsmetadata och identiteten för exakt
AI-anslutning, anslutningsmodellrevision samt stabilt körprofil-ID och
konfigurationsversion.

## Körprofiler och förmågor

Applikationen har tre stabila körprofiler, en för varje anropstyp. Varje profil
väljer direkt en verifierad anslutningsmodellrevision och driftbudgetar. En
AI-körning behåller den konfiguration som AI-integrationslagret fryser vid
mottagningen. Användaren väljer varken AI-anslutning, anslutningsmodell eller
förmågekrav. Den sammanhållna modellverifieringen och körprofilernas aktuella
livscykel beskrivs i
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).

AI-integrationslagret härleder valda förmågor från profilens fasta krav och
de funktionellt verifierade förmågorna för anslutningsmodellrevisionen.
Adaptern verkställer valet men avgör inte produktbeteendet. Validerbar JSON
krävs alltid. Generering kräver strömning, generering med bilder kräver
bildindata och JSON-reparation använder inte strömning eller bildindata. Strikt
JSON Schema-styrning används endast när funktionell verifiering visar stöd.

En körprofil kan endast användas när dess AI-anslutning, attest, datapolicy,
leverantörshemlighet, anslutningsmodellrevision och fasta förmågekrav är
giltiga. Det administrativa valet bevaras om ett beroende blir ogiltigt, men
nya AI-anrop blockeras och ingen automatisk fallback sker.

OpenRouter är den första ordinarie adaptern och en fullt registrerbar
kontrollerad testadapter bevisar utbytbarheten. De ska passera samma kontrakt
genom körprofiler, säkerhetsgrindar, routes och terminalutfall. En ny adapter
får inte kräva leverantörsspecifik logik utanför adaptergränsen.

## Bevarade beslut och företräde

Detta beslut ändrar inte att AI-assisterat författande är frivilligt,
icke-auktoritativt och underställt mänsklig granskning enligt
[ADR 0015](./0015-ai-assisterat-forfattande.md). Det bevarar även flödet från
behov via generering och eventuell JSON-reparation till redigerbar granskning
och import genom `Kravimportfil` enligt
[ADR 0034](./0034-ai-assisterat-forfattande-anvander-kravimportkontraktet.md).
Kravhantering äger fortsatt instruktion, schema, destination, behörighet,
säkerhetsgrindar, validering och mänskligt beslut.

När äldre dokument beskriver direkt OpenRouter-anrop, användarstyrt modellval,
modellfavoriter, kreditstyrning eller modellkatalog som runtime-sanning har
detta beslut företräde. Det inför ingen automatisk fallback, beständig
agentsession, callback, tool-anrop eller ny AI-funktionalitet. Tillitsgräns,
anslutningslivscykel och leverantörshemligheter styrs av
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

## Övervägda alternativ

- Behålla direkt OpenRouter-logik i routes och verksamhetslager: avvisat
  eftersom varje ny AI-leverantör då skulle sprida transport-, modell- och
  konfigurationslogik genom produkten.
- Låta adaptern välja anslutning och modell: avvisat eftersom produktens
  administratörsstyrda policy då inte kan verifieras och tillämpas på en
  gemensam nivå.
- Använda ett generellt agentprotokoll som internt kärnkontrakt: avvisat
  eftersom AHP, ACP, MCP och A2A har andra sessions- och verktygsgränser än
  Kravhanterings avgränsade AI-anrop. Standardprotokoll kan stödjas bakom en
  adapter.
- Låta användaren välja AI-anslutning, modell eller datapolicy: avvisat
  eftersom behandling, förmågor och attest måste vara administratörsstyrda.
- Tillåta automatisk fallback mellan AI-anslutningar: avvisat eftersom ett
  byte kan ändra behandlingspart, datapolicy, förmågor och kostnad utan ett
  uttryckligt administrativt beslut.
