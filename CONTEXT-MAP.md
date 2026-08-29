# Kontextkarta

Använd kartan för att välja ordlista. Läs endast det sammanhang som arbetet
berör och läs båda när arbetet korsar gränsen.

## Sammanhang

- [Kravhantering](./CONTEXT.md) — äger applikationens verksamhetsbegrepp,
  användarflöden och applikationsstyrda tillstånd.
- [Driftsättning och leverans](./docs/operations/CONTEXT.md) — äger begrepp för
  releasepaketering, driftsättning, uppgradering, verifiering och
  driftöverlämning.

## Relationer

- **Driftsättning och leverans → Kravhantering**: Driftsättningssammanhanget
  paketerar, driftsätter, uppgraderar och verifierar applikationen genom dess
  exponerade driftkontrakt.
- **AI-drift**: Driftsättningssammanhanget äger `AI-driftsättningsbevis` och
  `Staging-liveprov för AI`. Kravhantering äger `Global AI-spärr`, som
  operatören släpper först efter godtaget bevis.
- **Säkerhetslogg**: Kravhantering äger skapandet av säkerhetshändelser och
  skillnaden mot `Åtgärdslogg`. Driftplattformen äger insamling, retention och
  SIEM-routning.
