# Separation mellan åtgärdslogg och plattformens säkerhetslogg

Status: Antagen 2026-06-05.

Kravhantering håller två separata beviskanaler: applikationens `Åtgärdslogg`
och plattformens `Säkerhetslogg`. Åtgärdsloggen lagrar varaktiga
`action_audit_events`-rader för mutationer som ägs av applikationen och
auktoriseringsavslag, så att administratörer kan granska verksamhets- och
administrationsåtgärder i applikationen.

Plattformens säkerhetslogg skriver strukturerade JSON lines taggade med
`channel: "security-audit"` för autentisering, session, token, CSRF,
privileged action, dataskydd, retention och andra säkerhetsrelevanta händelser.
Applikationen lagrar inte den strömmen i SQL och exponerar den inte via
åtgärdsloggens UI; routing, retention och SIEM delivery hör till plattformen.

Vissa arbetsflöden kan skriva till båda kanalerna när de både är
säkerhetsrelevanta och möjliga att granska i applikationen. I båda kanalerna
ska payloads vara begränsade och redigerade: inga hemligheter, tokens,
inskickad fritext, kravtext, råa target HSA-id values eller andra onödiga
personuppgifter ska skrivas som details.

## Övervägda alternativ

- Lagra allt bevisunderlag i `action_audit_events`: avvisat eftersom auth och
  plattformens säkerhetsövervakning behöver en operativ log stream som kan
  routas utanför applikationsdatabasen.
- Bara använda plattformens säkerhetsloggar: avvisat eftersom administratörer
  behöver varaktigt, sökbart bevisunderlag i applikationen för mutationer som
  ägs av applikationen och auktoriseringsavslag.
- Spegla varje händelse i båda kanalerna: avvisat eftersom det skulle duplicera
  personuppgifter och göra retention, dataskyddshantering och operativ
  alerting svårare att resonera om.
