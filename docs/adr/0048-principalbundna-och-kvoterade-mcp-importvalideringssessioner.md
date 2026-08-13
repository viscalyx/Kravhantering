# Principalbundna och kvoterade MCP-importvalideringssessioner

Status: Antagen 2026-08-13.

Persistenta MCP-importvalideringssessioner binds till den skapande
MCP-principalen genom ett normaliserat HSA-id som skyddas med en
ändamålsseparerad nycklad HMAC. En valideringstoken ger därför inte en annan
principal rätt till sessionen, och aktuell behörighet till destinationen
prövas fortfarande vid inspektion och körning.

Alla sessioner vars utgångstid inte har passerat är aktiva, även efter hel eller
delvis körning. Aktiva sessioner omfattas av databasglobalt atomära kvoter för
antal per principal och destination, skapandetakt per principal samt reserverat
lagringsutrymme. Kvoter gäller även privilegierade principaler; roller påverkar
destinationsbehörighet men ger inget kvotundantag.

Lagringskvoten reserverar både sessionens ursprungliga data och ett
konservativt utrymme för ett fullständigt körningskvitto, så att en giltig
session inte senare blir okörbar enbart för att kvoten fylldes efter validering.
Utgångna sessioner och skapandetaktsräknare är kortlivat operativt tillstånd och
ska rensas utan arkivexport.

Äldre applikationsversioner saknar principalbindningen och får därför inte
betjäna MCP parallellt med den nya versionen. Uppgradering och återställning
görs som samordnade MCP-stopp där befintliga valideringssessioner raderas innan
trafiken återupptas. Det fail-closed-beslutet prioriterar ägarskapsskydd framför
obruten användbarhet för kortlivade valideringstoken.

## Övervägda alternativ

- JWT-subjekt eller klient-id som beständig principalidentitet avvisades
  eftersom samma person kan byta klient eller få ändrad tokenrepresentation.
- Bakåtkompatibla obundna sessioner avvisades eftersom tokeninnehav då fortsatt
  skulle kunna överföra sessionen mellan principaler.
- Kvotundantag för administratörer avvisades eftersom kapacitets- och
  ägarskapsskyddet ska gälla oberoende av destinationsroll.
