# Tillitsgräns och krypterade AI-leverantörshemligheter

Status: Antagen 2026-08-19.

Varje AI-anslutning ligger utanför Kravhanterings tillitsgräns, även när en
ansluten agentmiljö körs som sidecar i samma nätverk. Adaptern är betrodd kod i
AI-integrationslagret, medan AI-leverantören eller agentmiljön är en separat
behandlingspart. Varje driftsatt miljö är en egen konfigurations-, hemlighets-
och isoleringsgräns.

## Anslutningslivscykel och datapolicy

En AI-anslutning har tillstånden `draft`, `verification_required`, `active`,
`suspended` och `retired`. Endast `active` får ta emot produktionsanrop. En
använd anslutning pensioneras i stället för att raderas; ett oanvänt utkast
kan raderas. Administrativ livscykel hålls skild från den operativa hälsan
`unknown`, `healthy`, `degraded` eller `unavailable`.

Aktivering kräver ett tekniskt anslutningsprov, minst en verifierad
anslutningsmodellrevision och en registrerad förvaltningsattest. Attesten
omfattar ägare, ändamål, högsta informationsklass, personuppgiftsbehandling,
AI-leverantör och underleverantörer, geografisk behandling, träning, maximal
retention, incidentkontakt och beslutsreferens. En materiell ändring
ogiltigförklarar berörda verifieringsbevis.

Körprofilen anger konservativt den högsta informationsklass som anropstypen
kan innehålla. AI-anslutningens godkända tak måste möta den och okänd eller
ofullständig policy stoppar anropet. Identitet, autentiseringsuppgifter,
interna korrelations-ID:n och applikationshemligheter lämnar aldrig
Kravhantering. Användaren kan avstå från ett AI-anrop men inte åsidosätta
datapolicyn eller välja en annan behandlingspart.

Produktion tillåter endast administratörsgodkända `https`- eller
`wss`-destinationer. Omdirigeringar, användarinformation, frågeparametrar och
fragment i anslutningsadressen är förbjudna. Hostnamn och upplösta adresser
verifieras mot driftsättningens policy för utgående trafik vid konfiguration,
aktivering och anslutning. Privata destinationer tillåts endast som sidecar-mål
som driften uttryckligen har definierat. Brandvägg eller proxy verkställer samma
allowlist för utgående trafik.

## Leverantörshemligheter och root-keyring

Produktadministratören får skriva och rotera en leverantörshemlighet men
aldrig läsa, exportera eller få tillbaka klartexten. Applikationen krypterar
varje hemlighetsrevision med AES-256-GCM före lagring i SQL Server. Varje
revision använder en unik kryptografiskt slumpad nonce och AAD som binder
chiffertexten till oföränderliga ID:n för AI-anslutning och
hemlighetsrevision. Databasen lagrar chiffertext, nonce, autentiseringstagg,
formatversion och root-key-version.

Root-keyringen är extern, versionsstyrd och innehåller 256-bitars root-nycklar.
Driften distribuerar samma nödvändiga versioner till alla appnoder genom den
godkända hemlighets- och driftsättningsmekanismen. SQL Server, databasbackup
och DBA ligger utanför hemlighetens tillitsgräns. Systemet väljer aldrig
automatiskt den numeriskt högsta root-key-versionen.

En ny leverantörshemlighet lagras som kandidat, provas mot exakt
AI-anslutning och aktiveras atomiskt. Den gamla chiffertexten raderas när
bytet är verifierat och den gamla leverantörshemligheten är återkallad;
icke-hemlig metadata i åtgärdsloggen bevaras. Rootrotation distribuerar och
verifierar en ny version på samtliga appnoder innan aktiv skrivversion byts och
befintliga hemligheter omkrypteras.

En gammal root-key-version behålls så länge någon databasrad eller
återställningsbar databasbackup behöver den. Återställningsprov omfattar
alltid både SQL Server och den externa root-keyringen. Saknad nödvändig
root-nyckel blockerar berörda körprofiler och kräver återställning eller ny
inmatning av leverantörshemligheter; den får inte fälla hela applikationens
health eller readiness.

## Säkerhetsgrind, loggning och incidentstopp

All obetrodd text screenas av applikationsägda AI-säkerhetsregler före egress.
Bilddata verifieras, avkodas och omkodas säkert innan generering med bilder;
råa bilder loggas aldrig. Adapterströmmen karantänbuffras och screenas innan
ett fullständigt, schemavaliderat slutresultat får nå klient eller import.
AI-leverantörens filter är endast kompletterande. AI-säkerhetsfiltrets fel
stoppar anropet.

Åtgärdsloggen registrerar anslutningens administrativa livscykel enligt
[ADR 0013](./0013-separation-mellan-atgardslogg-och-plattformens-sakerhetslogg.md).
Innehållsfri drifttelemetri och bindande larm ägs av
[ADR 0055](./0055-innehallsfri-ai-observerbarhet-och-syntetisk-liveverifiering.md),
medan kontrollerad AI-forensisk evidensinsamling ägs av
[ADR 0050](./0050-tidsbegransat-sql-lager-for-ai-forensisk-evidens.md).
De ordinarie beviskanalerna lagrar inte prompt, bild, modellresultat, endpoint,
leverantörshemlighet eller hemlighetsreferens.

Suspendering av en AI-anslutning stoppar nya anrop via anslutningen och
försöker avbryta pågående anrop. Den globala AI-spärren och dess
driftsättningsbevis ägs av
[ADR 0054](./0054-global-ai-sparr-och-driftsattningsbevis.md), och
körprofilernas paus och huvudstatus ägs av
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).

## Samband med andra beslut

AI-anslutningens behandling följer regeln om uttrycklig extern behandling i
[ADR 0021](./0021-uttrycklig-extern-behandling-av-produktionsdata.md) och
de applikationsägda AI-säkerhetsreglerna i
[ADR 0038](./0038-db-forvaltade-ai-sakerhetsregler.md). Adapter- och
körprofilgränsen följer
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).

## Övervägda alternativ

- Betrakta en sidecar som innanför tillitsgränsen: avvisat eftersom den är en
  separat behandlingspart och måste omfattas av samma attest, egress- och
  verifieringskrav som en fjärrtjänst.
- Lagra leverantörshemligheter i klartext eller skydda dem enbart med SQL
  Servers lagringskryptering: avvisat eftersom databas, backup och DBA ska
  ligga utanför hemlighetens tillitsgräns.
- Lagra varje leverantörshemlighet enbart i en extern hemlighetshanterare:
  avvisat eftersom produktadministratören ska kunna registrera och rotera
  flera AI-anslutningar utan driftmedverkan vid varje leverantörsnyckelbyte.
- Lagra root-keyringen i samma databas som chiffertexten: avvisat eftersom en
  databas- eller backupkompromettering då skulle ge båda delarna.
- Behålla endast den senaste root-key-versionen: avvisat eftersom backup och
  rotation då inte kan återställas säkert tillsammans.
- Låta en saknad AI-hemlighet fälla readiness: avvisat eftersom AI-assisterat
  författande är en valfri, icke-auktoritativ funktion.
