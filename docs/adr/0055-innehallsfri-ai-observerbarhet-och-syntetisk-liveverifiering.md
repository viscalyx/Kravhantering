# Innehållsfri AI-observerbarhet och syntetisk liveverifiering

Status: Antagen 2026-08-19.

AI-integrationslagret publicerar en gemensam strukturerad och innehållsfri
drifttelemetri för alla adaptrar. Routes och verksamhetslager får inte lägga
till leverantörsspecifik mätning. Varje telemetrihändelse använder opaka
identiteter och begränsade numeriska mått för kö, retry, samtidighet,
tidsförlopp, terminalutfall och normaliserad användning.

Prompt, bilder, modellresultat, endpoint, leverantörshemlighet,
hemlighetsreferens och fri feltext är förbjudna. Telemetrifel får inte läcka
innehåll eller bryta det ursprungliga anropets säkerhetsutfall.

Driften etablerar operatörskonfigurerbara dashboards med filter på miljö,
adaptertyp, anslutning, modellrevision, körprofilrevision, anropstyp och utfall.
Dashboards visar minst volym, latenser, kötryck, retry, terminalutfall,
användning och kostnad när adaptern kan rapportera dem. Följande larm är
bindande och kopplas till namngiven mottagare före frisläppning:

- `ai_alarm_authentication_failed`
- `ai_alarm_breaker_opened`
- `ai_alarm_active_profile_blocked`

## Produktionslik och live verifiering

Produktionslik verifiering kör OpenRouter-adaptern och den kontrollerade
testadaptern mot samma kontrakts- och integrationsgränser, men använder den
kontrollerade adaptern för produktens exakta författarväg. Den får inte göra
ett externt live-AI-anrop.

Staging-liveverifiering är en separat, explicit aktiverad driftåtgärd. Provet
förhandskontrollerar att exakt avsedd anslutning, modellrevision och aktiv
körprofilrevision är verifierade och inte blockerade. Därefter skickar det en
fast syntetisk förfrågan genom produktens ordinarie route och kräver exakt ett
normaliserat terminalutfall. Provet skriver endast innehållsfri bevismetadata.

Produktionsmiljön använder inte ett liveförfattarprov. Där verifieras i stället
den exakta konfigurationen, de säkra grindarna, larmkopplingarna och tidigare
godkänd miljöbevisning innan den globala AI-spärren kan släppas enligt
[ADR 0054](./0054-global-ai-sparr-och-driftsattningsbevis.md).

## Bevarade beslut och företräde

Beslutet preciserar den innehållsfria drifttelemetrin i
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md)
och bevarar det gemensamma adapterkontraktet i
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).
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
