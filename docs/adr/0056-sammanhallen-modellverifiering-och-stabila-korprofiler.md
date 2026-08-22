# Sammanhållen modellverifiering och stabila körprofiler

Status: Antagen 2026-08-22.

Admin Center sparar inte längre modellutkast som verifieras i ett senare steg.
Administratören anger modellens tekniska identitet och kör en enda avbrytbar,
strömmande verifieringssvit. Sviten kontrollerar i fast ordning anslutning och
autentisering, grundläggande modellåtkomst, varje känd förmåga, kompatibilitet
med var och en av de tre fasta körprofilerna och en slutsammanfattning. Den
behåller adapterns säkerhets-, fel- och avbrottskontrakt, gör högst ett omförsök
vid övergående fel och har en gemensam tidsgräns på 60 sekunder.

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
köade och pågående körningar utan att radera profilens modellval.

Modellrevisioner har tillstånden `verified`, `new_revision_required` och
`ended`. Tekniska anslutningsändringar markerar befintliga revisioner som
`new_revision_required` och de förblir ovalbara. Administratören måste verifiera
och välja den nya revisionen; den ersatta revisionen blir inte valbar igen. En
revision får inte avslutas eller raderas medan en körprofil eller en köad eller
pågående körning använder den. `ended` är irreversibelt. Permanent radering
kräver först avslut och tar även bort den tomma modellbehållaren när sista
revisionen försvinner.

## Bevarade beslut och företräde

Beslutet ersätter körprofilrevisioner och de separata stegen för upptäckt,
modellutkast och aktivering i
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md),
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md),
[ADR 0054](./0054-global-ai-sparr-och-driftsattningsbevis.md) och
[ADR 0055](./0055-innehallsfri-ai-observerbarhet-och-syntetisk-liveverifiering.md).
Deras tillitsgräns, globala spärr, innehållsfria telemetri och exakta
liveverifiering gäller fortsatt, men binds nu till stabilt profil-ID och
konfigurationsversion.

## Övervägda alternativ

- Behålla utkast och separata verifieringsknappar: avvisat eftersom ett
  icke-verifierat mellanläge kunde sparas och gjorde beviskedjan svårbegriplig.
- Behålla körprofilrevisionstabellen: avvisat eftersom stabil identitet plus
  konfigurationsversion ger samma fäktning med mindre livscykelkomplexitet.
- Låta katalogmetadata avgöra stöd: avvisat eftersom katalogen bara är ett
  vägledande ifyllnadsstöd och inte funktionellt verifieringsbevis.
