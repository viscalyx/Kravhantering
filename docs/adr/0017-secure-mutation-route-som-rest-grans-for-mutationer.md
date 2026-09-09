# secureMutationRoute som REST-gräns för mutationer

Status: Antagen 2026-06-05.

Kravhantering leder som huvudregel applikationsägda REST-mutationer (`POST`, `PUT`,
`PATCH` och `DELETE`) genom `secureMutationRoute`. Omslaget är REST-gränsen för
mutationer och ansvarar för request context creation, same-origin- och
CSRF-kontroller, authenticated actor enforcement, route/body validation,
deklarerad authorization policy, action logging vid auktoriseringsavslag och
safe error shaping innan route handler-arbete körs.

Varje mutation med `secureMutationRoute` deklarerar en av dess policy shapes:
`admin`, `requirements` eller `custom`. Logout använder det uttryckliga
specialfallet `secureLogoutMutationRoute` eftersom det är en
autentiseringsändpunkt med CSRF och behov av audit men utan
verksamhetsauktoriseringspolicy.

`/api/mcp` ligger utanför REST-omslaget. MCP använder Bearer JWT
authentication och JSON-RPC/MCP tool schemas i stället för REST-omslaget för
mutationer, så MCP tool contracts och ADR 0006 styr dess transportgräns.

Inom REST-registret gäller det avgränsade undantaget för anonym native
CSP-rapportering i
[ADR 0062](./0062-anonym-native-csp-rapportering.md).

## Övervägda alternativ

- Låta varje REST route själv implementera autentisering, CSRF, validering och
  audit: avvisat eftersom säkerhetsordning och denial evidence skulle driva
  isär.
- Leda MCP genom REST-omslaget för mutationer: avvisat eftersom MCP har ett
  annat authentication- och schemakontrakt.
- Tillåta REST-mutationer utan godkänd wrapper med route-specifik motivering:
  avvisat eftersom undantag skulle försvaga täckningsinvarianten och göra
  säkerhetsgranskning svårare.
