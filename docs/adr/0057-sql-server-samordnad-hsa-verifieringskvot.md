# SQL Server-samordnad HSA-verifieringskvot

Status: Antagen 2026-09-04.

HSA-personverifiering använder en strikt applikationsgemensam
HSA-verifieringskvot i SQL Server. Alla appnoder utvärderar aktör,
aktör–mål och mål i den ordningen i en serializable-transaktion med separata
transaktionsbundna applikationslås och högst en sekunds väntetid per lås. SQL
Server UTC bestämmer minutjusterade fasta 60-sekundersfönster. Den normala
gränspulsen mellan två fasta fönster accepteras.

Varje tillåten kvot förbrukas. Ett nekat utfall stoppar utvärderingen före
senare kvoter men behåller tidigare förbrukning. Koordinationsfel återställer
hela transaktionen utan omförsök och stänger verifieringsvägen med ett generiskt
tillfälligt fel. Ingen processlokal reservkvot används. En planerad rotation av
den befintliga hemligheten för HSA-verifieringsfingeravtryck får nollställa
kvoten; ingen separat kvothemlighet införs.

Kvotrader är kortlivad pseudonymiserad driftinformation, inte säkerhetsbevis.
De innehåller endast kvottyp, HMAC-baserade fingeravtryck, antal och SQL-tider,
raderas av den gemensamma schemalagda transient-cleanup-tjänsten och omfattas
av exakt personuppgiftsutdrag och dataskyddsradering. Kapacitetshändelser är
identitetsfria. Befintlig readiness för SQL och migrering används utan
muterande kvotprov eller ny driftkonfiguration.

Alla produktions- och återgångsreleaser måste stödja den gemensamma kvoten.
Övergång från en release med processlokala HSA-räknare stöds inte. Befintligt
planerat driftstopp används för att migrera databasen och starta samtliga
appnoder på en kompatibel release innan trafik återställs.

## Samband med andra beslut

Observerbarheten följer
[ADR 0020](./0020-kapacitetsobserverbarhet-via-plattformen.md). Det här är den
samordningsgräns för en specifik arbetslast som ADR 0020 tillåter:
HSA-verifiering
behöver en strikt gemensam säkerhetsgräns, medan andra processlokala
anropsgränser förblir oförändrade.

## Övervägda alternativ

- Behålla processlokala räknare eller reservräknare: väljs inte eftersom flera
  appnoder då kan överskrida den gemensamma säkerhetsgränsen.
- Låta plattformens lastbalanserare ensam begränsa anrop: väljs inte eftersom den
  inte äger applikationens aktörs- och målfingeravtryck eller
  utvärderingsordning.
- Införa ett särskilt distribuerat kvotlager: väljs inte eftersom SQL Server redan
  är obligatoriskt, övervakat och gemensamt i båda stödda topologierna.
- Fortsätta verifiering när SQL-koordinering saknas: väljs inte eftersom
  tillgänglighet då skulle kringgå en säkerhetsgräns.
