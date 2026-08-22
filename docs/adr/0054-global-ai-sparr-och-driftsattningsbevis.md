# Global AI-spärr och driftsättningsbevis

Status: Antagen 2026-08-19.

Bevisets profilbindning i detta beslut ersätts av stabilt profil-ID och
konfigurationsversion enligt
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).

Varje ny eller uppgraderad produktionsmiljö startar med den globala
AI-spärren aktiv. AI-assisterat författande är valfritt och spärren får därför
inte påverka applikationens health eller readiness. Driften släpper spärren
först när ett maskinverifierbart driftsättningsbevis för den aktuella miljön
har passerat den versionslevererade frisläppningsgrinden.

Driftsättningsbeviset är innehållsfritt och binder en begränsad mängd exakta
tupler av adaptertyp, AI-anslutning, anslutningsmodellrevision och aktiv
körprofilrevision genom hela verifieringen. Mängden avsedda tupler måste vara
identisk med mängden verifierade tupler; antal eller en representativ väg är
inte tillräckliga. Bevisformatets versionerade kontrollposter måste dessutom
innehålla ett begränsat opakt bevis-ID, suiteversion och godkänt utfall för
varje föreskriven kontrollaxel. Det intygar följande kontroller:

- root-keyringen är tillgänglig på alla appnoder och ett godkänt
  databas- och keyringåterställningsprov är slutfört
- utgående trafik är begränsad till godkända mål och säkra standarder gäller
- attest, anslutningsprov, verifierade modellförmågor och avsedda aktiva
  körprofilrevisioner är aktuella
- providerneutrala adapterkontrakts-, säkerhets-, SQL-, route-, SSE-,
  Playwright-, manuella-, seed-, återställnings-, rotations- och rollbackprov
  passerar
- bindande driftlarm är kopplade till ansvarig mottagare

Grinden avvisar okända eller ofullständiga fält, saknade kontrollaxlar och
duplicerade, utbytta eller extra revisionstupler. Den rapporterar endast
kontrollnamn, suiteversioner, opaka identiteter, antal och status. Prompt, bilder,
modellresultat, endpoint, leverantörshemlighet och hemlighetsreferens får inte
finnas i beviset eller grindens utdata.

Rollback aktiverar den globala spärren innan nya körningar tillåts, suspenderar
berörda anslutningar eller körprofiler och väljer vid behov en tidigare
fortfarande giltig körprofil- och hemlighetsrevision. Den borttagna direkta
OpenRouter-vägen är aldrig en reserv- eller rollbackväg.

## Verifieringslägen

Samma grind skiljer uttryckligen mellan tre verifieringslägen:

- `prodlike` använder den kontrollerade testadaptern på den exakta
  integrationsvägen och tillåter ingen extern live-trafik
- `staging_live` använder endast fasta syntetiska data, kräver ett uttryckligt
  opt-in och verifierar den avsedda live-adaptern och dess exakta väg
- `production` verifierar miljön utan att skicka ett live-anrop med
  författarinnehåll

Ett resultat från ett läge kan inte räknas som ett annat. Saknad tillgång till
en stagingmiljö lämnar staging-liveprovet ej kört; den får aldrig ersättas med
påhittad bevisning eller ett produktionsanrop.

## Bevarade beslut och företräde

Beslutet operationaliserar frisläppningsvillkoret i
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md)
och integritetsminimumet i
[ADR 0053](./0053-integritetsminimum-for-ai-anrop.md). AI-integrationslagrets
providerneutrala kontrakt i
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md)
förblir den enda produktionsvägen.

## Övervägda alternativ

- Släppa spärren när applikationens readiness är grön: avvisat eftersom AI är
  valfritt och readiness avsiktligt inte bevisar att AI-vägen är säker.
- Låta en lyckad databasuppgradering aktivera AI automatiskt: avvisat eftersom
  keyring, egress, attest, livekonfiguration och larm är miljöbundna kontroller.
- Acceptera en operatörs fria text som enda bevis: avvisat eftersom
  kontrolluppsättningen då varken är fullständig eller maskinverifierbar.
- Använda den gamla direkta OpenRouter-vägen vid rollback: avvisat eftersom den
  kringgår det gemensamma kontraktet och de administratörsstyrda grindarna.
