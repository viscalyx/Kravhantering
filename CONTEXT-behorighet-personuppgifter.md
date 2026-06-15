# Behörighet och personuppgifter

Detta sammanhang beskriver behörighetssammanhang, HSA-identiteter, dataskydd
och ansvarstilldelningar.

## Language

Primärt ordlistespråk: `sv`

### Begrepp

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
