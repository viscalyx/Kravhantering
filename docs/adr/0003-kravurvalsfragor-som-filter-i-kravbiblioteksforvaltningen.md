# Kravurvalsfrågor som filter i kravbiblioteksförvaltningen

Status: Antagen 2026-05-31.

Kravurvalsfrågor är kravområdesägt innehåll i kravbiblioteksförvaltningen, inte
referensdata i Admin Center och inte ett nytt flöde för att lägga till krav.
Målbilden för behörigheter är att kravområdesägare,
kravområdesmedförfattare och användare med `Admin` underhåller frågorna, medan
kravunderlagsansvariga och kravunderlagsmedförfattare besvarar dem i ett
kravunderlag. Den första implementationen kräver medvetet bara autentisering
för dessa nya skrivningar tills det uppdragsbaserade RBAC-arbetet finns på
plats; det är en tillfällig implementationsbegränsning, inte domänens
behörighetsmodell.

Valda kravurvalssvar bevarar kravurvalssammanhanget för kravunderlaget och kan
bilda ett kravurvalsfilter över den befintliga listan `Available
requirements` när användaren uttryckligen aktiverar filtret i detaljvyn. Ett
nytt besök startar från den kompletta mängden publicerade bibliotekskrav som
inte redan ingår i kravunderlaget, och användare granskar, väljer och lägger
fortfarande till krav genom det befintliga tabellflödet.

Detta återanvänder medvetet väljaren för publicerade bibliotekskrav i stället
för att skapa en separat vy för föreslagna krav eller automatiskt lägga till
krav. Det behåller versionslåsningen vid det befintliga steget för
kravtillämpning: svar pekar på kravpaket och uttryckliga publicerade krav, och
kravunderlaget registrerar de publicerade kravversionerna först när användaren
lägger till dem.

Kravpaket är också innehåll i kravbiblioteksförvaltningen snarare än
referensdata i Admin Center. Ett kravpaket har en egen kravpaketsansvarig, men
paketmedlemskap är fortsatt del av kravversionsmetadata och ändras genom
kravets livscykel, inte direkt från ytan för paketförvaltning. Kravpaket är
författat innehåll i förvaltningsytan, så namn och beskrivning använder ett
författat språk i stället för språkparade locale-kolumner.

Kravurvalssvar kan peka på kravpaket och uttryckliga publicerade krav, eller
markeras som `Utan kravurval`. Paketlänkar och uttryckliga kravlänkar är
oberoende källbeslut: samma krav kan matcha ett svar både direkt och genom ett
paket, räknas en gång och behåller båda källetiketterna synliga för förvaltare.
Det låter en frågeägare kräva ett specifikt krav oavsett senare ändringar i
paketmedlemskap, medan den uttryckliga kravlänken fortfarande måste referera
till ett krav med publicerad version.

Arkiverade paket och krav som inte längre har en publicerad version tas
automatiskt bort från svar och återställs inte automatiskt om de blir möjliga
att använda igen. Berörda svar som inte är `Utan kravurval` visas som
`Saknar kravurval`. Kravurvalsfrågor är alltid frivilliga i den första
implementationen: det finns ingen required-question state, ingen
required-answer validation och progress visar bara besvarat/totalt för aktiva
frågor.

Sparade kravurvalssvar bevarar kravurvalssammanhang, men de får inte
automatiskt tillbaka filtereffekt när en arkiverad eller inaktiv
kravurvalsfråga eller ett kravurvalssvar senare återaktiveras. När en
kravurvalsfråga eller ett kravurvalssvar tas ur aktiv användning markeras
berörda sparade kravurvalssvar som historiska; användare måste välja svaret
igen för att det ska påverka kravurvalsfiltret.

Ändrade kravurvalssvar i ett kravunderlag aktiverar inte kravurvalsfiltret
automatiskt. Om filtret redan är aktivt i aktuell detaljvy uppdaterar ändrade
kravurvalssvar direkt de filtrerade tillgängliga kraven; annars ligger svaren
kvar som sparat sammanhang tills användaren väljer att filtrera.

## Övervägda alternativ

- Lägga kravurvalsfrågorna i Admin Center som referensdata: avvisat eftersom de
  är innehållsförvaltning som ägs av kravområden, inte systemkonfiguration.
- Skapa en separat lista för föreslagna krav: avvisat eftersom den duplicerar
  urval, filtrering och tilläggsbeteende som redan finns i `Available
  requirements`.
- Automatiskt lägga till krav från svar: avvisat eftersom ett svar ska snäva
  in arbetsmängden, medan tillägg av krav till ett kravunderlag ska vara en
  uttrycklig användaråtgärd.
- Automatiskt filtrera tillgängliga krav vid varje sparat svar: avvisat
  eftersom ett nytt besök i ett kravunderlag ska hålla `Available requirements`
  komplett tills användaren väljer kravurvalsfiltret.
- Spara ögonblicksbild av fråga och svarstext i varje kravunderlag: avvisat för
  första versionen; sparade svar behåller identitet men visar aktuell förvaltad
  fråga och svarstext.
- Införa full livscykel med utkast/granskning/publicerad för frågor: avvisat
  för första versionen till förmån för aktiv/arkiverad plus hälsoindikatorer.
- Obligatoriska kravurvalsfrågor: avvisat för första versionen eftersom
  kravurvalssvar ska vägleda filtrering, inte bli en färdigställandegrind.
- Språkparad kravpaketstext: avvisat när kravpaket flyttades från referensdata
  till författat innehåll i kravbiblioteksförvaltningen.
