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
