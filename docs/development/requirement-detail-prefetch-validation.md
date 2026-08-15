# Validera avsiktsstyrd förhämtning av kravdetaljer

Den produktionsklara valideringskandidaten förhämtar den blockerande
huvudresursen för kravtext efter 150 ms avsikt. Kandidaten omfattar
kravbibliotekets lista och kravunderlagets vänstra och högra kravlistor.

## Byggtidsflaggor

`NEXT_PUBLIC_ENABLE_REQUIREMENT_DETAIL_PREFETCH` aktiverar den permanenta
kandidatfunktionen. Ändringen kräver en ny build. När flaggan är `false`
använder detaljpanelerna sina tidigare direkta anrop utan kandidatens cache.

Följande temporära valideringsflaggor får bara användas i en uttrycklig
valideringsbuild:

- `NEXT_PUBLIC_VALIDATE_REQUIREMENT_DETAIL_PREFETCH=true` visar exportverktyget
  och 150 ms-indikatorn.
- `NEXT_PUBLIC_REQUIREMENT_DETAIL_PREFETCH_SYNTHETIC_LATENCY_MS` lägger till en
  kontrollerad fördröjning efter huvudresursens HTTP-svar. Standardvärdet är
  `0`.

`.env.development` och `.env.prodlike` aktiverar kandidaten och
valideringsverktygen på valideringsgrenen. Verklig driftsättning ska hålla de
temporära valideringsflaggorna avstängda.

## Beteendekontrakt

- Fin pekare startar en timer vid `pointerenter`. Tangentbordsfokus på radens
  fokuserbara krav-ID-kommando använder samma tröskel.
- `pointerleave` respektive `blur` avbryter en väntande timer. Touch och grov
  pekare startar inte förhämtning.
- Klick går omedelbart genom samma loader. Ett pågående anrop dedupliceras och
  ett färdigt svar kan återanvändas i 30 sekunder.
- De två resurstyperna har separata, sidägda cacher. Högst 32 avslutade svar
  per resurstyp behålls; pågående anrop räknas inte mot gränsen.
- Invalidation aborterar eller neutraliserar pågående svar. Ett auktoritativt
  anrop efter mutation kan därför inte ersättas av ett sent äldre svar.
- Spekulativa fel visas inte. Ett aktiverande klick gör ett nytt vanligt anrop
  efter andra spekulativa fel än `401`, `403` och `404`.
- Varje `prefetch-started` får ett korrelerande `prefetchId` och exakt ett
  `prefetch-outcome`. Utfallet är använt eller oanvänt genom utgång, kapacitet,
  fel, invalidation, uttrycklig rensning eller sidbyte. Exporten innehåller en
  sammanfattning som visar oklassificerade, dubbla och föräldralösa utfall.

## Mätprofiler

Bygg om mellan profilerna eftersom inställningarna är byggtidsvärden.

1. Mät representativ lokal prodlike med syntetisk latens `0`.
1. Mät känslighet med exempelvis `150` ms syntetisk latens.
1. Kör varje yt- och resurskombination med funktionen av och på.
1. Exportera händelser från det flytande valideringsverktyget efter varje
   profil. Exporten anger `syntheticLatencyMs`; syntetiska värden får inte
   redovisas som representativ driftdata.

Matrisen består av:

- kravbibliotek, bibliotekskrav
- kravunderlag vänster, bibliotekskrav
- kravunderlag vänster, kravunderlagslokalt krav
- kravunderlag höger, bibliotekskrav

Exporten innehåller endast yta, resurstyp, kanonisk resursnyckel, händelsetyp,
tidsstämpel, utlösare och varaktighet. Den innehåller inte kravtext,
personuppgifter eller annat resursinnehåll.

## Kandidatmätning 2026-08-15

Den automatiserade kandidatmätningen kördes i byggd prodlike med Chromium och
seedad SQL Server-data. Varje cell bygger på tio isolerade prov med omladdning
mellan proven. Tiden mäts från klick till synlig kravtext. Avsiktsproven väntar
180 ms efter hover före klick. Profilen `+150 ms` fördröjer huvud-GET i
webbläsarens route så att samma kontrollerade latens kan jämföras med funktionen
både av och på; den är en känslighetsanalys och inte representativ driftdata.

Kombinationerna är:

- A: kravbibliotek, bibliotekskrav
- B: kravunderlag vänster, bibliotekskrav
- C: kravunderlag vänster, lokalt krav
- D: kravunderlag höger, bibliotekskrav

Representativ lokal prodlike:

| Kombination | Av direkt | På direkt | På avsikt | Vinst |
| --- | ---: | ---: | ---: | ---: |
| A | 309 ms | 280 ms | 90 ms | 219 ms (71 %) |
| B | 343 ms | 348 ms | 121 ms | 222 ms (65 %) |
| C | 443 ms | 453 ms | 139 ms | 304 ms (69 %) |
| D | 429 ms | 328 ms | 153 ms | 276 ms (64 %) |

Kontrollerad extra latens på 150 ms:

| Kombination | Av direkt | På direkt | På avsikt | Vinst |
| --- | ---: | ---: | ---: | ---: |
| A | 428 ms | 455 ms | 263 ms | 165 ms (39 %) |
| B | 479 ms | 506 ms | 311 ms | 168 ms (35 %) |
| C | 489 ms | 491 ms | 320 ms | 169 ms (35 %) |
| D | 480 ms | 538 ms | 226 ms | 254 ms (53 %) |

Alla kandidatprov, både direktklick och avsikt, gjorde exakt ett huvud-GET per
öppnad detalj. Direktklickens lokala p95-delta mot avstängd funktion var
`-101` till `+10` ms. I känslighetsprofilen var deltat `+2` till `+58` ms;
p50-deltat var `-11` till `+28` ms. Den större p95-variationen under syntetisk
latens ska vägas in i den mänskliga bedömningen och inte behandlas som
representativ driftregression.

Den automatiserade körningen kan visa deduplicering och klicklatens men inte
en representativ andel oanvända förhämtningar eller upplevd kvalitet. Dessa två
punkter återstår därför till den mänskliga valideringen.

## Automatisk beslutsproxy 2026-08-15

`npm run test:prefetch-proxy:prodlike` kör `PREFETCH-01` mot en seedad SQL
Server-databas och en byggd prodlike-applikation. Samma build växlar en
valideringsspecifik och icke beständig runtime-styrning mellan av och på för
varje yt- och resurskombination. Styrningen fungerar endast när både
kandidatflaggan och den uttryckliga valideringsflaggan är aktiva. Vanliga
produktionsbyggen behåller byggtidsflaggan som enda aktiveringsbrytare.

Profilen gör fem direktklick per läge samt tre använda och en oanvänd
förhämtning per kombination. Tiden tas i sidan från det faktiska klickets
capture-lyssnare tills en `MutationObserver` ser den nya rubriken **Kravtext**.
Av och på delar därför build, process, databas, webbläsarkontext, klocka och
observationsmetod. Den oanvända förhämtningen avslutas genom ett Next.js-
sidbyte. En verklig lägg-till-mutation i kravunderlaget verifierar att den
tidigare förhämtningen invalideras och att nästa öppning gör ett nytt huvud-GET.

Direktklick räknas som försämrat endast om p50-deltat överstiger 25 ms och
p95-deltat samtidigt överstiger
`max(25 ms, 2 × största MAD, största p95−p50-spann)`. Regeln är deklarerad i
testhjälpen och skyddar små stickprov mot att ett enstaka svansvärde ensam
klassas som en produktregression.

<!-- markdownlint-disable MD013 -->
| Kombination | Av p95 | På avsikt p95 | Vinst | Direkt p50-delta | Direkt p95-delta / brus | Oanvända |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 119,5 ms | 19,8 ms | 99,7 ms (83,4 %) | −3,5 ms | −41,5 / 39,6 ms | 25 % |
| B | 112,9 ms | 26,5 ms | 86,4 ms (76,5 %) | −11,7 ms | −7,2 / 25,0 ms | 25 % |
| C | 233,5 ms | 21,0 ms | 212,5 ms (91,0 %) | −2,4 ms | −48,9 / 116,4 ms | 25 % |
| D | 113,4 ms | 28,2 ms | 85,2 ms (75,1 %) | −4,4 ms | −24,0 / 25,0 ms | 25 % |
<!-- markdownlint-enable MD013 -->

Alla kandidatprov gör exakt ett huvud-GET. Samtliga 16 startade förhämtningar
har exakt ett slututfall: 12 använda och 4 oanvända vid sidbyte, utan
oklassificerade, dubbla eller föräldralösa utfall. Den verkliga mutationen
klarar invalidationskontrollen. Direktklick klarar brusregeln på alla ytor.

Den samlade proxybedömningen är ändå `pass: false`, endast därför att den låsta
baslinjegränsen 200 ms inte nås för samtliga fyra kombinationer. A, B och D
ligger under gränsen medan C ligger över den. Latensvinstregeln klaras på alla
kombinationer genom minst 50 procents förbättring; C sparar dessutom mer än 100
ms.

Den nya gemensamma in-page-metoden undanröjer skillnaden mellan tidigare
baslinjer för beslutet. Fyra av fem prov ligger mellan 111 och 121 ms även för
C; ett svansvärde på 233,5 ms höjer dess p95 och ger en brusgräns på 116,4 ms.
Profilen kan inte reproducera kandidatrapportens senare 309–443 ms. De senare
värdena innehåller därför sannolikt kall testorkestrering eller yttre
Playwright-väntan och används inte som representativ baslinje i slutbeslutet.

## Go-kontroll

Bedöm varje kombination mot följande kriterier:

- representativ baslinje-p95 är minst 200 ms
- p95 efter aktivering minskar med minst 100 ms eller ungefär 50 procent
- direktklick visar ingen mätbar försämring
- inga dubbla samtidiga huvud-GET förekommer
- sena svar återinförs inte efter invalidation
- högst 25 procent av startade förhämtningar förblir oanvända under 30 sekunder

Efter mänsklig validering tas 150 ms-indikatorn, exportverktyget, den syntetiska
latensen och deras byggtidsflaggor bort. Den typade cachen, avsiktspolicyn,
invalidationen och den innehållsfria observerbarheten ska inte skrivas om vid
ett go-beslut.
