# Kapacitetsobserverbarhet via plattformen

Status: Antagen 2026-06-05.

Kravhantering registrerar kapacitetsmätningar, threshold breaches och
throttling som begränsade strukturerade JSON log events på
`channel: "capacity-observability"`. Applikationen emitterar signalen, men
plattformen äger log collection, dashboards, alerts, retention och SIEM-
eller APM delivery.

Det håller capacity observability separat från applikationens `Åtgärdslogg`
och från `Säkerhetslogg`-strömmen. Capacity events får innehålla säkra metrics
som duration, item counts, token counts, cost och retry-after seconds, men får
inte innehålla prompts, kravtext, images, raw query strings, tokens,
hemligheter eller HSA-id-värden.

V1 throttling är process-local och in-memory. Det duger som application
guardrail och kapacitetssignal, men skalad throttling i produktion måste flytta
till SQL Server, Redis eller en platform rate-limiting capability.

## Övervägda alternativ

- Lagra capacity events i applikationsdatabasen: avvisat eftersom dashboards,
  retention och alerting hör till plattformens log pipeline, och capacity data
  inte ska utöka applikationens bevismodell för åtgärdsloggen.
- Skicka events direkt till en specifik extern APM- eller SIEM-tjänst: avvisat
  eftersom det skulle koppla Kravhantering till ett driftverktyg i stället för
  plattformens log pipeline.
- Behandla in-memory throttling som slutlig produktionsarkitektur: avvisat
  eftersom process-local counters inte koordinerar över skalade instanser.
