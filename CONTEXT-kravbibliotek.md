# Kravbibliotek

Detta sammanhang beskriver kravbibliotekets språk för gemensamma krav,
kravversioner, klassificering, förvaltning, granskning och publicering.

## Language

Primärt ordlistespråk: `sv`

### Begrepp

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

**Risknivå**:
En bedömning av påverkan om kravet inte uppfylls. Påverkan tolkas utifrån
kravets kategori, till exempel verksamhetspåverkan, leverantörspåverkan eller
teknisk påverkan.

- `en`: Risk level

_Avoid_: Fullständig riskanalys, sannolikhet.

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

**Kravgranskare**:
En global roll som oberoende bedömer kravversioner och avsteg inför
publicering, återremiss eller beslut.

- `en`: Reviewer

_Avoid_: Granskare som huvudterm när begreppet kan förväxlas med en tilldelad
granskningsperson, kravområdesgranskare om rollen inte är områdesbunden.

**Kravkatalog**:
Ett accepterat vardagligt eller äldre ord för kravbiblioteket. Begreppet får
förekomma när människor talar om samma samling, men bör inte vara den primära
benämningen i gränssnittet.

- `en`: Requirements Catalog

_Avoid_: Separat katalog om samma kravbibliotek avses.

**Kravpaket**:
En återanvändbar gruppering av krav i kravbiblioteket för ett visst
användningsområde, scenario eller leveransbehov.

- `en`: Requirements package

_Avoid_: Kravunderlag, referensdata.

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

**Förbättringsförslag**:
Återkoppling om att ett krav i kravbiblioteket kan förbättras, förtydligas
eller ändras framåt. Förbättringsförslag hör till kravbibliotekets förvaltning,
inte till ett enskilt avsteg i ett kravunderlag.

- `en`: Improvement suggestion

_Avoid_: Avsteg, felanmälan.

**Granskningsrapport**:
Rapport som stödjer granskning och publiceringsbeslut för en eller flera
kravversioner.

- `en`: Review report

_Avoid_: Avstegsrapport.

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
