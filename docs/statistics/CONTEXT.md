# Verksamhetsstatistik

Detta sammanhang beskriver språket för att mäta Kravhanterings aktuella
verksamhetstillstånd och giltiga verksamhetsövergångar. Det äger inte diagram,
UI-layout, operativa tillstånd eller livscykelregler.

## Språk

Primärt ordlistespråk: `sv`

## Grundbegrepp

**Tillämpningsstatistik**:
Sammanställningar som visar hur krav används i kravunderlag, till exempel antal
kravtillämpningar, mest använda krav, avsteg per kravområde eller prioritet i
kravunderlag.

- `en`: Requirement application statistics

_Avoid_: Tillämpningsspårbarhet när enskild spårbarhet avses.

**Statistikhändelse**:
En beständig och tidsatt registrering av en verksamhetsövergång som gör det
möjligt att beräkna historiskt bestånd, flöde, ledtid eller omtag.
Statistikhändelsen anger både när övergången blev giltig och när den
registrerades. Den är inte en post i Åtgärdsloggen eller Säkerhetsloggen.

- `en`: Statistics event

_Avoid_: Åtgärdsloggspost, säkerhetshändelse, teknisk logghändelse.

**Statistikbaslinje**:
En daterad ögonblicksbild omedelbart före den första produktionsanvändningen
som omfattar alla då befintliga objekt. Den anger startpunkten från vilken
historiskt bestånd, flöde och genomströmning är tillförlitliga.

- `en`: Statistics baseline

_Avoid_: Återskapad historik före baslinjen, driftsättningsdatum utan
statistiksammanhang.

**Verksamhetstidszon**:
Den tidszon som avgränsar användarsynliga kalenderdagar, ISO-veckor och
kalendermånader i verksamhetsstatistik. För Kravhantering är den
`Europe/Stockholm`.

- `en`: Business time zone

_Avoid_: Lokal webbläsartidszon, UTC när verksamhetsperioden avses.

## Behörighet och aggregat

**Kontextskyddat användningsaggregat**:
Ett exakt mått över hur krav används som får omfatta kravunderlag som
mottagaren inte får läsa, men som inte visar kravunderlagens identitet,
personer eller innehåll.

- `en`: Context-protected usage aggregate

_Avoid_: Anonym statistik, kravunderlagsdetalj, ungefärligt användningstal.

**Aktörsgrupperad statistik**:
Tillämpningsstatistik som grupperas per identifierad person inom ett tillåtet
behörighetssammanhang och visar personens fullständiga visningsnamn och HSA-id.

- `en`: Actor-grouped statistics

_Avoid_: Personstatistik, topplista, statistik per namn utan stabil identitet.

## Kö-, tids- och flödesmått

**Statusålder**:
Antalet hela kalenderdagar i verksamhetstidszonen sedan en kravversion gick in
i sitt aktuella livscykelläge. För arkiveringsgranskning räknas tiden sedan
arkiveringen påbörjades; måttet anger inte i sig försening eller risk.

- `en`: Status age

_Avoid_: Kravålder, senaste redigering, automatisk försening.

**Användningsstatusålder**:
Antalet hela kalenderdagar i verksamhetstidszonen sedan en kravtillämpning
eller ett kravunderlagslokalt krav fick sin aktuella användningsstatus. Måttet
är beskrivande och anger inte i sig försening eller risk.

- `en`: Usage status age

_Avoid_: Statusålder utan användningssammanhang, senaste redigering,
automatisk försening.

**Påverkansomfattning**:
Mått på hur många aktuella kravtillämpningar och distinkta kravunderlag som kan
beröras av ett publicerings- eller arkiveringsbeslut. Måttet beskriver
omfattning, inte sannolikhet, konsekvens eller samlad risk.

- `en`: Impact scope

_Avoid_: Risk, risknivå, prioritet.

**Granskningsgenomströmning**:
Antalet avslutade granskningsbeslut under en period, uppdelat efter utfall. Det
är inte förändringen i köns storlek och omfattar inte automatisk arkivering som
följer av en ny publicering.

- `en`: Review throughput

_Avoid_: Köminskning, antal publiceringar utan övriga granskningsutfall.

**Granskningsköernas nettoflöde**:
Antalet granskningsköinträden minus antalet granskningsbeslut under samma
period. Måttet visar om köerna samlar eller minskar arbete men är inte ett
kvalitets- eller prestationsbetyg.

- `en`: Review queue net flow

_Avoid_: Granskningsgenomströmning, aktuellt köbestånd, produktivitet.

**Granskningsomtag**:
Ett förlopp där en kravversion återremitteras från granskning till utkast och
sedan skickas till granskning på nytt.

- `en`: Review rework cycle

_Avoid_: Återremiss när bara den första övergången avses, vanlig redigering.

**Granskningstid**:
Tiden från att en kravversion går in i en publicerings- eller
arkiveringsgranskningskö tills den lämnar samma kö genom ett granskningsbeslut.
Varje granskningsomtag ger en ny granskningstid.

- `en`: Review time

_Avoid_: Skapande till publicering, total tid i utkast, kravversionens ålder.

**Beslutsålder för förbättringsförslag**:
Antalet hela kalenderdagar i verksamhetstidszonen sedan den senaste giltiga
begäran om granskning för ett förslag i beslutsarbetskön. Måttet anger inte i
sig försening eller risk.

- `en`: Improvement suggestion decision age

_Avoid_: Förslagets skapandeålder, senaste redigering, automatisk försening,
statusålder utan förbättringsförslagssammanhang.

**Beslutstid för förbättringsförslag**:
Tiden från en giltig begäran om granskning till ett registrerat utfall för
samma granskningsvarv. Ett varv som återgår till förslagsutkast ingår inte.

- `en`: Improvement suggestion decision time

_Avoid_: Skapande till beslut, total förslagsålder, tid för avbrutet
granskningsvarv.

**Beslutsålder för RFI-frågeförslag**:
Antalet hela kalenderdagar i verksamhetstidszonen sedan granskning begärdes
för ett förslag i beslutsarbetskön för RFI-frågeförslag. Måttet anger inte i
sig försening eller risk.

- `en`: RFI question suggestion decision age

_Avoid_: RFI-frågeförslagets skapandeålder, senaste redigering, automatisk
försening.

**Beslutstid för RFI-frågeförslag**:
Tiden från begäran om granskning till registrerat RFI-frågeförslagsutfall för
samma förslag.

- `en`: RFI question suggestion decision time

_Avoid_: Skapande till beslut, total förslagsålder, beslutsålder för ett öppet
RFI-frågeförslag.

**Beslutsarbetsköns nettoflöde för RFI-frågeförslag**:
Antalet begäranden om granskning minus registrerade
RFI-frågeförslagsutfall under samma period. Måttet beskriver köns förändring,
inte produktivitet eller kvalitet.

- `en`: RFI question suggestion decision queue net flow

_Avoid_: Beslutsgenomströmning, köbestånd, prestationsmått.

**Förslagsomtag**:
Ett förlopp där ett förbättringsförslag återgår från beslutsarbetskön till
förslagsutkast och senare skickas för granskning på nytt.

- `en`: Improvement suggestion rework cycle

_Avoid_: Vanlig redigering av förslagsutkast, avvisat förslag, ny fristående
begäran om granskning.

**Beslutsarbetsköns nettoflöde**:
Antalet giltiga köinträden minus registrerade beslut och återgångar till
förslagsutkast under samma period. Måttet beskriver köns förändring, inte
produktivitet eller kvalitet.

- `en`: Improvement suggestion decision queue net flow

_Avoid_: Begäranden om granskning minus beslut, beslutsgenomströmning,
köbestånd.

**Beslutsålder för avsteg**:
Antalet hela kalenderdagar i verksamhetstidszonen sedan den senaste giltiga
begäran om granskning för ett avsteg i avstegsbeslutsarbetskön. Måttet anger
inte i sig försening eller risk.

- `en`: Deviation decision age

_Avoid_: Avstegets skapandeålder, senaste redigering, automatisk försening,
risk.

**Beslutstid för avsteg**:
Tiden från en giltig begäran om granskning till Godkänd eller Avslagen för
samma beslutsvarv. Ett varv som återgår till avstegsutkast ingår inte.

- `en`: Deviation decision time

_Avoid_: Skapande till beslut, total avstegsålder, tid för avbrutet
beslutsvarv.

**Avstegsomtag**:
Ett förlopp där ett avsteg återgår från avstegsbeslutsarbetskön till
avstegsutkast och senare skickas för granskning på nytt.

- `en`: Deviation rework cycle

_Avoid_: Vanlig redigering av avstegsutkast, nytt fristående avsteg.

**Avstegsbeslutsarbetsköns nettoflöde**:
Antalet giltiga köinträden minus registrerade beslut och återgångar till
avstegsutkast under samma period. Måttet beskriver köns förändring, inte
produktivitet eller kvalitet.

- `en`: Deviation decision queue net flow

_Avoid_: Beslutsgenomströmning, köbestånd, prestationsmått.

## Kravurvalsmått

**Kravpaketsanvändning**:
Att ett krav som ingår i ett kravpaket används genom en aktuell
kravtillämpning. Kravpaketsanvändning beskriver paketets aktuella räckvidd
oavsett vilken urvalsväg som ledde till kravtillämpningen.

- `en`: Requirements package usage

_Avoid_: Kravpaketsbidrag när paketet inte var en urvalskälla,
kravtillämpning när paketrelationen inte avses.

**Aktuellt paketinnehåll**:
Populationen av distinkta krav som ingår i ett kravpaket och har en aktuell
publicerad kravversion vid beräkningstidpunkten. Historiska paketkopplingar och
arkiverade krav utan efterträdare ingår inte.

- `en`: Current requirements package content

_Avoid_: Alla historiska paketkopplingar, flera kravversioner av samma krav.

**Pakettäckning**:
Andelen av ett kravpakets aktuella paketinnehåll som används genom aktuella
kravtillämpningar i ett angivet kravunderlag. En annan låst kravversion av
samma krav räknas som täckning men redovisas i ett separat versionsläge.

- `en`: Requirements package coverage

_Avoid_: Fullständighetsgrad, efterlevnad, kravpaketsbidrag.

**Paketets nettotillskott**:
Antalet krav i ett kravpakets aktuella paketinnehåll som ännu inte används
genom en aktuell kravtillämpning i det angivna kravunderlaget.

- `en`: Requirements package net addition

_Avoid_: Kravpaketsbidrag, automatiskt tillagda krav, saknade obligatoriska
krav.

**Kravpaketsöverlappning**:
Antalet krav i det aktuella paketinnehållet som två kravpaket har gemensamt,
samt detta antal som andel av respektive pakets aktuella paketinnehåll.

- `en`: Requirements package overlap

_Avoid_: Sammansatt likhetsbetyg, dubblettkrav, kravpaketsbidrag.

**Kravpaketsgranskning snart**:
Ett granskningsläge där ett aktivt kravpakets nästa granskningsdatum är
beräkningsdatumet eller någon av de följande 30 kalenderdagarna i
verksamhetstidszonen. Läget anger planeringsbehov, inte försening eller risk.

- `en`: Requirements package review due soon

_Avoid_: Försenad granskning, risk, senaste redigering.

**Kravpaket med passerat granskningsdatum**:
Ett granskningsläge där ett aktivt kravpakets nästa granskningsdatum ligger
före beräkningsdatumet i verksamhetstidszonen. Läget anger inte i sig risk
eller att paketet är inaktuellt.

- `en`: Requirements package with overdue review date

_Avoid_: Inaktuellt kravpaket, riskpaket, senaste redigering.

**Kravpaketsgranskning inte planerad**:
Ett granskningsläge där ett aktivt kravpaket saknar nästa granskningsdatum.
Läget anger inte i sig att paketet är inaktuellt.

- `en`: Requirements package review not scheduled

_Avoid_: Inaktuellt kravpaket, passerat granskningsdatum.

**Kravurvalsanvändning**:
Andelen befintliga kravunderlag som har minst ett aktuellt sparat
kravurvalssvar vid beräkningstidpunkten.

- `en`: Requirement selection usage

_Avoid_: Användning av kravurvalsfiltret, antal visningar, svarsgrad.

**Svarsgrad**:
Antalet synliga aktiva fråga–kravunderlag-par med minst ett aktuellt sparat
kravurvalssvar dividerat med alla synliga aktiva fråga–kravunderlag-par i den
angivna populationen. Måttet beskriver användning och är inte en
färdigställandegrad eller valideringsgrind.

- `en`: Answer rate

_Avoid_: Färdigställandegrad, obligatorisk svarsgrad, svarsfrekvens när antal
svarshändelser avses.

## RFI-mått

**RFI-frågeanvändning**:
Att en RFI-fråga är markerad med Ingår i RFI i en låst RFI-frågelista.
Förekomst eller markering i en upplåst lista räknas inte som användning.

- `en`: RFI question usage

_Avoid_: Förekomst i en upplåst RFI-frågelista, RFI-relevans.

**Bedömningstäckning för RFI-relevans**:
Andelen inkluderade poster i låsta RFI-frågelistor som har RFI-relevans.
Måttet beskriver bedömningens täckning, inte frågornas relevans eller kvalitet.

- `en`: RFI relevance assessment coverage

_Avoid_: Relevansgrad, färdigställandegrad, kvalitetsbetyg.

**Kravurvalsmatchning**:
Ett mått på om ett bibliotekskrav som läggs till i ett kravunderlag ingick i
kravunderlagets aktuella kravurvalssammanhang när kravtillämpningen skapades.
Jämförelsen gäller kravets stabila identitet. Måttet visar samband och anger
inte vilken urvalskälla som orsakade valet.

- `en`: Requirement selection match

_Avoid_: Kravurvalsbidrag, rekommendation, bevisad urvalsorsak, att klassa en
kravtillämpning från före statistikbaslinjen som matchad eller omatchad.

**Kravurvalskonfigurationsversion**:
En tidsbestämd identifiering av den kombination av kravurvalsfrågor, svar,
kravkopplingar och synlighetsvillkor som gällde när en statistikhändelse
inträffade.

- `en`: Requirement selection configuration version

_Avoid_: Kravversion, kopia av fullständig frågetext, aktuell konfiguration
utan tidsanknytning.
