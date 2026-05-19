# Kravhantering

Detta sammanhang beskriver verksamhetsspråket för kravhantering:
hur krav formuleras, granskas, publiceras, används och följs upp.

## Language

### Kärnbegrepp

**Krav**:
En styrande utsaga om något som ska vara uppfyllt. Ett krav har en
egen identitet, klassificering, livscykel, versioner och spårbarhet.
_Avoid_: Kravtext när hela kravet avses.

**Kravtext**:
Den formulerade lydelsen av ett krav i en viss version. Kravtexten är
innehållet som beskriver vad som ska uppfyllas, inte kravet som helhet.
_Avoid_: Krav när bara lydelsen avses.

**Kravversion**:
En bestämd version av ett kravs lydelse och verksamhetsmetadata vid en viss
tidpunkt. Ett krav kan ha flera kravversioner, men varje kravversion hör till
exakt ett krav.
_Avoid_: Historikpost, kopia.

**Krav-ID**:
Den stabila identifieraren för ett krav över alla kravversioner. Ett krav-ID får
aldrig upprepas eller återanvändas; en specifik kravversion anges med krav-ID
och versionsnummer.
_Avoid_: Versions-ID, radnummer.

**Version**:
Ett löpnummer inom ett krav som identifierar en kravversion tillsammans med
kravets krav-ID. Ett versionsnummer kan återanvändas om ett senaste utkast
raderas innan en ny kravversion skapas.
_Avoid_: Krav-ID, globalt versionsnummer.

**Publicerad kravversion**:
Den kravversion som har godkänts och gjorts tillgänglig för användning. Om ett
krav har ett nyare utkast eller en version i granskning är den publicerade
kravversionen fortfarande den version som används tills en ny version
publiceras.
_Avoid_: Gällande kravversion, aktiv version.

**Publicering**:
Beslutet att godkänna en granskad kravversion och göra den till den publicerade
kravversion som får användas i kravunderlag.
_Avoid_: Spara, granska.

**Kravbibliotek**:
Den gemensamma samlingen av krav som förvaltas, versioneras, granskas och
återanvänds över tid. I användargränssnittet ska kravbibliotek vara det
primära namnet på ytan där användaren hittar och arbetar med gemensamma krav.
På engelska används Requirements Library.
_Avoid_: Kravkatalog som primär UI-benämning.

**Kravbiblioteksförvaltning**:
Processen och ansvaret för att hålla kravbiblioteket korrekt, aktuellt,
granskat, publicerat, versionerat, arkiverat och förbättrat över tid.
_Avoid_: Kravbibliotek när processen avses.

**Tillämpningsstyrning**:
Arbetet med att använda kravbiblioteket i ett konkret tillämpningssammanhang,
till exempel genom behov, urval, kravunderlagslokala krav, prioritering,
kravtillämpningar, avsteg och uppföljning.
<!-- cSpell:disable-next-line -->
_Avoid_: Kravstyrning som huvudterm.

**Tillämpningsstyrning för kravarbete**:
Preciserad form av tillämpningsstyrning när sammanhanget inte redan tydligt är
kravhantering.
<!-- cSpell:disable-next-line -->
_Avoid_: Kravstyrning och kravmodellering för tillämpning som vardaglig term.

**Tillämpningsspårbarhet**:
Förmågan att följa varför och hur krav används i kravunderlag genom
kravtillämpningar, behovsreferenser, användningsstatus, avsteg och uppföljning.
Begreppet hör hemma i rapportering och statistik om kravens användning.
_Avoid_: Kravhistorik, teknisk audit.

**Tillämpningsstatistik**:
Sammanställningar som visar hur krav används i kravunderlag, till exempel antal
kravtillämpningar, mest använda krav, avsteg per kravområde eller risknivåer i
kravunderlag.
_Avoid_: Tillämpningsspårbarhet när enskild spårbarhet avses.

**Åtgärdslogg**:
Spår av viktiga användar- och systemåtgärder i applikationen, till exempel
ändringar och nekade behörighetsförsök.
_Avoid_: Audit som svensk UI-term, tillämpningsspårbarhet.

**Åtkomstgranskning**:
En formell genomgång av uppdrag, roller och AI-behörigheter där varje
behörighetsrad bedöms och beslutas.
_Avoid_: Granskning av kravversioner.

**Kravområde**:
En ansvarsbärande domän- eller ämnesindelning i kravbiblioteket. Kravområdet
anger var ett krav hör hemma, vilket krav-ID-prefix som används och vem som
ansvarar för förvaltningen inom området.
_Avoid_: Verksamhetsobjekt, kategori.

**Kategori**:
En övergripande klassning av kravets perspektiv eller intressenttyp, till
exempel verksamhetskrav, IT-krav eller leverantörskrav.
_Avoid_: Kravområde, typ.

**Kravkategori**:
Accepterad precisering av kategori när det annars kan vara oklart vilken sorts
kategori som avses.
_Avoid_: Separat begrepp från kategori.

**Typ**:
Klassning av om ett krav är funktionellt eller icke-funktionellt.
_Avoid_: Kategori, kvalitetsegenskap.

**Kravtyp**:
Accepterad precisering av typ när det annars kan vara oklart vilken sorts typ
som avses.
_Avoid_: Separat begrepp från typ.

**Kvalitetsegenskap**:
Den kvalitetsaspekt ett krav bidrar till, till exempel säkerhet,
användbarhet eller prestandaeffektivitet. Begreppet används för att klassificera
krav, särskilt icke-funktionella krav.
_Avoid_: Icke-funktionellt krav.

**Risknivå**:
En bedömning av påverkan om kravet inte uppfylls. Påverkan tolkas utifrån
kravets kategori, till exempel verksamhetspåverkan, leverantörspåverkan eller
teknisk påverkan.
_Avoid_: Fullständig riskanalys, sannolikhet.

**Acceptanskriterium**:
Ett objektivt villkor som måste vara uppfyllt för att en kravversion ska kunna
bedömas som uppnådd.
_Avoid_: Verifieringsmetod, testfall.

**Verifierbar**:
En egenskap hos en kravversion som innebär att det finns objektiva villkor som
kan kontrolleras.
_Avoid_: Testad, godkänd.

**Verifieringsmetod**:
Det sätt som används för att kontrollera om acceptanskriterierna är uppfyllda,
till exempel test, demonstration, analys eller inspektion.
_Avoid_: Acceptanskriterium.

**Normreferens**:
En styrande extern eller intern normkälla som ett krav härleds från eller måste
uppfylla, till exempel lag, föreskrift, standard eller riktlinje.
_Avoid_: Vanlig referens, länk.

**Referens**:
Stödjande material eller hänvisning som kan hjälpa läsaren att förstå ett krav
men som inte nödvändigtvis är normerande.
_Avoid_: Normreferens när källan är styrande.

**Referensdata**:
Administrerade listor och klassningar som stödjer krav och kravunderlag, till
exempel kravområden, kategorier, typer, kvalitetsegenskaper, risknivåer,
kravpaket och normreferenser. Termen används tills vidare som samlingsnamn.
_Avoid_: Kravdata.

**Terminologi**:
De verksamhetsbegrepp och användargränssnittstermer som används för att
beskriva kravhanteringen. I administrationen ska terminologi vara namnet på
ytan där konfigurerbara ord hanteras.
_Avoid_: Benämningar som huvudterm.

**Benämningar**:
Äldre term för terminologi i användargränssnittet.
_Avoid_: Huvudterm i UI och dokumentation.

**Kravområdesägare**:
Den person eller funktion som har huvudansvar för förvaltning av ett
kravområde och dess krav i kravbiblioteket.
_Avoid_: Områdesägare utanför tydligt kravområdessammanhang.

**Kravområdesmedförfattare**:
En person som stödjer kravområdesägaren i framtagning och underhåll av krav
inom ett kravområde.
_Avoid_: Medförfattare när sammanhanget inte visar kravområde.

**Kravunderlagsmedförfattare**:
En person som stödjer arbetet med ett kravunderlag och dess
kravunderlagslokala innehåll.
_Avoid_: Medförfattare när sammanhanget inte visar kravunderlag.

**Medförfattare**:
Accepterad kortform för kravområdesmedförfattare eller
kravunderlagsmedförfattare när sammanhanget tydligt visar vilket scope som
avses.
_Avoid_: Medförfattare i sammanhang där scope är oklart.

**Granskare**:
En global roll som oberoende bedömer kravversioner och avsteg inför
publicering, återremiss eller beslut.
_Avoid_: Kravområdesgranskare om rollen inte är områdesbunden.

**Administratör**:
Ett systemövergripande administrationsmandat för referensdata, terminologi,
kolumner, tilldelningar och systeminställningar. Administratören äger inte
automatiskt kravens innehåll.
_Avoid_: Kravområdesägare, kravunderlagsansvarig.

**Dataskyddshandläggare**:
En roll som hanterar dataskyddsärenden kopplade till personuppgifter, till
exempel förhandsgranskning, export och radering.
_Avoid_: Administratör när dataskyddsmandat avses.

**Kravkatalog**:
Ett accepterat vardagligt eller äldre ord för kravbiblioteket. Begreppet får
förekomma när människor talar om samma samling, men bör inte vara den primära
benämningen i gränssnittet. På engelska är Requirements Catalog motsvarande
äldre eller tekniska uttryck.
_Avoid_: Separat katalog om samma kravbibliotek avses.

**Bibliotekskrav**:
Ett krav från kravbiblioteket när det används eller jämförs i ett sammanhang
där andra krav inte kommer från kravbiblioteket. I själva kravbiblioteket
räcker termen krav.
_Avoid_: Alla krav i kravbiblioteket när ingen kontrast behövs.

**Kravunderlagslokalt krav**:
Ett krav som bara finns i ett visst kravunderlag. Det är unikt för det
kravunderlaget tills det eventuellt lyfts till kravbiblioteket.
_Avoid_: Lokalt krav utan sammanhang, bibliotekskrav.

**Unikt krav**:
Kort användargränssnittsterm för kravunderlagslokalt krav. Använd den när
utrymmet är begränsat eller när sammanhanget redan tydligt är ett kravunderlag.
_Avoid_: Unikt krav utanför kravunderlagssammanhang.

**Lyfta till kravbiblioteket**:
Att skapa ett nytt krav i utkast i kravbiblioteket med utgångspunkt i ett
kravunderlagslokalt krav. Det kravunderlagslokala kravet ligger kvar i sitt
kravunderlag.
_Avoid_: Flytta till kravbiblioteket, publicera direkt till kravbiblioteket.

**Kravunderlag**:
En sammanställd och spårbar samling av bibliotekskrav och eventuella
kravunderlagslokala krav för ett specifikt projekt, upphandling, införande,
förvaltning eller annat användningssammanhang.
_Avoid_: Kravspecifikation som huvudterm.

**Underlagssyfte**:
En beskrivning av varför hela kravunderlaget finns, till exempel förmågan som
ska realiseras eller vad ett IT-stöd som ska upphandlas ska göra.
_Avoid_: Behovsreferens när en enskild kravtillämpning avses.

**Verksamhetsbehovsreferens**:
Äldre eller tekniskt namn för underlagssyfte.
_Avoid_: Behovsreferens när en enskild kravtillämpning avses.

**Verksamhetsobjekt**:
Det objekt, område eller verksamhetssammanhang som ett kravunderlag hör till.
Verksamhetsobjekt klassificerar kravunderlagets användningssammanhang, inte
krav i kravbiblioteket.
_Avoid_: Kravområde.

**Genomförandeform**:
En klassning av hur kravunderlaget ska omsättas, till exempel genom
upphandling, inköp eller utveckling.
_Avoid_: Livscykelstatus, förvaltning.

**Kravunderlagets livscykelstatus**:
Status som beskriver var kravunderlaget befinner sig i processen, till exempel
upphandling, utveckling/införande eller förvaltning.
_Avoid_: Kravversionsstatus, genomförandeform.

**Kravpaket**:
En återanvändbar gruppering av krav i kravbiblioteket för ett visst
användningsområde, scenario eller leveransbehov.
_Avoid_: Kravunderlag.

**Kravunderlagsansvarig**:
Den person eller funktion som har huvudansvar för ett kravunderlags
sammansättning, kravtillämpningar, kravunderlagslokala krav och avsteg.
_Avoid_: Kravunderlagsägare.

**Kravtillämpning**:
Att en publicerad kravversion från kravbiblioteket används i ett visst
kravunderlag. Kravtillämpningen bär det underlagsspecifika sammanhanget, inte
kravet i kravbiblioteket.
_Avoid_: Kravunderlagsrad, kopia av krav.

**Behovsreferens**:
En underlagsspecifik hänvisning som förklarar varför en kravtillämpning behövs
i kravunderlaget. Behovsreferensen ger också sammanhang när kravtillämpningen
ska verifieras.
_Avoid_: Normreferens.

**Användningsstatus**:
Det underlagsspecifika läget för en kravtillämpning i ett kravunderlag. Det
beskriver hur kravet används eller följs upp i just det sammanhanget.
_Avoid_: Kravstatus, kravversionsstatus.

**Avsteg**:
Ett underlagsspecifikt undantag från att följa en kravtillämpning fullt ut.
Avsteget hör till kravtillämpningen i ett kravunderlag och ändrar inte kravet i
kravbiblioteket.
_Avoid_: Ändring av bibliotekskrav, kravändring.

**Förbättringsförslag**:
Återkoppling om att ett krav i kravbiblioteket kan förbättras, förtydligas
eller ändras framåt. Förbättringsförslag hör till kravbibliotekets förvaltning,
inte till ett enskilt avsteg i ett kravunderlag.
_Avoid_: Avsteg, felanmälan.

**Granskningsrapport**:
Rapport som stödjer granskning och publiceringsbeslut för en eller flera
kravversioner.
_Avoid_: Avstegsrapport.

**Avstegsgranskningsrapport**:
Rapport som stödjer granskning och beslut om avsteg i ett kravunderlag.
_Avoid_: Granskningsrapport när avsteg avses.

**Historikrapport**:
Rapport som visar ett kravs versioner, statusändringar och
metadataförändringar över tid.
_Avoid_: Förbättringsförslagshistorik.

**Förbättringsförslagshistorik**:
Rapport eller vy som visar förbättringsförslag, granskning och åtgärder kring
ett krav i kravbiblioteket.
_Avoid_: Historikrapport när kravets egen versionshistorik avses.

**Utkast**:
En kravversion som är under framtagning och ännu inte är redo att godkännas.
Ett raderat utkast betraktas inte som en etablerad kravversion i
verksamhetshistoriken.
_Avoid_: Påbörjat krav, preliminärt krav.

**Granskning**:
En kravversion som är färdig för bedömning men ännu inte publicerad.
_Avoid_: Remiss om ingen faktisk remissprocess avses.

**Återremiss**:
Att en kravversion i granskning skickas tillbaka till utkast för omarbetning i
stället för att publiceras.
_Avoid_: Avslag när omarbetning snarare än slutligt nej avses.

**Arkiveringsgranskning**:
En särskild granskning där en publicerad kravversion bedöms inför arkivering.
Begreppet beskriver granskningens syfte, inte en separat typ av krav.
_Avoid_: Vanlig granskning när syftet är arkivering.

**Publicerad**:
En kravversion som har godkänts och gjorts tillgänglig för användning.
_Avoid_: Gällande.

**Arkiverad**:
En kravversion som inte längre ska användas aktivt men bevaras för historik och
spårbarhet.
_Avoid_: Borttagen, raderad.

**Arkiverad kravversion**:
En tidigare kravversion som inte längre används aktivt men finns kvar för
historik och spårbarhet. När en ny kravversion publiceras blir den tidigare
publicerade kravversionen en arkiverad kravversion.
_Avoid_: Arkiverat krav när kravet har en ny publicerad kravversion.

**Arkiverat krav**:
En vardaglig genväg för ett krav där den sista kravversionen är arkiverad och
ingen ny utkastversion finns. Den precisa modellen är fortfarande att
kravversionen är arkiverad.
_Avoid_: Raderat krav, borttaget krav.

**Återskapad kravversion**:
En ny utkastversion som skapas med innehåll från en tidigare kravversion. Den
tidigare kravversionen ändras inte när den återskapas.
_Avoid_: Återaktiverad version, återställd version.

**Återskapa version**:
Att skapa en ny utkastversion baserad på en vald tidigare kravversion. Den
tidigare kravversionen ändras inte och blir inte aktiv igen.
_Avoid_: Återaktivera version, återställa samma version.

**Återaktivera krav**:
En möjlig folkmunsterm när någon menar att en arkiverad kravversion återskapas
som nytt utkast. Använd återskapa som huvudterm.
_Avoid_: Huvudterm i UI eller dokumentation.

## Flagged Ambiguities

**Krav vs kravtext**:
Säg att en kravversion publiceras, granskas eller arkiveras. Säg att
kravtexten ändras när lydelsen ändras i en version.

**Publicerad kravversion vs gällande kravversion**:
Använd publicerad kravversion för den version som är godkänd och används.
Undvik gällande kravversion som huvudterm eftersom det kan tolkas som juridisk
eller datumstyrd giltighet.

**Publicering vs publicerad**:
Publicering är beslutshändelsen. Publicerad beskriver statusen på en
kravversion efter publicering.

**Krav-ID vs kravversion**:
Krav-ID identifierar kravet som helhet och återanvänds aldrig för ett annat
krav. En specifik kravversion identifieras med krav-ID och versionsnummer.

**Version som löpnummer**:
Version är ett löpnummer inom ett krav. Till skillnad från krav-ID kan ett
versionsnummer återanvändas när ett senaste utkast raderas och ett nytt utkast
senare skapas.

**Raderat utkast vs verksamhetshistorik**:
Ett raderat utkast räknas inte som en etablerad kravversion i
verksamhetshistoriken. Därför kan dess versionsnummer återanvändas.

**Återskapa version vs återaktivera version**:
Återskapa version skapar en ny utkastversion från en tidigare kravversion.
Återaktivera version antyder felaktigt att den gamla versionen blir aktiv igen.

**Återskapa vs återaktivera krav**:
Använd återskapa som vardagligt och precist huvudord. Återaktivera krav kan
förekomma i folkmun men bör inte vara huvudterm i UI eller dokumentation.

**Återremiss vs tillbaka till utkast**:
Återremiss är det precisa verksamhetsbegreppet. Flytta tillbaka till utkast är
en accepterad vardaglig fras för samma händelse.

**Kravstatus vs kravversionsstatus**:
Livscykelorden Utkast, Granskning, Publicerad och Arkiverad beskriver i första
hand en kravversion. Säg hellre att kravet har en publicerad kravversion än att
kravet i sig är publicerat när flera versioner kan finnas parallellt.

**Arkiverad kravversion vs arkiverat krav**:
Använd arkiverad kravversion när precision behövs. Arkiverat krav är en
accepterad vardaglig genväg när den sista kravversionen är arkiverad och ingen
ny utkastversion finns.

**Autoarkiverad kravversion**:
När en ny kravversion publiceras blir den tidigare publicerade kravversionen en
arkiverad kravversion. Det innebär inte att kravet som helhet är arkiverat.

**Kravbibliotek vs kravkatalog**:
Använd kravbibliotek och Requirements Library som kanoniska verksamhetsord och
som primära UI-benämningar. Kravkatalog och Requirements Catalog är accepterade
vardagliga, äldre eller tekniska uttryck.

**Kravbiblioteksförvaltning vs tillämpningsstyrning**:
Kravbiblioteksförvaltning håller kravbiblioteket korrekt och aktuellt.
Tillämpningsstyrning använder kravbiblioteket i konkreta kravunderlag och
genomföranden.

**Tillämpningsspårbarhet vs kravhistorik**:
Tillämpningsspårbarhet visar hur krav används i kravunderlag.
Kravhistorik visar hur själva kravet och dess kravversioner har förändrats.

**Tillämpningsspårbarhet vs tillämpningsstatistik**:
Tillämpningsspårbarhet handlar om att följa användningen av krav.
Tillämpningsstatistik sammanställer användningen i rapporter eller nyckeltal.

**Åtgärdslogg vs tillämpningsspårbarhet**:
Åtgärdslogg visar vem eller vad som utförde viktiga åtgärder.
Tillämpningsspårbarhet visar varför och hur krav används i kravunderlag.

**Åtkomstgranskning vs granskning**:
Åtkomstgranskning gäller behörigheter. Granskning gäller kravversioner eller
avsteg beroende på sammanhang.

**Kravområde vs verksamhetsobjekt**:
Kravområde delar in kravbiblioteket och bär ansvar för kravförvaltning.
Verksamhetsobjekt hör till kravunderlagets användningssammanhang.

**Genomförandeform vs livscykelstatus**:
Genomförandeform beskriver hur kravunderlaget ska omsättas, till exempel
upphandlas, köpas in eller utvecklas. Livscykelstatus beskriver var
kravunderlaget befinner sig över tid, till exempel förvaltning.

**Kravunderlagets livscykelstatus vs kravversionsstatus**:
Kravunderlagets livscykelstatus beskriver var kravunderlaget är i processen.
Kravversionsstatus beskriver livscykeln för en kravversion.

**Kravområde vs kategori vs typ**:
Kravområde anger ansvar och domäntillhörighet i kravbiblioteket. Kategori anger
kravets perspektiv eller intressenttyp. Typ anger om kravet är funktionellt
eller icke-funktionellt.

**Kravtyp vs kvalitetsegenskap**:
Kravtyp anger om kravet är funktionellt eller icke-funktionellt.
Kvalitetsegenskap anger vilken kvalitetsaspekt kravet bidrar till.

**Risknivå vs riskanalys**:
Risknivå beskriver bedömd påverkan om ett krav inte uppfylls, tolkad genom
kravets kategori. Den är inte en full riskanalys med sannolikhet och konsekvens.

**Acceptanskriterium vs verifieringsmetod**:
Acceptanskriterier beskriver vad som måste vara uppfyllt. Verifieringsmetod
beskriver hur uppfyllelsen ska kontrolleras.

**Normreferens vs referens**:
Normreferens är styrande eller normerande. Referens är stödjande material utan
att nödvändigtvis vara normerande.

**Terminologi vs benämningar**:
Använd terminologi som huvudterm för verksamhetsspråk och konfigurerbara
UI-termer. Benämningar är ett äldre UI-ord som bör ersättas.

**Behovsreferens vs normreferens**:
Behovsreferens förklarar varför en kravtillämpning behövs i ett kravunderlag.
Normreferens är en styrande källa bakom ett krav i kravbiblioteket.

**Behovsreferens vs verksamhetsbehovsreferens**:
Behovsreferens förklarar varför en enskild kravtillämpning behövs i ett
kravunderlag. Underlagssyfte förklarar vad hela kravunderlaget syftar till.
Verksamhetsbehovsreferens är ett äldre eller tekniskt namn för underlagssyfte.

**Kravområdesägare vs områdesägare**:
Använd kravområdesägare som precist rollnamn. Områdesägare är en kortform som
bara bör användas när sammanhanget redan tydligt är kravområden.

**Kravområdesägare vs kravunderlagsansvarig**:
Kravområdesägare ansvarar för ett kravområde i kravbiblioteket.
Kravunderlagsansvarig ansvarar för ett specifikt kravunderlag.

**Administratör vs innehållsansvar**:
Administratör är ett systemmandat. Innehållsansvar ligger hos
kravområdesägare, kravområdesmedförfattare, kravunderlagsansvarig och
kravunderlagsmedförfattare beroende på scope.

**Dataskyddshandläggare vs administratör**:
Dataskyddshandläggare hanterar dataskyddsärenden för personuppgifter.
Administratör hanterar systeminställningar och referensdata.

**Medförfattare**:
Medförfattare är en kortform vars betydelse bestäms av scope. I kravområde
avses kravområdesmedförfattare; i kravunderlag avses
kravunderlagsmedförfattare.

**Krav vs bibliotekskrav**:
Säg krav inne i kravbiblioteket. Säg bibliotekskrav när ett krav från
kravbiblioteket behöver skiljas från ett krav som bara finns i ett
kravunderlag.

**Bibliotekskrav vs kravunderlagslokalt krav**:
Ett bibliotekskrav i ett kravunderlag är en publicerad kravversion från
kravbiblioteket. Ett kravunderlagslokalt krav finns bara i det specifika
kravunderlaget och kan lyftas till kravbiblioteket som ett nytt krav i utkast.

**Kravpaket vs kravunderlag**:
Kravpaket grupperar krav i kravbiblioteket för återanvändning och filtrering.
Kravunderlag är en konkret samling krav för ett specifikt användningssammanhang.

**Kravtillämpning vs bibliotekskrav**:
Ett bibliotekskrav är kravet från kravbiblioteket. En kravtillämpning är att en
publicerad kravversion används i ett specifikt kravunderlag.

**Användningsstatus vs kravversionsstatus**:
Användningsstatus beskriver en kravtillämpning i ett kravunderlag.
Kravversionsstatus beskriver kravversionens livscykel, till exempel Utkast,
Granskning, Publicerad eller Arkiverad.

**Avsteg vs kravändring**:
Avsteg gäller en kravtillämpning i ett kravunderlag. Om själva kravet behöver
ändras ska kravversionen i kravbiblioteket ändras genom kravets livscykel.

**Avsteg vs förbättringsförslag**:
Avsteg hanterar att en kravtillämpning inte följs i ett visst kravunderlag.
Förbättringsförslag hanterar återkoppling till kravbibliotekets förvaltning.

**Granskningsrapport vs avstegsgranskningsrapport**:
Granskningsrapport stödjer publiceringsbeslut för kravversioner.
Avstegsgranskningsrapport stödjer beslut om avsteg i kravunderlag.

**Historikrapport vs förbättringsförslagshistorik**:
Historikrapport visar kravets versions- och ändringshistorik.
Förbättringsförslagshistorik visar återkoppling och åtgärder kring
förbättringsförslag.

**Kravunderlagslokalt krav vs unikt krav**:
Använd kravunderlagslokalt krav när begreppet behöver förklaras. Använd unikt
krav som kort UI-term när kravunderlagssammanhanget redan är tydligt.

## Example Dialogue

**Verksamhetsexpert**: Kravet är publicerat, men kravtexten behöver förtydligas.

**Utvecklare**: Då ändrar vi inte det publicerade kravet direkt. Vi tar fram en
ny version där kravtexten får den nya lydelsen.

**Verksamhetsexpert**: Vilken version ska kravunderlaget använda under tiden?

**Utvecklare**: Den publicerade kravversionen gäller tills den nya versionen
har granskats och publicerats.

**Verksamhetsexpert**: Kan vi återanvända lydelsen från den arkiverade
kravversionen?

**Utvecklare**: Ja, vi återskapar kravversionen. Då skapas en ny utkastversion
med samma innehåll, medan den arkiverade kravversionen finns kvar i historiken.

**Verksamhetsexpert**: Så kan vi kalla det ett arkiverat krav i listan?

**Utvecklare**: Ja, om ingen ny utkastversion finns. När vi pratar exakt säger
vi att kravets sista kravversion är arkiverad.

**Verksamhetsexpert**: Är det här kravkatalogen eller kravbiblioteket?

**Utvecklare**: Vi menar samma samling, men i gränssnittet kallar vi den
kravbiblioteket.

**Verksamhetsexpert**: Och på engelska?

**Utvecklare**: Requirements Library i användargränssnittet. Tekniska namn kan
fortfarande använda catalog där de redan är etablerade.

**Verksamhetsexpert**: Är alla krav i kravbiblioteket bibliotekskrav?

**Utvecklare**: Bara när vi behöver skilja dem från krav som inte kommer från
kravbiblioteket. I biblioteket säger vi bara krav.

**Verksamhetsexpert**: Vad händer när ett kravunderlagslokalt krav ska
återanvändas?

**Utvecklare**: En kravområdesägare kan lyfta det till kravbiblioteket. Då
skapas ett nytt krav i utkast där, medan det ursprungliga kravet ligger kvar i
kravunderlaget.

**Verksamhetsexpert**: Är kravet kopierat när vi lägger till det i ett
kravunderlag?

**Utvecklare**: Nej, kravunderlaget skapar en kravtillämpning av den
publicerade kravversionen.

**Verksamhetsexpert**: Om projektet inte kan följa kravet, ändrar vi kravet då?

**Utvecklare**: Nej, då registrerar vi ett avsteg på kravtillämpningen. Kravet i
kravbiblioteket ändras inte.

**Verksamhetsexpert**: Men om kravet är otydligt för alla?

**Utvecklare**: Då skapar vi ett förbättringsförslag till kravbibliotekets
förvaltning.

**Verksamhetsexpert**: Är behovsreferensen samma sak som varför hela
kravunderlaget finns?

**Utvecklare**: Nej. Behovsreferensen hör till kravtillämpningen.
Underlagssyftet beskriver varför hela kravunderlaget finns.

**Verksamhetsexpert**: Kan vi följa vilka krav som används mest och var avsteg
ofta uppstår?

**Utvecklare**: Ja, det hör till tillämpningsspårbarhet och bör synas i
rapportering och statistik.
