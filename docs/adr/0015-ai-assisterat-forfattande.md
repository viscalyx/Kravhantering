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
model, images och raw generated response är integrationsindata och tillfälliga
stöddata om inte en användare medvetet gör resultatet till persisterat
kravinnehåll.

Arkitekturen håller därför AI-assisterat författande frivilligt och utbytbart:
OpenRouter och valda model providers stödjer utkastarbete, medan
kravbiblioteket och kravunderlag fortsatt styrs av Kravhanterings mänskliga
förvaltning och livscykelbeslut.

## Övervägda alternativ

- Persistera AI output automatiskt som krav: avvisat eftersom genererad text
  måste granskas och styras innan den blir auktoritativt innehåll.
- Behandla genererat output som ett separat AI-owned requirements store:
  avvisat eftersom det skulle dela upp spårbarhet, livscykel, rapportering och
  retention från vanliga krav.
- Göra AI provider auktoritativ för krav: avvisat eftersom provider
  configuration kan ändras och applikationen måste vara användbar utan att
  AI-assisterat författande är aktiverat.
