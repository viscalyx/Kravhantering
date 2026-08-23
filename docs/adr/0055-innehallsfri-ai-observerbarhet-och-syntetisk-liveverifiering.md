# Innehållsfri AI-observerbarhet och syntetisk liveverifiering

Status: Antagen 2026-08-19.

AI-integrationslagret publicerar en gemensam strukturerad och innehållsfri
drifttelemetri för alla adaptrar. Routes och verksamhetslager får inte lägga
till leverantörsspecifik mätning. Varje telemetrihändelse använder opaka
identiteter, adaptertyp och adapterversion samt begränsade numeriska mått för
kö, retry, samtidighet, tidsförlopp, terminalutfall och normaliserad användning.

Prompt, bilder, modellresultat, endpoint, leverantörshemlighet,
hemlighetsreferens och fri feltext är förbjudna. Telemetrifel får inte läcka
innehåll eller bryta det ursprungliga anropets säkerhetsutfall.

Driften etablerar operatörskonfigurerbara dashboards med filter på miljö,
adaptertyp, anslutning, modellrevision, stabilt körprofil-ID,
konfigurationsversion, anropstyp och utfall. Dashboards visar minst volym,
latenser, kötryck, retry, terminalutfall, användning och kostnad när adaptern
kan rapportera dem. Följande larm är bindande och kopplas till namngiven
mottagare före frisläppning:

- `ai_alarm_authentication_failed`
- `ai_alarm_breaker_opened`
- `ai_alarm_active_profile_blocked`

## Produktionslik verifiering och staging-liveprov

Produktionslik verifiering kör OpenRouter-adaptern och den kontrollerade
testadaptern mot samma kontrakts- och integrationsgränser, men använder den
kontrollerade adaptern för produktens exakta författarväg. Den får inte göra
ett externt live-AI-anrop.

Staging-liveprovet för AI är en separat, explicit aktiverad driftåtgärd. Innan
extern trafik tillåts kräver både routen, tjänsten och den externa operationen
serverbevisad stagingidentitet, exakt förväntat miljö-ID, explicit server-opt-in
och aktiv global AI-spärr. Det förhandskontrollerar de tre stabila
körprofilerna och deras konfigurationsversioner från en begränsad,
innehållsfri sökvägsfil samt varje exakt avsedd adapter, anslutning och
modellrevision. Därefter använder det den spärrkompatibla och icke-muterande
Admin-åtgärden `verify_live_path`. Åtgärden avvisar kontrollerade offlineadaptrar
och kör först den fasta syntetiska adaptersviten
`ai-admin-functional-probe-v1`. Därefter laddar den den valda aktiva
körprofilen och kör ett fast syntetiskt anrop genom dess resolver, hemlighet,
tillitsgräns, kö-, retry- och deadlinekoordinator, integrationslager och exakta
adapter. Inga sentinelprofiler, områdesval eller databasbaserade
författarindata används. Tjänsten läser om och jämför anslutningens,
modellrevisionens och den stabila körprofilens token och konfigurationsversion
efter körningen; en samtidig administrativ ändring ger inget bevis. Resultatet
binder aktuell körningsidentitet, svitversion, utfall, observerad adapter,
stabilt körprofil-ID, konfigurationsversion och samtliga revisionstoken. Alla
svar och tidsgränser är begränsade. Provet skriver endast innehållsfri
bevismetadata.

Produktionsmiljön använder inte ett liveförfattarprov. Där verifieras i stället
den exakta konfigurationen, de säkra grindarna, larmkopplingarna och tidigare
godkänd miljöbevisning innan den globala AI-spärren kan släppas enligt
[ADR 0054](./0054-global-ai-sparr-och-driftsattningsbevis.md).

## Samband med andra beslut

Beslutet avgränsar den innehållsfria drifttelemetrin tillsammans med
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md)
och använder det gemensamma adapterkontraktet i
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).
Modellverifieringen och de stabila körprofilerna följer
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).
Kontrollerad forensisk innehållsinsamling förblir en separat process enligt
[ADR 0050](./0050-tidsbegransat-sql-lager-for-ai-forensisk-evidens.md) och får
inte blandas in i drifttelemetrin eller verifieringsbeviset.

## Övervägda alternativ

- Logga fri adaptertext för enklare felsökning: avvisat eftersom den kan
  innehålla prompt, resultat, endpoint eller leverantörshemligheter.
- Köra externa live-AI-anrop i produktionslika CI-prov: avvisat eftersom
  reproducerbarhet, integritet och leverantörstillgänglighet då blir en del av
  den lokala acceptansgrinden.
- Köra syntetiska liveprov direkt i produktion: avvisat eftersom ett
  författaranrop behandlar innehåll externt och inte behövs för att frisläppa
  en verifierad produktionskonfiguration.
- Låta varje adapter definiera egna larm och dashboards: avvisat eftersom
  driftens kontrakt då blir leverantörsbundet och svårt att jämföra.
