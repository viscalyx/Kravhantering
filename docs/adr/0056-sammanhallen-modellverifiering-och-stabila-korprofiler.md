# Sammanhållen modellverifiering och stabila körprofiler

Status: Antagen 2026-08-22.

Admin Center sparar en anslutningsmodell först efter en enda avbrytbar,
strömmande verifieringssvit. Administratören anger modellens tekniska
identitet, och sviten kontrollerar i fast ordning anslutning och autentisering,
grundläggande modellåtkomst, varje känd förmåga, kompatibilitet med var och en
av de tre fasta körprofilerna och en slutsammanfattning. Den behåller adapterns
säkerhets-, fel- och avbrottskontrakt, gör högst ett omförsök vid övergående
fel och har en gemensam tidsgräns på 60 sekunder.

Resultatet binds server-side i högst 15 minuter till aktör, anslutning och ett
fingeravtryck över tekniska fält. Namn och beskrivning får ändras utan ny
verifiering. Försöket förbrukas först när modellrevisionen och dess append-only
verifieringsbevis har sparats atomiskt. Endast lyckad grundkontroll, avgjorda
förmågor och minst en kompatibel körprofil gör försöket sparbart.

## Stabila körprofiler

Applikationen äger exakt tre stabila körprofiler och deras fasta
minimiförmågor. Administratören väljer direkt en kompatibel, verifierad
modellrevision och driftbudgetar på profilen. En ändring höjer profilens
`configuration_version` och byter `revision_token`; den ändrar inte redan
startade körningar. Koordinationsraden lagrar profilens stabila ID och den
konfigurationsversion som körningen startade med. En paus begär avbrott för
köade och pågående körningar utan att radera profilens modellval. Avbrutna
körningar startas inte om vid återupptagning.

Körprofilens huvudstatus är en enda härledd status. Utan modellrevision är den
`Ej konfigurerad`. Med modellrevision har administrativ paus företräde som
`Pausad`, följt av `Blockerad` när ett administrativt beroende är ogiltigt och
annars `Aktiv`. Modellval och administrativ paus bevaras som separata tekniska
fakta. Operativ leverantörshälsa och kretsbrytarläge ingår inte i
huvudstatusen. Bortkoppling av modellrevision återställer pausläget atomiskt,
så nästa giltiga konfiguration blir `Aktiv`.

Modellrevisioner har tillstånden `verified`, `new_revision_required` och
`ended`. Tekniska anslutningsändringar markerar befintliga revisioner som
`new_revision_required` och de förblir ovalbara. Administratören måste verifiera
och välja den nya revisionen; den ersatta revisionen blir inte valbar igen. En
revision får inte avslutas eller raderas medan en körprofil eller en köad eller
pågående körning använder den. `ended` är irreversibelt. Permanent radering
kräver först avslut och tar även bort den tomma modellbehållaren när sista
revisionen försvinner.

## Samband med andra beslut

Adaptergränsen följer
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md) och
tillitsgränsen följer
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).
Den globala AI-spärren och driftsättningsbeviset följer
[ADR 0054](./0054-global-ai-sparr-och-driftsattningsbevis.md).
Drifttelemetri och staging-liveprovet för AI följer
[ADR 0055](./0055-innehallsfri-ai-observerbarhet-och-syntetisk-liveverifiering.md).
Alla dessa beslut använder stabilt körprofil-ID och konfigurationsversion.

## Övervägda alternativ

- Behålla utkast och separata verifieringsknappar: avvisat eftersom ett
  icke-verifierat mellanläge kan sparas och gör beviskedjan svårbegriplig.
- Behålla körprofilrevisionstabellen: avvisat eftersom stabil identitet plus
  konfigurationsversion ger samma fäktning med mindre livscykelkomplexitet.
- Låta katalogmetadata avgöra stöd: avvisat eftersom katalogen bara är ett
  vägledande ifyllnadsstöd och inte funktionellt verifieringsbevis.
