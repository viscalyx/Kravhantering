# AI-assisterat författande

Status: Antagen 2026-06-05.

Kravhantering behandlar `AI-assisterat författande` som assisterat
författande, inte som auktoritativt kravinnehåll. AI output är ett förslag som
kan hjälpa en användare att utforma kravtext, acceptanskriterier,
verifieringsmetoder och klassning, men det blir inte ett auktoritativt `Krav`,
en `Kravversion` eller ett kravunderlagslokalt krav förrän en behörig aktör
sparar det genom applikationens ordinarie arbetsflöde.

Genererade förslag omfattas, när de sparas, av samma taxonomivalidering,
auktorisering, livscykel, granskning, publicering, spårbarhet, rapportering,
dataskydd och retention som människoförfattat innehåll. AI-leverantör, prompt,
modell, bilder och råresultat är integrationsindata och tillfälliga stöddata om
inte en användare medvetet gör resultatet till persisterat kravinnehåll.
Det avgränsade undantaget för incidentutredning är tidsbegränsad
AI-forensisk evidensinsamling enligt
[ADR 0050](./0050-tidsbegransat-sql-lager-for-ai-forensisk-evidens.md).

Arkitekturen håller därför AI-assisterat författande frivilligt och utbytbart:
administratörsgodkända AI-anslutningar stödjer utkastarbete, medan
kravbiblioteket och kravunderlag fortsatt styrs av Kravhanterings mänskliga
förvaltning och livscykelbeslut. AI-integrationslagrets adapter- och
körprofilgräns beskrivs i
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md), och
dess tillitsgräns i
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

## Övervägda alternativ

- Persistera AI-resultat automatiskt som krav: avvisat eftersom genererad text
  måste granskas och styras innan den blir auktoritativt innehåll.
- Behandla genererat råresultat som ett separat AI-ägt kravlager:
  avvisat eftersom det skulle dela upp spårbarhet, livscykel, rapportering och
  retention från vanliga krav.
- Göra AI-leverantören auktoritativ för krav: avvisat eftersom
  leverantörskonfiguration kan ändras och applikationen måste vara användbar
  utan att AI-assisterat författande är aktiverat.
