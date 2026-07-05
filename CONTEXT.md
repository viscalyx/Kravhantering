# Kravhantering

Detta sammanhang beskriver verksamhetsspråket för kravhantering:
hur krav formuleras, granskas, publiceras, används och följs upp.

## Language

Primärt ordlistespråk: `sv`

### Kärnbegrepp

**Krav**:
En styrande utsaga om något som ska vara uppfyllt. Ett krav har en
egen identitet, klassificering, livscykel, versioner och spårbarhet.

- `en`: Requirement

_Avoid_: Kravtext när hela kravet avses.

**Kravtext**:
Den formulerade lydelsen av ett krav i en viss version. Kravtexten är
innehållet som beskriver vad som ska uppfyllas, inte kravet som helhet.

- `en`: Requirement text

_Avoid_: Krav när bara lydelsen avses.

**Kravversion**:
En bestämd version av ett kravs lydelse och verksamhetsmetadata vid en viss
tidpunkt. Ett krav kan ha flera kravversioner, men varje kravversion hör till
exakt ett krav.

- `en`: Requirement version

_Avoid_: Historikpost, kopia.

**Krav-ID**:
Den stabila identifieraren för ett krav över alla kravversioner. Ett krav-ID får
aldrig upprepas eller återanvändas; en specifik kravversion anges med krav-ID
och versionsnummer.

- `en`: Requirement ID

_Avoid_: Versions-ID, radnummer.

**Version**:
Ett löpnummer inom ett krav som identifierar en kravversion tillsammans med
kravets krav-ID. Ett versionsnummer kan återanvändas om ett senaste utkast
raderas innan en ny kravversion skapas.

- `en`: Version

_Avoid_: Krav-ID, globalt versionsnummer.

**Publicerad kravversion**:
Den kravversion som har godkänts och gjorts tillgänglig för användning. Om ett
krav har ett nyare utkast eller en version i granskning är den publicerade
kravversionen fortfarande den version som används tills en ny version
publiceras.

- `en`: Published requirement version

_Avoid_: Gällande kravversion, aktiv version.

**Publicering**:
Beslutet att godkänna en granskad kravversion och göra den till den publicerade
kravversion som får användas i kravunderlag.

- `en`: Publication

_Avoid_: Spara, granska.

**Kravversionsstatus**:
Status som beskriver var en kravversion befinner sig i kravbibliotekets
livscykel, till exempel Utkast, Granskning, Publicerad eller Arkiverad.

- `en`: Requirement version status

_Avoid_: Kravstatus, status för kravunderlag, användningsstatus.

**Beräknad kravstatus**:
Status som beskriver hur ett krav som helhet behandlas i filtrering och
översikter när flera kravversioner kan finnas.

- `en`: Effective requirement status

_Avoid_: Kravversionsstatus när en enskild kravversion avses, effektiv status
utan kravsammanhang, beräknad kravversionsstatus.

**Kravbibliotek**:
Den gemensamma samlingen av krav som förvaltas, versioneras, granskas och
återanvänds över tid. I användargränssnittet ska kravbibliotek vara det
primära namnet på ytan där användaren hittar och arbetar med gemensamma krav.

- `en`: Requirements Library

_Avoid_: Kravkatalog som primär UI-benämning.

**Kravbiblioteksförvaltning**:
Processen och ansvaret för att hålla kravbiblioteket korrekt, aktuellt,
granskat, publicerat, versionerat, arkiverat och förbättrat över tid.

- `en`: Requirements Library stewardship

_Avoid_: Kravbibliotek när processen avses, administration,
förvaltning utan tydligt kravbibliotekssammanhang.

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
kravtillämpningar, mest använda krav, avsteg per kravområde eller prioritet i
kravunderlag.

- `en`: Requirement application statistics

_Avoid_: Tillämpningsspårbarhet när enskild spårbarhet avses.

**Åtgärdslogg**:
Spår av viktiga användar- och systemåtgärder i applikationen, till exempel
ändringar och nekade behörighetsförsök.

- `en`: Action log

_Avoid_: Audit som svensk UI-term, tillämpningsspårbarhet.

**Säkerhetslogg**:
En strukturerad loggström för autentisering, auktorisering, privilegierade
åtgärder och andra säkerhetsrelevanta händelser. Säkerhetslogg är inte samma
sak som åtgärdsloggen och hör hemma i plattformens logg- och SIEM-flöde.

- `en`: Security audit log

_Avoid_: Säkerhetsaudit, säkerhetsrevision när loggströmmen avses,
Åtgärdslogg, vanlig applikationslogg, tillämpningsspårbarhet.

**AI-säkerhet**:
Område för kontroller som skyddar AI-relaterade flöden mot
instruktionsövertagande, läckage av systemnära innehåll, hemligheter och andra
AI-nära säkerhetsrisker.

- `en`: AI security

_Avoid_: AI-assistering när säkerhetskontrollerna avses, MCP-säkerhet när
kontrollerna gäller alla AI-säkerhetsblockeringar.

**AI-säkerhetsregel**:
En regel som bedömer om text i AI-relaterade flöden ska tillåtas eller
blockeras för att skydda instruktioner, hemligheter, uppgifter i bakomliggande
system och andra säkerhetsrelevanta gränser.

- `en`: AI safety rule

_Avoid_: AI-regel när sammanhanget inte tydligt är säkerhet.

**Läckage av systemnära innehåll**:
AI-säkerhetsregeltyp som fångar när utgående modelltext innehåller interna
instruktioner, tokenvärden eller andra tekniska systemmarkörer.

- `en`: System-adjacent content leakage

_Avoid_: Backend-begrepp som svensk UI-term för denna regeltyp.

**AI-säkerhetsregeltyper**:
Använd dessa användarsynliga namn för standardreglerna i Admin Center:
Promptinjektion: instruktionsövertagande, Läckage av systemprompt,
Promptinjektion via kodning och maskering, Känslig informationsutläsning:
hemligheter, Begäran om skadligt innehåll och Läckage av systemnära innehåll.

- `en`: Prompt injection: instruction override, System prompt leakage, Prompt
  injection via encoding and obfuscation, Sensitive information disclosure:
  secrets, Harmful content generation request, System-adjacent content leakage

_Avoid_: äldre namn som bygger på smuggling eller backend som svensk UI-term
för dessa regeltyper.

**Säkerhetsregelriktning**:
Anger om en AI-säkerhetsregel eller ett ord i en AI-säkerhetsregel gäller
inkommande användar- eller systemtext, utgående modelltext eller båda
riktningarna.

- `en`: Safety rule direction

_Avoid_: Riktning utan säkerhetsregelsammanhang.

**HSA-id-prefix**:
Delen före bindestrecket i ett HSA-id. Ett HSA-id-prefix består av två versala
bokstäver för landskod följt av tio siffror för organisationsnummer och skrivs
utan bindestreck.

- `en`: HSA-id prefix

_Avoid_: HSA-prefix, HSA-id-prefix med bindestreck inkluderat.

**HSA-id-suffix**:
Delen efter bindestrecket i ett HSA-id.

- `en`: HSA-id suffix

_Avoid_: HSA-id-prefix, ändelse när den exakta HSA-id-termen behövs.

**Behörighetsöversyn**:
En formell genomgång av uppdrag och roller där varje behörighetsrad bedöms och
beslutas.

- `en`: Access review

_Avoid_: Åtkomstgranskning som huvudterm, granskning av kravversioner.

**Behörighetssammanhang**:
Den resurs eller arbetsyta inom kravhanteringen som en behörighetsprövning
avser, till exempel ett kravområde eller kravunderlag. Behörighetssammanhanget
anger var en användare får utföra en åtgärd, inte en separat roll.

- `en`: Authorization context

_Avoid_: Scope som svensk term, separat behörighet, roll.

**Kravområde**:
En ansvarsbärande domän- eller ämnesindelning i kravbiblioteket. Kravområdet
anger var ett krav hör hemma, vilket krav-ID-prefix som används och vem som
ansvarar för förvaltningen inom området.

- `en`: Requirement area

_Avoid_: Område som fristående UI-term, Area som engelsk UI-term,
styrningsobjektstyp, verksamhetsobjekt, kategori.

**Kategori**:
En övergripande klassning av kravets perspektiv eller intressenttyp, till
exempel verksamhetskrav, IT-krav eller leverantörskrav.

- `en`: Category

_Avoid_: Kravområde, typ.

**Kravkategori**:
Accepterad precisering av kategori när det annars kan vara oklart vilken sorts
kategori som avses.

- `en`: Requirement category

_Avoid_: Separat begrepp från kategori.

**Typ**:
Klassning av om ett krav är funktionellt eller icke-funktionellt.

- `en`: Type

_Avoid_: Kategori, kvalitetsegenskap.

**Kravtyp**:
Accepterad precisering av typ när det annars kan vara oklart vilken sorts typ
som avses.

- `en`: Requirement type

_Avoid_: Separat begrepp från typ.

**Kvalitetsegenskap**:
Den kvalitetsaspekt ett krav bidrar till, till exempel säkerhet,
användbarhet eller prestandaeffektivitet. Begreppet används för att klassificera
krav, särskilt icke-funktionella krav.

- `en`: Quality characteristic

_Avoid_: Icke-funktionellt krav.

**Prioritet**:
En bedömning av hur viktigt, angeläget eller kritiskt ett krav är i förhållande
till verksamhetens mål, nyttor, risker och intressenters behov. Prioritet anges
med den fasta prioritetsskalan P1-P5.

- `en`: Priority

_Avoid_: Risknivå som fältnamn, fullständig riskanalys, sannolikhet.

**Acceptanskriterium**:
Ett objektivt villkor som måste vara uppfyllt för att en kravversion ska kunna
bedömas som uppnådd.

- `en`: Acceptance criterion

_Avoid_: Verifieringsmetod, testfall.

**Verifierbar**:
En egenskap hos en kravversion som innebär att det finns objektiva villkor som
kan kontrolleras.

- `en`: Verifiable

_Avoid_: Testad, godkänd.

**Verifieringsmetod**:
Det sätt som används för att kontrollera om acceptanskriterierna är uppfyllda,
till exempel test, demonstration, analys eller inspektion.

- `en`: Verification method

_Avoid_: Acceptanskriterium.

**Normreferens**:
En styrande extern eller intern normkälla som ett krav härleds från eller måste
uppfylla, till exempel lag, föreskrift, standard eller riktlinje.

- `en`: Norm reference

_Avoid_: Vanlig referens, länk.

**Normbibliotek**:
Den förvaltade samlingen av normreferenser som kan kopplas till krav.
Normbibliotek avser ytan eller samlingen, inte den enskilda normreferensen.

- `en`: Norm library

_Avoid_: Referensdata, normreferens när en enskild normkälla avses.

**Referens**:
Stödjande material eller hänvisning som kan hjälpa läsaren att förstå ett krav
men som inte nödvändigtvis är normerande.

- `en`: Reference

_Avoid_: Normreferens när källan är styrande.

**Referensdata**:
Administrerade uppslag, klassningar och statuskataloger som stödjer krav och
kravunderlag. Referensdata är samlingsbegreppet som omfattar både taxonomi
samt statusar och arbetsflöden.

- `en`: Reference data

_Avoid_: Taxonomi när statuskataloger eller arbetsflödesstatusar avses,
kravdata, kravpaket eller normbibliotek när innehållsförvaltning av
kravbiblioteket avses.

**Taxonomi**:
En kontrollerad klassningsstruktur som används för att sortera, gruppera,
filtrera och analysera krav eller kravunderlag.

- `en`: Taxonomy

_Avoid_: Referensdata när även statuskataloger avses, statusar och
arbetsflöden.

**Statusar och arbetsflöden**:
Samlingsnamn för statuskataloger som beskriver livscykler, arbetsflödessteg
eller användning av krav och kravunderlag.

- `en`: Statuses and workflows

_Avoid_: Taxonomi, kravstatus som övergripande term.

**AI-assisterat författande**:
Ett stödflöde där en användare får förslag till krav baserat på ämne,
instruktioner, bilder och referensdata. Förslagen blir krav först när de
hanteras i ordinarie kravprocess.

- `en`: AI-assisted authoring

_Avoid_: AI-generering som huvudterm, AI-assistering, automatisk publicering,
AI-beslut, källa till sanning.

**AI-anrop**:
En förfrågan från applikationen till en AI-leverantör. I AI-assisterat
författande består AI-anropet av styrande instruktioner, användarens behov och
ett tvingande svarsformat.

- `en`: AI request

_Avoid_: Prompt när hela anropet avses, AI-instruktion när bara
författarinstruktionen avses.

**AI-analys**:
Analys- eller resonemangstext som en AI-leverantör returnerar tillsammans med
förslag i AI-assisterat författande. AI-analysen är stödjande kontext för
användarens granskning och är inte en fullständig eller auktoritativ
resonemangskedja.

- `en`: AI analysis

_Avoid_: Resonemangskedja, fullständig tankekedja, beslutsmotivering,
granskningsprotokoll.

**Råresultat**:
Systemnära output från AI-assisterat författande eller kravbiblioteksimport som
visas för insyn och felsökning. Råresultatet kan göras läsbart, men är inte
kravdata som användaren granskar som krav.

- `en`: Raw result

_Avoid_: Resultat när kravkandidater eller föreslagna normreferenser avses,
Import-JSON som användarnära huvudterm.

**Kravbiblioteksimport**:
Ett stödflöde där flera kravtexter och eventuell metadata förbereds utanför
applikationen och sedan förs in som krav i kravbibliotekets ordinarie
kravprocess.

- `en`: Requirements library import

_Avoid_: Kravunderlagsimport, automatisk publicering, datamigrering när
ordinarie användargranskning avses.

**Kravunderlagsimport**:
Ett stödflöde där flera kravtexter och eventuell metadata förbereds utanför
applikationen och sedan förs in som kravunderlagslokala krav i ett
kravunderlag.

- `en`: Requirements specification import

_Avoid_: Kravbiblioteksimport, kravtillämpning, import till kravområde.

**Kravimportfil**:
En JSON-fil som innehåller kravkandidater och eventuell stöddata för
kravimport, till exempel föreslagna normreferenser. Kravimportfilen anger inte
var kraven ska sparas; destinationen väljs i importflödet.

- `en`: Requirement import file

_Avoid_: Kravbiblioteksimport när filformatet avses, kravunderlagsimport när
filformatet avses, datamigrering.

**Importinstruktion**:
Vägledning för att ta fram en kravimportfil. Importinstruktionen beskriver
regler, fältval och stödjande sammanhang för import-JSON, men JSON Schema är
det styrande filformatskontraktet.

- `en`: Import instruction

_Avoid_: AI-prompt när importvägledningen avses, schema när strikt JSON Schema
avses.

**Terminologi**:
De verksamhetsbegrepp och användargränssnittstermer som används för att
beskriva kravhanteringen. Terminologi förvaltas genom detta sammanhang,
arkitekturbeslut och språkfiler.

- `en`: Terminology

_Avoid_: Benämningar som huvudterm.

**Benämningar**:
Äldre term för terminologi i användargränssnittet.

- `en`: Labels

_Avoid_: Huvudterm i UI och dokumentation.

**Kravområdesägare**:
Den person, identifierad med HSA-id, som har huvudansvar för förvaltning av ett
kravområde och dess krav i kravbiblioteket. Kravområdesägare administreras på
kravområdet, inte som en egen katalog.

- `en`: Requirement area owner

_Avoid_: Områdesägare utanför tydligt kravområdessammanhang.

**Kravområdesmedförfattare**:
En person som stödjer kravområdesägaren i framtagning och underhåll av krav
inom ett kravområde.

- `en`: Requirement area co-author

_Avoid_: Medförfattare när sammanhanget inte visar kravområde.

**Kravunderlagsmedförfattare**:
En person som stödjer arbetet med ett kravunderlag och dess
kravunderlagslokala innehåll.

- `en`: Specification co-author

_Avoid_: Medförfattare när sammanhanget inte visar kravunderlag.

**Medförfattare**:
Accepterad kortform för kravområdesmedförfattare,
kravpaketsmedförfattare eller kravunderlagsmedförfattare när sammanhanget
tydligt visar vilket behörighetssammanhang som avses.

- `en`: Co-author

_Avoid_: Medförfattare när behörighetssammanhanget är oklart.

**Kravgranskare**:
En global roll som oberoende bedömer kravversioner och avsteg inför
publicering, återremiss eller beslut.

- `en`: Reviewer

_Avoid_: Granskare som huvudterm när begreppet kan förväxlas med en tilldelad
granskningsperson, kravområdesgranskare om rollen inte är områdesbunden.

**Tilldelad granskningsperson**:
En person som har tilldelats att granska ett specifikt ärende eller underlag,
till exempel inom behörighetsöversyn, dataskydd eller gallring. Begreppet
beskriver uppdraget i ärendet, inte en global IdP-roll.

- `en`: Assigned reviewer

_Avoid_: Kravgranskare när ett ärende- eller underlagsbundet uppdrag avses,
Granskare som huvudterm.

**Administratör**:
Ett systemövergripande behörighetsmandat med full rätt att utföra åtgärder i
systemet. Administratören blir inte verksamhetsansvarig ägare för innehållet
bara genom rollen.

- `en`: Administrator

_Avoid_: Kravområdesägare, kravunderlagsansvarig.

**Dataskyddshandläggare**:
En roll som hanterar dataskyddsärenden kopplade till personuppgifter, till
exempel förhandsgranskning, export och radering.

- `en`: Privacy officer

_Avoid_: Administratör när dataskyddsmandat avses.

**Radering av personuppgifter**:
Ett dataskyddsflöde där personkopplade fält för en registrerad HSA-id hanteras
genom att raderas, anonymiseras, hoppas över eller bytas till en ersättare.
Radering av personuppgifter ska inte ta bort verksamhetshistorik som behöver
finnas kvar.

- `en`: Personal data erasure

_Avoid_: GDPR-radering, gallring, arkivering, borttagning av kravhistorik.

**Personuppgiftsutdrag**:
Ett dataskyddsunderlag som visar vilka personuppgifter Kravhantering kan
koppla till en registrerad HSA-id, var uppgifterna förekommer i applikationen
och vilka begränsningar utdraget har. JSON är det maskinläsbara och
auktoritativa formatet; PDF är en läsbar återgivning av samma uppgifter.

- `en`: Data subject access export

_Avoid_: Export för dataportabilitet, dataportabilitetsexport, arkivexport,
rapport, export av åtgärdslogg.

**Kravkatalog**:
Ett accepterat vardagligt eller äldre ord för kravbiblioteket. Begreppet får
förekomma när människor talar om samma samling, men bör inte vara den primära
benämningen i gränssnittet.

- `en`: Requirements Catalog

_Avoid_: Separat katalog om samma kravbibliotek avses.

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
kravunderlagsansvarig. Det kopplas inte till kravpaket, eftersom kravpaket är
en gruppering av krav i kravbiblioteket.

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
upphandling, införande, utveckling eller förvaltning.

- `en`: Specification lifecycle status

_Avoid_: Kravversionsstatus, genomförandeform.

**Kravpaket**:
En återanvändbar gruppering av krav i kravbiblioteket för ett visst
användningsområde, scenario eller leveransbehov. Ett kravpaket samlar krav,
inte flera kravversioner av samma krav, och har ett syfte och en avgränsning
som styr vilka krav som hör hemma i paketet. Kravpaket gäller krav i
kravbiblioteket, inte kravunderlagslokala krav. När ett krav har ett nyare
utkast är paketets krav fortfarande den publicerade kravversion som får
användas. När en ny kravversion publiceras följer kravpaketets aktuella
medlemskap den nya publicerade kravversionen och ersätter den arkiverade
föregångaren i alla kravpaket där kravet används. När ett krav arkiveras utan
efterträdare kan paketkopplingen finnas kvar som historik, men den arkiverade
kravversionen ingår inte i praktiska kravpaketsurval där bara publicerade krav
får användas. Kravbibliotekets kravpaketsfilter är däremot ett sökfilter över
valda kravstatusar och kan visa arkiverade krav när användaren själv inkluderar
arkiverad status.

- `en`: Requirements package

_Avoid_: Kravunderlag, referensdata, historik över kravversioner.

**Kravpaketsansvarig**:
Den person eller funktion som har huvudansvar för ett kravpakets syfte,
sammanhållning och relevans över kravområden.

- `en`: Requirements package lead

_Avoid_: Kravområdesägare, kravunderlagsansvarig.

**Kravpaketsmedförfattare**:
En person som stödjer kravpaketsansvarig i framtagning och underhåll av ett
kravpaket.

- `en`: Requirements package co-author

_Avoid_: Medförfattare när sammanhanget inte visar kravpaket.

**Kravunderlagsansvarig**:
Den person eller funktion som har huvudansvar för ett kravunderlags
sammansättning, kravtillämpningar, kravunderlagslokala krav och avsteg.

- `en`: Specification lead

_Avoid_: Kravunderlagsägare.

**Kravansvarsperson**:
En HSA-id-identifierad person vars namnkomponenter och e-postadress, när sådan
finns, används för att visa vem en aktuell eller påbörjad
kravansvarstilldelning avser.
Kravansvarsperson är inte samma sak som användare, konto, global roll eller
HSA-personpost.

- `en`: Requirement responsibility person

_Avoid_: Användare, konto, HSA-personpost, kravansvarstilldelning.

**Kravansvarsperson utan kravansvarstilldelning**:
En lokal kravansvarsperson som inte pekas ut av någon aktuell eller påbörjad
kravansvarstilldelning. Personen kan åter bli utpekad av en ny
kravansvarstilldelning innan gallring, eller raderas när beslutad lagringstid
har passerat.

- `en`: Unassigned requirement responsibility person

_Avoid_: Fristående Kravansvarsperson, fristående ägare, ej tilldelad person,
oanvänd person, kravområdesägare när personen inte har en aktuell eller
påbörjad kravansvarstilldelning.

**Kravansvarstilldelning**:
En HSA-id-bunden tilldelning av ansvar eller medförfattarskap i kravarbete,
till exempel för ett kravområde, ett kravunderlag eller ett kravpaket.
Tilldelningen pekar ut en kravansvarsperson men beskriver själva
ansvarskopplingen, inte personposten, organisatoriskt mandat, global roll eller
konto.

- `en`: Requirement responsibility assignment

_Avoid_: Verksamhetsmandat, behörighetsmandat, användare, konto,
HSA-personpost.

**HSA-katalog**:
En regional källa till hälso- och sjukvårdens adressregister med
kvalitetsgranskade uppgifter om organisationer och personer inom vård och
omsorg.

- `en`: HSA directory

_Avoid_: Medarbetarkatalog, användarkatalog, applikationsägd referensdata.

**HSA-personpost**:
En personpost i HSA-katalogen med person- och kontaktuppgifter som kan slås upp
med HSA-id eller annan identitet som HSA-katalogen stödjer.

- `en`: HSA person record

_Avoid_: Användare, konto, lokal personpost.

**Skyddade personuppgifter**:
Skatteverkets samlingsbegrepp för skyddsåtgärder i folkbokföringen när en
person riskerar att utsättas för brott, förföljelse eller allvarliga
trakasserier. Begreppet ska användas när Kravhantering beskriver
personuppgifter med skyddsbehov, inte lokala ord som skyddad identitet.
Källa: <https://www.skatteverket.se/privat/folkbokforing/skyddadepersonuppgifter.4.18e1b10334ebe8bc80001711.html>

- `en`: Protected personal data

_Avoid_: Skyddad identitet, sekretessperson, hemlig person.

**HSA-personpost med skyddade personuppgifter**:
En HSA-personpost där HSA anger att personposten har skyddade
personuppgifter, i Kravhantering transporterat och lagrat som
`hasProtectedPersonalData`. Fältet beskriver bara uppgiftens HSA-status; det
bestämmer inte i sig UI-maskering, behörighet eller särskild handläggning.

- `en`: HSA person record with protected personal data

_Avoid_: Skyddad Kravansvarsperson, skyddad användare.

**Kravurvalsfråga**:
En fråga som förvaltas inom ett kravområde och stödjer urval av publicerade
bibliotekskrav till ett kravunderlag genom ett eller flera förberedda svar.

- `en`: Requirement selection question

_Avoid_: Kravpaket, referensdata, fråga utan kravurvalssammanhang, fråga med
härlett ägarskap från kopplade krav.

**Kravurvalsfråge-ID**:
Den stabila identifieraren för en kravurvalsfråga, sammansatt av kravområdets
prefix och en markör för kravurvalsfrågor.

- `en`: Requirement selection question ID

_Avoid_: Krav-ID, databas-ID, radnummer.

**Kravurvalssvar**:
Ett förberett svarsalternativ i en kravurvalsfråga som kan peka ut relevanta
kravpaket, krav eller inget kravurval alls.

- `en`: Requirement selection answer

_Avoid_: Användarens svar, kravpaket.

**Utan kravurval**:
En egenskap hos ett kravurvalssvar som markerar att svaret avsiktligt inte
bidrar med krav till kravurvalsfilter.

- `en`: No requirement selection

_Avoid_: Saknar kravurval när kopplingar har tappats eller behöver åtgärdas.

**Saknar kravurval**:
Ett hälsoläge för ett kravurvalssvar som saknar kravkopplingar utan att vara
markerat som utan kravurval.

- `en`: Missing requirement selection

_Avoid_: Utan kravurval när avsiktligt nollbidrag avses.

**Kravurvalsfilter**:
Ett användaraktiverat styrt grundurval av bibliotekskrav som bildas av valda
kravurvalssvar inför att krav läggs till i ett kravunderlag. Valda
kravurvalssvar kan bevaras som urvalskontext utan att kravurvalsfilter är
aktivt.

- `en`: Requirement selection filter

_Avoid_: Vanligt tabellfilter, kravpaket, sparade kravurvalssvar när de bara
dokumenterar urvalskontext.

**Synlighetsvillkor**:
Ett villkor som avgör när en kravurvalsfråga hör till det aktuella
frågesammanhanget i ett kravunderlag, baserat på valda kravurvalssvar i
överliggande kravurvalsfrågor.

- `en`: Visibility condition

_Avoid_: Kravurvalsfilter, obligatoriskt krav, vanligt tabellfilter.

**Villkorsgrupp**:
En samling synlighetsvillkor där alla ingående överliggande frågor måste vara
uppfyllda för att gruppen ska göra en underordnad kravurvalsfråga synlig. Om
en kravurvalsfråga har flera villkorsgrupper räcker det att en grupp är
uppfylld.

- `en`: Condition group

_Avoid_: Kravpaket, svarsalternativ, kravurvalsfilter.

**Fristående kravurvalsfråga**:
En kravurvalsfråga som varken styrs av synlighetsvillkor eller används som
överliggande kravurvalsfråga i synlighetsvillkor.

- `en`: Standalone requirement selection question

_Avoid_: Rotfråga, huvudfråga, huvudkravurvalsfråga, toppfråga i
kravurvalsfrågehierarki.

**Överliggande kravurvalsfråga**:
En kravurvalsfråga vars valda svar kan göra en annan kravurvalsfråga synlig.

- `en`: Parent requirement selection question

_Avoid_: Överordnat krav, kravområde.

**Underordnad kravurvalsfråga**:
En kravurvalsfråga som bara hör till frågesammanhanget när dess
synlighetsvillkor är uppfyllda.

- `en`: Child requirement selection question

_Avoid_: Obligatorisk fråga, kravpaket.

**Kravurvalsfrågehierarki**:
En sammanhängande struktur av kravurvalsfrågor där överliggande
kravurvalsfrågor och underordnade kravurvalsfrågor hänger ihop genom
synlighetsvillkor.

- `en`: Requirement selection question hierarchy

_Avoid_: Sorteringsordning, kravområdesgrupp, kravhierarki.

**RFI-fråga**:
En områdesägd fråga som används i en Request for Information inför
kravarbete. RFI-frågan hjälper kravunderlagsansvariga att förstå vad som bör
beaktas när krav väljs eller formuleras, men väljer inte krav automatiskt.
RFI-frågor är fristående från varandra och har ingen inbördes
verksamhetsordning.

- `en`: RFI question

_Avoid_: Kravurvalsfråga, leverantörssvar, krav, prioriterad RFI-fråga.

**RFI-frågeversion**:
En bestämd version av en RFI-frågas frågetext, hjälptext, önskade
svarsformat och rådgivande länkar.

- `en`: RFI question version

_Avoid_: Kravversion, historikrad, kopia.

**Historisk RFI-frågeversion**:
En RFI-frågeversion som inte längre är den version som RFI-frågan använder
framåt, men som kan bevaras för kravunderlagshistorik, spårbarhet eller
gallringsprövning.

- `en`: Historical RFI question version

_Avoid_: Inaktiv version, gammal version.

**RFI-frågelista**:
Kravunderlagets lista av RFI-frågor.

- `en`: RFI question list

_Avoid_: Kravurval, kravlista, leverantörssvar.

**Ingår i RFI**:
Markering som anger att en RFI-fråga i ett kravunderlags RFI-frågelista ska
ingå i RFI:n. Markeringen beskriver RFI-listans omfattning, inte frågans
relevans efter genomförd RFI.

- `en`: Included in RFI

_Avoid_: Med i RFI, RFI-relevans.

**RFI-relevans**:
Efter genomförd RFI markerar kravunderlagsansvarig om en inkluderad RFI-fråga
är relevant eller inte relevant för fortsatt kravurval. Relevans är separat
från Ingår i RFI, som anger om frågan över huvud taget ingår i RFI-listan.

- `en`: RFI relevance

_Avoid_: Kravstatus, kravurvalsfilter, leverantörssvar.

**RFI-frågeförslag**:
Ett förslag om ny eller ändrad RFI-fråga riktat till ett kravområde, ofta
skapat från ett kravunderlag. Förslaget kan gälla en specifik befintlig
RFI-fråga eller vara riktat till kravområdet utan specifik RFI-fråga.
När RFI-frågeförslag visas i ett kravunderlag avses förslag skapade från just
det kravunderlaget. Ett obehandlat RFI-frågeförslag saknar resolution, även om
det är begärt för granskning. Förslaget är separat från kravbundna
förbättringsförslag.

- `en`: RFI question suggestion

_Avoid_: Förbättringsförslag, avsteg, kravunderlagskommentar.

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
Det underlagsspecifika livscykelläget för ett krav inom ett kravunderlag,
oavsett om kravet är en kravtillämpning eller ett kravunderlagslokalt krav. Det
beskriver till exempel om kravet är inkluderat, pågående, implementerat eller
verifierat inom just den tillämpningen.

- `en`: Usage status

_Avoid_: Kravstatus, kravversionsstatus.

**Avsteg**:
Ett underlagsspecifikt undantag från att följa en kravtillämpning fullt ut.
Avsteget hör till kravtillämpningen i ett kravunderlag och ändrar inte kravet i
kravbiblioteket.

- `en`: Deviation

_Avoid_: Ändring av bibliotekskrav, kravändring.

**Förbättringsförslag**:
Återkoppling om att ett krav i kravbiblioteket kan förbättras, förtydligas
eller ändras framåt. Förbättringsförslag hör till kravbibliotekets förvaltning,
inte till ett enskilt avsteg i ett kravunderlag.

- `en`: Improvement suggestion

_Avoid_: Avsteg, felanmälan, RFI-frågeförslag.

**Granskningsrapport**:
Rapport som stödjer granskning och publiceringsbeslut för en kravversion.

- `en`: Review report

_Avoid_: Avstegsrapport, kombinerad granskningsrapport.

**Kombinerad granskningsrapport**:
Rapport som samlar granskningsunderlag för flera kravversioner i en gemensam
rapport.

- `en`: Combined review report

_Avoid_: Granskningsrapport när flera kravversioner avses tillsammans.

**Avstegsgranskningsrapport**:
Rapport som stödjer granskning och beslut om avsteg i ett kravunderlag.

- `en`: Deviation review report

_Avoid_: Granskningsrapport när avsteg avses.

**Kravlista**:
Rapport som sammanställer krav från kravbiblioteket utan att rapporten är
knuten till ett visst kravunderlag eller upphandlingssyfte.

- `en`: Requirements list

_Avoid_: Kravbilaga för upphandling.

**Kravbilaga för upphandling**:
Rapport som sammanställer krav som ska ingå i ett upphandlingsunderlag.

- `en`: Procurement requirements appendix

_Avoid_: Kravlista när rapportens upphandlingssyfte avses.

**Genomföranderapport**:
Rapport som sammanställer kravstatus, risk och spårbarhet under införande eller
utveckling.

- `en`: Progress report

_Avoid_: Progressrapport, uppföljningsrapport, statusrapport,
förvaltningsrapport.

**Förvaltningsrapport**:
Rapport som sammanställer kvarvarande rest, användningsläge och avstegsläge för
krav i förvaltning.

- `en`: Management report

_Avoid_: Genomföranderapport, avstegsrapport.

**Historikrapport**:
Rapport som visar ett kravs versioner, statusändringar och
metadataförändringar över tid.

- `en`: History report

_Avoid_: Förbättringsförslagshistorik.

**Förbättringsförslagshistorik**:
Rapport eller vy som visar förbättringsförslag, granskning och åtgärder kring
ett krav i kravbiblioteket.

- `en`: Improvement suggestion history

_Avoid_: Historikrapport när kravets egen versionshistorik avses.

**Utkast**:
En kravversion som är under framtagning och ännu inte är redo att godkännas.
Ett raderat utkast betraktas inte som en etablerad kravversion i
verksamhetshistoriken.

- `en`: Draft

_Avoid_: Påbörjat krav, preliminärt krav.

**Granskning**:
En kravversion som är färdig för bedömning men ännu inte publicerad.

- `en`: Review

_Avoid_: Remiss om ingen faktisk remissprocess avses.

**Återremiss**:
Att en kravversion i granskning skickas tillbaka till utkast för omarbetning i
stället för att publiceras.

- `en`: Return to draft

_Avoid_: Avslag när omarbetning snarare än slutligt nej avses.

**Arkiveringsgranskning**:
En särskild granskning där en publicerad kravversion bedöms inför arkivering.
Begreppet beskriver granskningens syfte, inte en separat typ av krav.

- `en`: Archiving review

_Avoid_: Vanlig granskning när syftet är arkivering.

**Publicerad**:
En kravversion som har godkänts och gjorts tillgänglig för användning.

- `en`: Published

_Avoid_: Gällande.

**Arkiverad**:
En kravversion som inte längre ska användas aktivt men bevaras för historik och
spårbarhet.

- `en`: Archived

_Avoid_: Borttagen, raderad.

**Arkiverad kravversion**:
En tidigare kravversion som inte längre används aktivt men finns kvar för
historik och spårbarhet. När en ny kravversion publiceras blir den tidigare
publicerade kravversionen en arkiverad kravversion.

- `en`: Archived requirement version

_Avoid_: Arkiverat krav när kravet har en ny publicerad kravversion.

**Arkiverat krav**:
En vardaglig genväg för ett krav där den sista kravversionen är arkiverad och
ingen ny utkastversion finns. Den precisa modellen är fortfarande att
kravversionen är arkiverad.

- `en`: Archived requirement

_Avoid_: Raderat krav, borttaget krav.

**Gallring**:
Att enligt fastställda regler ta bort information när den inte längre ska
bevaras i den aktiva kravhanteringen. Gallring är inte samma sak som
kravlivscykelns arkivering eller radering av personuppgifter.

- `en`: Retention disposal

_Avoid_: Arkivering, radering av personuppgifter, vanlig radering.

**Arkivexport**:
Ett bevarandeunderlag som tas fram innan information gallras när
verksamhetshistoriken ska finnas kvar utanför den aktiva kravhanteringen.
Arkivexport är inte samma sak som kravlivscykelns arkivering eller
personuppgiftsutdrag.

- `en`: Archive export

_Avoid_: Rapport, vanlig export, personuppgiftsutdrag.

**Återskapad kravversion**:
En ny utkastversion som skapas med innehåll från en tidigare kravversion. Den
tidigare kravversionen ändras inte när den återskapas.

- `en`: Restored requirement version

_Avoid_: Återaktiverad version, återställd version.

**Återskapa version**:
Att skapa en ny utkastversion baserad på en vald tidigare kravversion. Den
tidigare kravversionen ändras inte och blir inte aktiv igen.

- `en`: Restore version

_Avoid_: Återaktivera version, återställa samma version.

**Återaktivera krav**:
En möjlig folkmunsterm när någon menar att en arkiverad kravversion återskapas
som nytt utkast. Använd återskapa som huvudterm.

- `en`: Restore requirement

_Avoid_: Huvudterm i UI eller dokumentation.

### Drift och leverans

**Frånkopplad produktionsmiljö**:
En produktionsmiljö som har intern nätverksanslutning men saknar internetåtkomst
till releasekällor, containerregister eller andra externa artefaktkällor.

- `en`: Disconnected production environment

_Avoid_: Offline miljö, air-gapped miljö när bara extern åtkomst saknas.
