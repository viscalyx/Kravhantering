# Kravunderlag

Detta sammanhang beskriver språket för kravunderlag, tillämpningsstyrning,
kravtillämpningar, kravunderlagslokala krav och avsteg.

## Language

Primärt ordlistespråk: `sv`

### Begrepp

**Tillämpningsstyrning**:
Arbetet med att använda kravbiblioteket i ett konkret tillämpningssammanhang,
till exempel genom behov, urval, kravunderlagslokala krav, prioritering,
kravtillämpningar, avsteg och uppföljning.

- `en`: Requirement application governance

<!-- cSpell:disable-next-line -->
_Avoid_: Kravstyrning som huvudterm.

**Tillämpningsstyrning för kravarbete**:
Preciserad form av tillämpningsstyrning när sammanhanget inte redan tydligt är
kravhantering.

- `en`: Requirements work application governance

<!-- cSpell:disable-next-line -->
_Avoid_: Kravstyrning och kravmodellering för tillämpning som vardaglig term.

**Tillämpningsspårbarhet**:
Förmågan att följa varför och hur krav används i kravunderlag genom
kravtillämpningar, behovsreferenser, användningsstatus, avsteg och uppföljning.
Begreppet hör hemma i rapportering och statistik om kravens användning.

- `en`: Requirement application traceability

_Avoid_: Kravhistorik, teknisk audit.

**Tillämpningsstatistik**:
Sammanställningar som visar hur krav används i kravunderlag, till exempel antal
kravtillämpningar, mest använda krav, avsteg per kravområde eller risknivåer i
kravunderlag.

- `en`: Requirement application statistics

_Avoid_: Tillämpningsspårbarhet när enskild spårbarhet avses.

**Kravunderlagsmedförfattare**:
En person som stödjer arbetet med ett kravunderlag och dess
kravunderlagslokala innehåll.

- `en`: Specification co-author

_Avoid_: Medförfattare när sammanhanget inte visar kravunderlag.

**Bibliotekskrav**:
Ett krav från kravbiblioteket när det används eller jämförs i ett sammanhang
där andra krav inte kommer från kravbiblioteket. I själva kravbiblioteket
räcker termen krav.

- `en`: Library requirement

_Avoid_: Alla krav i kravbiblioteket när ingen kontrast behövs.

**Kravunderlagslokalt krav**:
Ett krav som bara finns i ett visst kravunderlag. Det är unikt för det
kravunderlaget tills det eventuellt lyfts till kravbiblioteket. Det hör inte
till ett kravområde; ansvaret ligger i kravunderlagets sammanhang hos
kravunderlagsansvarig.

- `en`: Specification-local requirement

_Avoid_: Lokalt krav utan sammanhang, bibliotekskrav.

**Unikt krav**:
Kort användargränssnittsterm för kravunderlagslokalt krav. Använd den när
utrymmet är begränsat eller när sammanhanget redan tydligt är ett kravunderlag.

- `en`: Unique requirement

_Avoid_: Unikt krav utanför kravunderlagssammanhang.

**Lyfta till kravbiblioteket**:
Att skapa ett nytt krav i utkast i kravbiblioteket med utgångspunkt i ett
kravunderlagslokalt krav. Det kravunderlagslokala kravet ligger kvar i sitt
kravunderlag.

- `en`: Graduate to Requirements Library

_Avoid_: Flytta till kravbiblioteket, publicera direkt till kravbiblioteket.

**Kravunderlag**:
En sammanställd och spårbar samling av bibliotekskrav och eventuella
kravunderlagslokala krav för ett specifikt projekt, upphandling, införande,
förvaltning eller annat användningssammanhang.

- `en`: Requirements specification

_Avoid_: Kravspecifikation som huvudterm.

**Underlagssyfte**:
En beskrivning av varför hela kravunderlaget finns, till exempel förmågan som
ska realiseras eller vad ett IT-stöd som ska upphandlas ska göra.

- `en`: Specification purpose

_Avoid_: Behovsreferens när en enskild kravtillämpning avses.

**Verksamhetsbehovsreferens**:
Äldre eller tekniskt namn för underlagssyfte.

- `en`: Business needs reference

_Avoid_: Behovsreferens när en enskild kravtillämpning avses.

**Styrningsobjektstyp**:
En klassning av vilken typ av styrningssammanhang ett kravunderlag hör till,
till exempel förvaltningsobjekt, leveransområde, tjänsteområde, projekt eller
uppdrag.

- `en`: Governance object type

_Avoid_: Verksamhetsobjekt, kravområde.

**Verksamhetsobjekt**:
Ett begreppsligt objekt som verksamheten hanterar eller beskriver, till exempel
kund, ärende, beställning, avtal, produkt, patient eller ansökan.

- `en`: Business object

_Avoid_: Styrningsobjektstyp när kravunderlagets klassning avses.

**Genomförandeform**:
En klassning av hur kravunderlaget ska omsättas, till exempel genom
upphandling, inköp eller utveckling.

- `en`: Implementation type

_Avoid_: Livscykelstatus, förvaltning.

**Kravunderlagets livscykelstatus**:
Status som beskriver var kravunderlaget befinner sig i processen, till exempel
upphandling, utveckling/införande eller förvaltning.

- `en`: Specification lifecycle status

_Avoid_: Kravversionsstatus, genomförandeform.

**Kravunderlagsansvarig**:
Den person eller funktion som har huvudansvar för ett kravunderlags
sammansättning, kravtillämpningar, kravunderlagslokala krav och avsteg.

- `en`: Specification lead

_Avoid_: Kravunderlagsägare.

**Kravtillämpning**:
Att en publicerad kravversion från kravbiblioteket används i ett visst
kravunderlag. Kravtillämpningen bär det underlagsspecifika sammanhanget, inte
kravet i kravbiblioteket.

- `en`: Requirement application

_Avoid_: Kravunderlagsrad, kopia av krav.

**Behovsreferens**:
En underlagsspecifik hänvisning som förklarar varför en kravtillämpning behövs
i kravunderlaget. Behovsreferensen ger också sammanhang när kravtillämpningen
ska verifieras.

- `en`: Needs reference

_Avoid_: Normreferens.

**Användningsstatus**:
Det underlagsspecifika läget för en kravtillämpning i ett kravunderlag. Det
beskriver hur kravet används eller följs upp i just det sammanhanget.

- `en`: Usage status

_Avoid_: Kravstatus, kravversionsstatus.

**Avsteg**:
Ett underlagsspecifikt undantag från att följa en kravtillämpning fullt ut.
Avsteget hör till kravtillämpningen i ett kravunderlag och ändrar inte kravet i
kravbiblioteket.

- `en`: Deviation

_Avoid_: Ändring av bibliotekskrav, kravändring.

**Avstegsgranskningsrapport**:
Rapport som stödjer granskning och beslut om avsteg i ett kravunderlag.

- `en`: Deviation review report

_Avoid_: Granskningsrapport när avsteg avses.
