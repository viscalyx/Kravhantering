# Avsiktsstyrd förhämtning av kravdetaljer

För utvecklare som ändrar eller felsöker kravlistornas förhämtning beskriver
den här guiden beteendet som ska bevaras och hur det kan verifieras.

Kravbibliotekets lista och kravunderlagets vänstra och högra kravlistor
förhämtar den blockerande huvudresursen för kravtext efter 150 ms avsikt.
Beteendet gäller bibliotekskrav i alla tre listorna och kravunderlagslokala
krav i kravunderlagets vänstra lista.

Förhämtningen är aktiv i utveckling, prodlike och produktion.

## Beteendekontrakt

- Fin pekare startar en timer vid `pointerenter`. Tangentbordsfokus på radens
  fokuserbara krav-ID-kommando använder samma tröskel.
- `pointerleave` respektive `blur` avbryter en väntande timer. Touch och grov
  pekare startar inte förhämtning.
- Klick går omedelbart genom samma loader. Ett pågående anrop dedupliceras och
  ett färdigt svar kan återanvändas i 30 sekunder.
- De två resurstyperna har separata, sidägda och aktörsbundna cacher.
  Kravunderlagets vänstra och högra lista delar cache för bibliotekskrav.
  Högst 32 avslutade svar per resurstyp behålls; pågående anrop räknas inte mot
  gränsen.
- Bibliotekskrav använder `requirementId` som kanonisk nyckel.
  Kravunderlagslokala krav använder `(specificationId, localRequirementId)`.
- Invalidation aborterar eller neutraliserar pågående svar. Ett auktoritativt
  anrop efter mutation kan därför inte ersättas av ett sent äldre svar.
- Spekulativa fel visas inte. Om klicket återanvänder ett pågående spekulativt
  anrop som misslyckas görs ett nytt vanligt anrop, utom vid `401`, `403` och
  `404`. Fel sparas inte i cachen; ett senare klick startar ett nytt anrop.
- Sidbyte, utloggning och autentiseringsavvisning tömmer eller neutraliserar
  berörda sidägda poster.

## Innehållsfri observerbarhet

Klienten publicerar lokala `CustomEvent`-händelser på `window` med namnet
`krav:requirement-detail-prefetch`. Lyssnare läser uppgifterna i `event.detail`.
Själva publiceringen skickar ingen telemetri till servern.
Händelserna gäller startad eller avbruten timer, förhämtning,
återanvändning av pågående anrop eller cache, oanvänd förhämtning, fel,
invalidation, avsikt-till-klick och klick-till-användbart-innehåll.

Händelserna innehåller yta, resurstyp, kanonisk resursnyckel, händelsetyp och
tidsstämpel. Utlösare och varaktighet finns när de är tillämpliga. Start och
slututfall kopplas samman med `prefetchId`; slututfallet anges i `outcome`.
Händelserna innehåller inte kravtext, personuppgifter eller annat
resursinnehåll. Händelseformat och cachebeteende finns i
[detail-prefetch.ts](../../lib/requirements/detail-prefetch.ts).

## Verifiering

- `REQ-21` i [library.spec.ts](../../tests/integration/requirements/library.spec.ts)
  täcker avbruten och återanvänd förhämtning i kravbiblioteket.
- `SPEC-21` i [requirement-detail.spec.ts](../../tests/integration/specifications/requirement-detail.spec.ts)
  täcker bibliotekskrav och kravunderlagslokala krav i
  kravunderlagets båda kravlistor.
- [Fokuserade enhetstester](../../lib/__tests__/detail-prefetch.test.ts)
  täcker cachelivslängd, kapacitet, samtidighet,
  felhantering, invalidation och resursnycklar.
