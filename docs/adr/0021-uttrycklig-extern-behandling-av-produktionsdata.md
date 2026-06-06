# Uttrycklig extern behandling av produktionsdata

Status: Antagen 2026-06-05.

Kravhantering behandlar extern behandling av produktionsdata som ett uttryckligt
driftsättnings- och integrationsval, inte som något som följer av att
applikationen installeras. I en installation i egen drift där kunden kör
application host, SQL Server, IdP, reverse proxy, loggning, SIEM och backup
inom den egna organisationen är baslinjen att ingen extern part behandlar
Kravhanterings produktionsinformation enbart för att applikationen är
installerad.

Externa parter blir relevanta när de faktiskt tar emot, lagrar, transporterar,
analyserar eller kan komma åt produktionsinformation. Exempel är externa
IdP-tjänster, hosted SQL Server eller databasdrift, plattformsloggning eller
SIEM, backup- eller arkivlagring, support med åtkomst till loggar eller
exporter, godkända externa MCP clients eller AI agents samt OpenRouter eller
valda model providers när AI-assisted authoring är aktiverat.

Programvaruleverantörer, package sources, CI/CD services och container
registries dokumenteras som supply-chain dependencies som standard. De
dokumenteras som externa behandlare av produktionsdata först när de tar emot
produktionsdata,
loggar, telemetry, support packages, remote access eller en annan faktisk väg
till Kravhanterings information.

## Övervägda alternativ

- Lista varje programvaruleverantör som behandlare av produktionsdata: avvisat
  eftersom det blandar ihop supply-chain dependencies med parter som faktiskt
  behandlar Kravhanterings information.
- Behandla en installation i egen drift som utan externa processors i varje
  fall: avvisat eftersom integrationer som external IdP, loggning, support,
  MCP clients och AI providers kan introducera faktisk extern åtkomst.
- Låta varje feature avgöra gränsen självständigt: avvisat eftersom inköp,
  dataskydd, säkerhet och drift behöver en konsekvent regel för när extern
  behandling ska dokumenteras.
