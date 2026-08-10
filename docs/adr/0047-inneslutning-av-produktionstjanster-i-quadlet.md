# Inneslutning av produktionstjänster i Quadlet

Kravhanterings produktionstjänster körs rootless med nekande grundläge: alla
Linux-förmågor tas bort, nya privilegier förhindras och rotfilsystemen är
skrivskyddade. Endast uttryckligen storleksatta temporära filsystem, befintliga
namngivna datavolymer eller en validerad privat exportkatalog är skrivbara.
Validerade tjänstegränser för minne, CPU, processer och loggtakt måste kunna
verkställas av värdens cgroup- och systemd-konfiguration; installationen
avbryts annars innan aktiva enheter ersätts. Kompatibilitetsundantag är
tjänstespecifika och kräver dokumenterad orsak och verifieringsbevis.

SQL Server behåller endast `NET_BIND_SERVICE` i förmågegränsen. Den fästa
binären `sqlservr` har filförmågan `cap_net_bind_service=ep`; utan motsvarande
förmåga i gränsen nekar kärnan körningen när `NoNewPrivileges` används. Varken
startprocessen eller `sqlservr` har någon effektiv förmåga efter start.
SQL Servers enda skrivbara mål är den beständiga volymen på
`/var/opt/mssql` och ett storleksbegränsat `/tmp`.

Keycloaks fästa standardavbild utför en Quarkus-augmentering vid start. Ett
skrivskyddat rotfilsystem utan undantag stoppar starten när
`/opt/keycloak/lib/quarkus/transformed-bytecode.jar` ska ersättas. Podmans
standardmässiga kopiering till ett 64 MiB temporärt filsystem på
`/opt/keycloak/lib/quarkus` bevarar avbildens indata och begränsar de genererade
utdata som försvinner vid omstart. Övriga skrivbara mål är den befintliga
Keycloak-volymen och ett storleksbegränsat `/tmp`. Keycloak behåller ingen
Linux-förmåga.

Produktionsnätverken skiljer kant-, identitets-, databas- och
applikationsutgående trafik. Endast nginx publicerar en värdport, medan
destinationsstyrning som Podmans bryggnät inte kan uttrycka ägs av värdens
brandvägg, utgående proxy och motpartens åtkomstregler. SQL Server tillhör
endast databasnätverket och Keycloak endast identitetsnätverket. Ingen av dem
publicerar en värdport. Explicita databasjobb använder endast databasnätverket.

PR- och releasevalidering installerar samma versionssatta produktionsarkiv som
en operatör använder och kör den riktiga Quadlet-livscykeln på en fullständig
Ubuntu-runner. HSA-flödet verifieras genom en separat CI-only Quadlet-overlay
med Kong, adaptern och katalogmocken; overlayen ingår inte i
produktionsarkivet eller produktionstopologin. HSA-gränsen och de separata
stödtjänsterna ägs fortsatt av
[ADR 0029](0029-hsa-personuppslag-som-restgrans-mot-integrationsplattform.md).
RHEL-kvalificering kompletterar detta med SELinux, firewalld, RHEL:s
Podman-version och verklig omstartsbeständighet. Compose är endast ett lokalt
utvecklingskontrakt. Tjänsternas loggtak begränsar tillväxt men är
förlustbringande vid extrem överlast; plattformens säkerhetslogg får därför
inte beskrivas som fullständig, medan den databaslagrade åtgärdsloggen förblir
den varaktiga beviskanalen.
