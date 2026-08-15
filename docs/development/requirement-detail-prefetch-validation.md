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
