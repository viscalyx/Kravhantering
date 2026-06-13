# Uppdragsbaserad RBAC

Status: Antagen 2026-06-05. Uppdaterad 2026-06-13 vid implementering
av den uppdragsbaserade auktoriseringsgränsen.

Kravhantering använder en uppdragsbaserad auktoriseringstjänst för
kravbibliotek, kravunderlag, avsteg, förbättringsförslag,
kravurvalsfrågor, rapporter, exporter och AI-assisterat författande.
Tjänsten slår upp målresursen i databasen innan beslut och nekar när åtgärden
inte kan knytas till ett tillåtet uppdrag.

Auktorisering utgår fortfarande från det verifierade aktörssammanhang som
beskrivs i ADR 0007. Globala roller som `Admin`, `Reviewer` och
`PrivacyOfficer` kommer från IdP-biljetten. Uppdrag som
kravområdesägare, kravområdesmedförfattare, kravunderlagsansvarig och
kravunderlagsmedförfattare är däremot applikationsägda HSA-id-tilldelningar
för en viss resurs.

`Admin` är ett generellt administrativt undantag för författande, läsning,
rapporter, exporter och AI-assisterat författande utan angivet
behörighetssammanhang. Undantaget är granskningsbeslut: publicering,
arkiveringsbeslut och avstegsbeslut kräver `Reviewer`. `Admin` utan `Reviewer`
räcker därför inte för granskningsbeslut.

`Reviewer` får fatta beslut även när aktören själv har skapat underlaget,
avsteget eller förslaget. Sådana egna beslut är tillåtna för att inte blockera
små förvaltningsorganisationer, men loggas som högriskhändelser.

Inloggade användare får läsa publicerade bibliotekskrav och publik taxonomi.
`Admin` skapar och tar bort kravområden. Den aktuella kravområdesägaren får
ändra namn, beskrivning, medförfattare och ägarskap för sitt eget kravområde.
Ny kravområdesägare måste vara en verifierad kravansvarsperson som inte är
kravområdesmedförfattare i samma kravområde. Kravområdesmedförfattare får
författa innehåll i kravområdet, men får inte ändra kravområdets metadata eller
uppdrag. Prefix får ändras av `Admin` eller aktuell kravområdesägare bara så
länge kravområdet saknar kravrader; därefter returnerar ändringen `409
conflict`. Lyckade ändringar av kravområdesmetadata, ägare och medförfattare
loggas i åtgärdsloggen.

`Admin` och `Reviewer` får läsa alla kravunderlag. Övriga inloggade användare
får lista och läsa bara tilldelade kravunderlag, där tilldelningen kommer från
kravunderlagsansvarig eller kravunderlagsmedförfattare. Ett kravunderlag som
finns men inte är tilldelat returnerar `403` vid direkt åtkomst; ett saknat
kravunderlag returnerar `404`. Kravunderlagsansvarig och
kravunderlagsmedförfattare får ändra kravunderlagets innehåll; bara
kravunderlagsansvarig och `Admin` får ändra kravunderlagets uppdrag.

Kravurvalsfrågor hör till kravområdet. Sparade kravurvalssvar hör till
kravunderlaget. Förbättringsförslag kan skapas och ändras av inloggade
användare, medan lösning eller beslut att avvisa kräver författare i
kravområdet eller `Admin`. Egen lösning högriskloggas.

AI-assisterat författande styrs av den generella autentiserings- och
auktoriseringsgränsen och har ingen separat AI-behörighet i nuvarande modell.
En användare utan `Admin` måste ange exakt ett auktoriserat
behörighetssammanhang:
`requirement_area` för författande i kravområde eller `specification` för
författande i kravunderlag. Detta gäller lista över modeller,
kreditinformation, REST-generering och MCP-generering innan någon
OpenRouter-körväg anropas. `Admin` får utelämna behörighetssammanhang. Om
AI-assisterat författande senare behöver en separat behörighetsmodell ska den
beslutas som en ny uttrycklig policy med egna skäl.

Kravpaket och normreferenser följer `docs/behörigheter.md`. Kravpaketens
återaktivering kräver `Admin` för att stänga den tidigare generella
inloggningsgränsen.

## Övervägda alternativ

- Behålla eller återinföra en återanvändbar allow-all-auktorisering: avvisat
  eftersom okända åtgärder eller mål som inte har slagits upp då inte nekas
  stängt. Tester som isolerar affärsflöden får i stället injicera en lokal
  testdubbel explicit i testkoden.
- Låta `Admin` ersätta `Reviewer` i granskningsbeslut: avvisat eftersom
  administration och sakkunnig granskning är separata ansvar.
- Förbjuda egna granskningsbeslut: avvisat eftersom små organisationer annars
  kan blockeras operativt. Högriskloggning ger spårbarhet utan att stoppa
  arbetet.
- Införa en separat AI-behörighet i detta beslut: avvisat eftersom AI-rätten
  följer det uppdrag som ger rätt att författa i valt behörighetssammanhang.
