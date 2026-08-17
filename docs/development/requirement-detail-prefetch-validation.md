# Avsiktsstyrd förhämtning av kravdetaljer

Kravbibliotekets lista och kravunderlagets vänstra och högra kravlistor
förhämtar den blockerande huvudresursen för kravtext efter 150 ms avsikt.
Beteendet gäller bibliotekskrav i alla tre listorna och kravunderlagslokala
krav i kravunderlagets vänstra lista.

## Produktionsbeteende

Förhämtningen är en del av kravlistornas ordinarie beteende i utveckling,
prodlike och produktion. Ett fel rättas eller återställs genom det vanliga
kodändrings-, build- och driftsättningsflödet.

Den temporära valideringsindikatorn, exportdiagnostiken, den syntetiska
latensen och den runtime-styrda av/på-profilen ingår inte i
produktionskontraktet.

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
- Spekulativa fel visas inte. Ett aktiverande klick gör ett nytt vanligt anrop
  efter andra spekulativa fel än `401`, `403` och `404`.
- Sidbyte, utloggning och autentiseringsavvisning tömmer eller neutraliserar
  berörda sidägda poster.

## Innehållsfri observerbarhet

Klienten skickar händelser för startad eller avbruten timer, förhämtning,
återanvändning av pågående anrop eller cache, oanvänd förhämtning, fel,
invalidation, avsikt-till-klick och klick-till-användbart-innehåll.

Händelserna innehåller yta, resurstyp, kanonisk resursnyckel, händelsetyp,
tidsstämpel, utlösare och varaktighet. De innehåller inte kravtext,
personuppgifter eller annat resursinnehåll.

## Beslutsevidens

Den deklarerade prodlike-proxyn jämför samma build, process, databas,
webbläsarkontext, klocka och observationsmetod för samtliga kombinationer.

<!-- markdownlint-disable MD013 -->
| Kombination | Av p95 | På avsikt p95 | Vinst | Direkt p50-delta | Direkt p95-delta / brus | Oanvända |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Kravbibliotek, bibliotekskrav | 119,5 ms | 19,8 ms | 99,7 ms (83,4 %) | −3,5 ms | −41,5 / 39,6 ms | 25 % |
| Kravunderlag vänster, bibliotekskrav | 112,9 ms | 26,5 ms | 86,4 ms (76,5 %) | −11,7 ms | −7,2 / 25,0 ms | 25 % |
| Kravunderlag vänster, lokalt krav | 233,5 ms | 21,0 ms | 212,5 ms (91,0 %) | −2,4 ms | −48,9 / 116,4 ms | 25 % |
| Kravunderlag höger, bibliotekskrav | 113,4 ms | 28,2 ms | 85,2 ms (75,1 %) | −4,4 ms | −24,0 / 25,0 ms | 25 % |
<!-- markdownlint-enable MD013 -->

Alla kandidatprov gör exakt ett huvud-GET. Samtliga startade förhämtningar får
ett entydigt slututfall, den verkliga lägg-till-mutationen tvingar fram ett
nytt huvud-GET och direktklick ligger inom den deklarerade brusregeln.

Den förhandsbestämda baslinjegränsen 200 ms uppfylls bara för lokala krav i
kravunderlagets vänstra lista. Produktionsbeslutet gör ett medvetet avsteg från
den gränsen och aktiverar samtliga kombinationer. Skälen är den godkända
mänskliga upplevelsen, 75–91 procents avsiktsvinst, direktklick utan försämring,
godkänd deduplicering och invalidation samt ett enhetligt beteende i de tre
kravlistorna.

## Verifiering

- `REQ-21` täcker avbruten och återanvänd förhämtning i kravbiblioteket.
- `SPEC-21` täcker bibliotekskrav och kravunderlagslokala krav i
  kravunderlagets båda kravlistor.
- Fokuserade enhetstester täcker cachelivslängd, kapacitet, samtidighet,
  felhantering, invalidation och resursnycklar.
