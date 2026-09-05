# Separat styrning av resonemangsnivå

Status: Antagen 2026-09-05.

[Issue #1100](https://github.com/viscalyx/Kravhantering/issues/1100).

Resonemang är obligatoriskt, men styrning av resonemangsnivå är inte ett
universellt krav. Adaptern ska för den aktuella AI-anslutningen och
anslutningsmodellen avgöra om resonemang kräver en uttrycklig parameter eller
används som standard utan en sådan parameter. Beslutet får inte bygga enbart
på adapterns typ eftersom modeller bakom samma adapter kan skilja sig åt.

Anslutningsmodellrevisionen ska äga den oföränderliga, normaliserade
konfiguration som verifierats: uttrycklig styrning eller modellens standard.
När nivån kan styras ska `reasoningEffort` vara `low`, `medium` eller `high`,
med `high` som förval. Annars ska nivån vara ej tillämplig och visas som
`Modellens standard`; systemet får inte ange en påhittad nivå eller tolka
detta som avstängt resonemang. Körprofilen ska använda revisionens verifierade
konfiguration utan att kunna ändra den.

Resonemangsförmåga, `reasoningControl` och `aiAnalysis` ska vara separata.
`reasoningControl` avser möjligheten till uttrycklig nivåstyrning och behöver
inte vara verifierad när resonemang används som standard. `aiAnalysis` avser
endast separat, visningsbar klartext eller sammanfattning. Leverantörens fält
och översättningen av konfigurationen ska stanna bakom adaptergränsen enligt
[ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md).

Verifieringen ska följa den konfiguration som runtime ska använda och ge
observerbar evidens för resonemangsaktivitet. För uttrycklig styrning ska
provet skicka den valda nivån genom en leverantörsväg som stöder parametern.
För modellens standard ska provet fungera utan en styrparameter som modellen
inte behöver eller stöder. Katalogmetadata eller ett lyckat anrop utan
resonemangsevidens räcker inte i något av fallen. Beviset är inte ett intyg om
exakt vilken nivå leverantören tillämpade internt.

Alla fasta körprofiler ska kräva verifierad resonemangsförmåga, inklusive
reparation av ogiltig import-JSON. Avvisat eller oavgjort resonemang ska hindra
att modellrevisionen sparas som användbar. Saknad nivåstyrning ska däremot
inte hindra en modell med verifierat resonemang som standard. Runtime ska
följa revisionens verifierade konfiguration och får inte byta mellan
uttrycklig styrning och modellens standard som en tyst reservväg vid fel.
Detta utökar de fasta förmågekraven i
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).
Visningsbar AI-analys förblir en separat, valfri förmåga.

## Avvägning

Ett krav på uttrycklig bekräftelse av internt tillämpad nivå skulle lämna
styrningen oavgjord när leverantören saknar ett sådant svarsfält.
[OpenRouters dokumentation om resonemang](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
beskriver nivåer och resonemangsdata, medan
[leverantörsroutningen](https://openrouter.ai/docs/guides/routing/provider-selection#requiring-providers-to-support-all-parameters)
kan kräva stöd för begärda parametrar. Slutsatsen är att dessa signaler kan
stödja ett funktionellt verifieringsbevis men inte bevisa en exakt intern
ansträngning. Denna avgränsade bevisnivå är den beslutade produktbetydelsen.
