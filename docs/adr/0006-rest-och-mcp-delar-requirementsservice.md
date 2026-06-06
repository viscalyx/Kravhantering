# REST och MCP delar RequirementsService

Status: Antagen 2026-06-05.

REST routes och MCP tools är likvärdiga gränssnitt över en gemensam
`RequirementsService` när deras arbetsflöden överlappar. Transport parsing,
response status, content type och gränssnittsspecifik response shaping ligger
kvar i route handlers och MCP tool handlers, medan auktorisering, loggning,
workflow validation, high-risk audit events och gemensamma verksamhetsbeslut
ligger i tjänsten.

REST-only routes för referensdata, taxonomi och CRUD i Admin Center får ligga
kvar direkt mot DAL tills de blir del av MCP-kontraktet. När ett MCP tool läggs
till för ett befintligt REST workflow flyttas motsvarande REST-beteende bakom
`RequirementsService` i samma ändring.

## Övervägda alternativ

- Duplicera verksamhetslogik mellan REST och MCP: avvisat eftersom kravets
  livscykel, medlemskap i kravunderlag, förslag och säkerhetsbeslut måste vara
  konsekventa över användargränssnitt och AI-riktade gränssnitt.
- Skicka varje REST endpoint genom `RequirementsService`: avvisat eftersom
  enkla REST-only admin- och lookup routes inte behöver den extra
  tjänstegränsen förrän de delar beteende med MCP.
