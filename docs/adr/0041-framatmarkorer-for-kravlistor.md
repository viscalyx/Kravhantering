# Framåtmarkörer för kravlistor

Status: Antagen 2026-07-15.

Kravbiblioteket och underlagets lista över tillgängliga krav använder
framåtriktad keyset-sidindelning. Servern returnerar en versionsmärkt ogenomskinlig
markör som identifierar ankarkravet och binder fortsättningen till normaliserade
filter, sortering, riktning, språk, sidstorlek och synlighetsvillkor.

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

Kravunderlagsmarkören innehåller hela gränstupeln: nullrang, primärt
sorteringsvärde, Krav-ID, objektslag och källans primärnyckel. Den kräver därför
varken uppslag av en tidigare ankarrad, offset eller exakt total. Sidstorleken
ingår inte i frågeidentiteten, så en konsument får minska gränsen under fortsatt
läsning. Markören är kanonisk, utfyllnadsfri base64url-kodad JSON och högst 512
tecken. Ändrade eller borttagna tidigare gränsrader hindrar inte fortsatt
läsning; vanlig `READ COMMITTED` innebär däremot ingen fryst ögonblicksbild.

PDF-insamling följer samma framåtmarkörer. Offsetkontraktet behålls inte eftersom
ingen dokumenterad kompatibilitetskonsument finns. Ändringen aktiveras direkt
utan funktionsflagga.

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
