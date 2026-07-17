# Framåtmarkörer för kravlistor

Status: Antagen 2026-07-15.

Kravbiblioteket och underlagets lista över tillgängliga krav använder
framåtriktad keyset-sidindelning. Servern returnerar en versionsmärkt ogenomskinlig
markör som bär den fullständiga sorteringsgränsen och binder fortsättningen till
normaliserade filter, sortering, riktning, språk och synlighetsvillkor.
Sidstorleken ingår inte i frågeidentiteten och får minskas under fortsatt
läsning.

Listsvaret innehåller sidans antal, gräns, om fler rader finns och nästa markör.
Det innehåller inte offset eller exakt totalsumma. Servern hämtar en extra rad
för att avgöra om fler resultat finns och kör därför ingen separat räkningsfråga.

Markören ger stabila gränser när resultatmängden och sorteringsvärdena är
oförändrade. Den utgör inte en fryst ögonblicksbild över flera HTTP-anrop. En
klient med en ogiltig eller inaktuell markör läser om listan från början och
meddelar användaren.

Kravunderlagets blandade lista över bibliotekskrav och kravunderlagslokala krav
använder samma princip genom en gemensam sidoperation för tjänst, REST, MCP och
förladdning. SQL Server-databasens befintliga kollation styr textjämförelser;
applikationen varken väljer, validerar eller åsidosätter den.

Kravbiblioteksmarkören innehåller nullrang, primärt sorteringsvärde och stabilt
numeriskt Krav-ID. Sortering på fri text och uppslagsnamn använder en
normaliserad, högst 48 tecken lång SQL-nyckel och därefter det numeriska
Krav-ID:t; den bundna nyckeln gör att hela gränsen ryms även när själva
kravtexten är `nvarchar(MAX)`. Det systemgenererade unika Krav-ID:t använder
sin befintliga indexerade databasnyckel direkt.
Kravunderlagsmarkören bär motsvarande blandade listgräns med objektslag och
källans primärnyckel. Markörerna kräver därför varken uppslag av en tidigare
ankarrad, offset eller exakt total. De är kanoniska, utfyllnadsfria
base64url-kodade JSON-objekt och högst 512 tecken. Ändrade eller borttagna
tidigare gränsrader hindrar inte fortsatt läsning; vanlig `READ COMMITTED`
innebär däremot ingen fryst ögonblicksbild.

Kompletta CSV- och PDF-resultat följer samma framåtmarkörer i interna,
200-raders sidor. Traverseringen avbryter vid dubbletter, utebliven progress
eller markörcykler och efter högst 10 000 sidor, motsvarande två miljoner rader.
Offset- och äldre exportkontrakt behålls inte. Ändringen aktiveras direkt utan
funktionsflagga.

Beslutet kompletterar
[ADR 0004](./0004-persistensstack-med-sql-server-och-typeorm.md) om
prestandakänslig SQL och
[ADR 0006](./0006-rest-och-mcp-delar-requirementsservice.md) om transport- och
tjänstegränser.

## Övervägda alternativ

- Offset-sidindelning: avvisat eftersom djupa sidor kräver arbete proportionellt
  mot djupet och den separata totalsummeringen inte används av gränssnittet.
- Bakåtriktade markörer: avvisat eftersom inget aktuellt arbetsflöde navigerar
  bakåt mellan sidor.
- Fryst ögonblicksbild: avvisat eftersom det kräver beständig historik eller
  serverhållen sessionsdata utan motsvarande användarbehov.
- Parallella offset- och markörkontrakt: avvisat eftersom ingen faktisk
  kompatibilitetskonsument har identifierats.
