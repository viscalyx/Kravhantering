# Kontextkarta

Använd kartan för att välja ordlista. Läs endast det sammanhang som arbetet
berör och läs båda när arbetet korsar gränsen.

## Sammanhang

- [Kravhantering](./CONTEXT.md) — äger applikationens verksamhetsbegrepp,
  användarflöden och applikationsstyrda tillstånd.
- [Verksamhetsstatistik](./docs/statistics/CONTEXT.md) — äger begrepp för
  mätningar, tidsbetydelser, behörighetsskyddade aggregat och statistisk
  historik.
- [Driftsättning och leverans](./docs/operations/CONTEXT.md) — äger begrepp för
  releasepaketering, driftsättning, uppgradering, verifiering och
  driftöverlämning.

## Ägarskapsregel

- Kravhantering äger verksamhetsobjekt, giltiga tillstånd och giltiga
  verksamhetsövergångar.
- Verksamhetsstatistik äger hur fakta räknas, grupperas, tidsbestäms, jämförs,
  bevaras som statistisk historik och lämnas ut som aggregat.
- Ett begrepp definieras endast i det källägande sammanhanget och refereras
  därifrån av konsumerande sammanhang.

## Relationer

- **Driftsättning och leverans → Kravhantering**: Driftsättningssammanhanget
  paketerar, driftsätter, uppgraderar och verifierar applikationen genom dess
  exponerade driftkontrakt.
- **Verksamhetsstatistik → Kravhantering**: Verksamhetsstatistik använder
  Kravhanterings aktuella verksamhetstillstånd och giltiga
  verksamhetsövergångar för att härleda behörighetsskyddade aggregat,
  historiskt bestånd och flöde, åldrar, tider och omtag. Sammanhanget
  omdefinierar inte livscykellägen, utfall eller operativa arbetsköer.
- **AI-drift**: Driftsättningssammanhanget äger `AI-driftsättningsbevis` och
  `Staging-liveprov för AI`. Kravhantering äger `Global AI-spärr`, som
  operatören släpper först efter godtaget bevis.
- **Säkerhetslogg**: Kravhantering äger skapandet av säkerhetshändelser och
  skillnaden mot `Åtgärdslogg`. Driftplattformen äger insamling, retention och
  SIEM-routning.
