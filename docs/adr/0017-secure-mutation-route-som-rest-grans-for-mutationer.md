# secureMutationRoute som REST-gräns för mutationer

Status: Antagen 2026-06-05.

Kravhantering leder applikationsägda muterande REST-metoder (`POST`, `PUT`,
`PATCH` och `DELETE`) genom `secureMutationRoute`. Omslaget är REST-gränsen för
mutationer och ansvarar för request context creation, same-origin- och
CSRF-kontroller, authenticated actor enforcement, route/body validation,
deklarerad authorization policy, action logging vid auktoriseringsavslag och
safe error shaping innan route handler-arbete körs.

Varje wrapper-baserad mutation deklarerar en av applikationens policy shapes:
`admin`, `requirements` eller `custom`. Logout använder det uttryckliga
specialfallet `secureLogoutMutationRoute` eftersom det är en
autentiseringsändpunkt med CSRF och behov av audit men utan
verksamhetsauktoriseringspolicy.

`/api/mcp` förblir det avsiktliga undantaget. MCP använder Bearer JWT
authentication och JSON-RPC/MCP tool schemas i stället för REST-omslaget för
mutationer, så MCP tool contracts och ADR 0006 styr dess transportgräns.

## Övervägda alternativ

- Låta varje REST route själv implementera autentisering, CSRF, validering och
  audit: avvisat eftersom säkerhetsordning och denial evidence skulle driva
  isär.
- Leda MCP genom REST-omslaget för mutationer: avvisat eftersom MCP har ett
  annat authentication- och schemakontrakt.
- Tillåta REST-mutationer utan wrapper med route-specifik motivering: avvisat
  eftersom undantag skulle försvaga täckningsinvarianten och göra
  säkerhetsgranskning svårare.
