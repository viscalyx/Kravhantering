# Behörigheter

Den här sidan förklarar vilka roller som ger åtkomst till känsliga delar av
Kravhantering. Den är skriven för personer som använder eller stödjer tjänsten.

För en mer detaljerad katalog över roller och uppdrag, se
[roller-inom-kravhantering.md](../reference/roller-inom-kravhantering.md).

## Roller

Organisationen tilldelar globala IdP-roller till användarkontot. En roll avgör
vilket arbete användaren kan utföra i Kravhantering. Kontakta lokal
administratör eller identitetssupport om du behöver en roll som du inte har.

Att ha ett uppdrag som applikationen äger i Kravhantering, till exempel
kravområdesägare, kravunderlagsansvarig eller tilldelad granskningsperson, är
inte samma sak som att ha en global IdP-roll.

<!-- markdownlint-disable MD013 -->
| Roll | Vad rollen tillåter |
| --- | --- |
| `Admin` | Administratör. Hanterar gemensam administration, identitetsstöd och åtgärdslogg. |
| `PrivacyOfficer` | Dataskyddshandläggare. Arbetar med dataskydd, arkivering och behörighetsöversyn. |
| `Reviewer` | Kravgranskare. Deltar i granskningsarbete utan privilegierade Admin Center-flikar. |
<!-- markdownlint-enable MD013 -->

## Uppdragsbaserade behörigheter

Kravhantering använder också HSA-id-baserade uppdrag som hör till en specifik
resurs. Dessa uppdrag är inte samma sak som globala IdP-roller. De avgör vem
som får ändra ett kravområde, kravpaket eller kravunderlag.

<!-- markdownlint-disable MD013 -->
| Uppdrag | Omfattning | Vad uppdraget styr |
| --- | --- | --- |
| Kravområdesägare | Ett kravområde | Huvudansvar för krav, kravurvalsfrågor och RFI-frågor inom området. |
| Kravområdesmedförfattare | Ett kravområde | Författarstöd för krav, kravurvalsfrågor och RFI-frågor inom området. |
| Kravpaketsansvarig | Ett kravpaket | Huvudansvar för kravpaketets syfte, sammanhållning och relevans. |
| Kravpaketsmedförfattare | Ett kravpaket | Tilldelat författarstöd som ingår i dataskydd och behörighetsöversyn. |
| Kravunderlagsansvarig | Ett kravunderlag | Huvudansvar för kravunderlaget och dess kravunderlagslokala innehåll. |
| Kravunderlagsmedförfattare | Ett kravunderlag | Författarstöd för kravunderlaget och dess kravunderlagslokala innehåll. |
<!-- markdownlint-enable MD013 -->

Uppdragsbaserade ändringar kräver en inloggad mänsklig aktör med verifierat
HSA-id. När ett uppdrag pekar ut en person måste HSA-id:t först verifieras som
en kravansvarsperson. Personuppslaget är inte en allmän sökfunktion; det är
syftesstyrt och kontrolleras mot det uppdrag som användaren försöker ändra.

## HSA-id och kravansvarspersoner

Kravhantering sparar HSA-id som uppdragsbärande identitet för
kravområdesägare, kravområdesmedförfattare, kravpaketsansvariga,
kravpaketsmedförfattare, kravunderlagsansvariga och
kravunderlagsmedförfattare.

Innan ett nytt HSA-id kan sparas i ett sådant uppdrag måste användaren hämta
eller återanvända en lokal kravansvarsperson. HSA-personuppslaget är
behörighetsstyrt per syfte:

- kravområdesägare får verifieras av `Admin` vid skapande av kravområde, eller
  av aktuell kravområdesägare eller `Admin` vid överlämning av ett befintligt
  kravområde
- kravområdesmedförfattare får verifieras av aktuell kravområdesägare eller
  `Admin` för kravområdet
- kravpaketsansvarig och kravpaketsmedförfattare får verifieras av
  kravpaketsansvarig eller `Admin` för ett befintligt kravpaket
- vid skapande av kravpaket får HSA-id verifieras av en användare som får
  skapa kravpaket
- kravunderlagsansvarig och kravunderlagsmedförfattare får verifieras av
  kravunderlagsansvarig eller `Admin` för kravunderlaget
- vid skapande av kravunderlag får den inloggade användaren verifiera sitt
  eget HSA-id som kravunderlagsansvarig

När en inloggad användare senare genomför en godkänd ändring kan
Kravhantering uppdatera användarens egen levande personrad för kravansvar i
bakgrunden från verifierade sessionsfält. Det sker bara om användarens HSA-id
fortfarande är tilldelat någon levande ansvarsyta. Uppdateringen gör inget
nytt HSA-uppslag, påverkar inte inloggningen, stoppar inte den utförda
ändringen om den misslyckas och ändrar inte historiska audit-, beslut- eller
åtgärdssnapshots.

## Kravområden

Kravområden skapas och tas bort av `Admin`. När ett kravområde finns kan
aktuell kravområdesägare, utöver `Admin`, ändra namn, beskrivning, prefix,
kravområdesmedförfattare och lämna över ägarskapet för sitt eget kravområde.
Ett HSA-id för kravområdesägare måste vara verifierat som kravansvarsperson
innan det sparas.

Samma HSA-id får inte samtidigt vara kravområdesägare och
kravområdesmedförfattare för samma kravområde. Om `Admin` eller aktuell
kravområdesägare försöker byta ägare till en person som redan är
medförfattare stoppar tjänsten ändringen.

Kravområdesägare och kravområdesmedförfattare används som
författarbehörighet inom kravområdet. Den behörigheten används bland annat när
ett kravunderlagslokalt krav ska lyftas till kravbiblioteket, när en användare
ska få skapa kravpaket och när RFI-frågor eller RFI-frågeförslag ska hanteras
inom kravområdet.

Kravområdesmedförfattare kan författa innehåll, inklusive RFI-frågor, men kan
inte ändra kravområdets metadata, byta ägare eller hantera
kravområdesmedförfattare. Kravområdets prefix kan bara ändras av `Admin` eller
aktuell kravområdesägare så länge kravområdet saknar kravrader. När ett krav
finns i området returnerar prefixändring `409 conflict`.

## Kravpaket

Kravpaket har både uppdragsstyrning och särskilda Admin-steg.

En användare får skapa kravpaket om användaren är inloggad med verifierat
HSA-id och är kravområdesägare eller kravområdesmedförfattare i minst ett
kravområde. `Admin` får också skapa kravpaket. Den som skapar kravpaketet blir
kravpaketsansvarig.

Kravpaketsansvarig och `Admin` får ändra kravpaketets metadata, byta
kravpaketsansvarig och hantera kravpaketsmedförfattare. En
kravpaketsmedförfattare är ett uppdrag som ägs av appen och visas i dataskydd och
behörighetsöversyn, men ger inte i sig rätt att byta ansvarig eller delegera
kravpaketets uppdrag vidare.

Samma HSA-id får inte samtidigt vara kravpaketsansvarig och
kravpaketsmedförfattare för samma kravpaket.

Arkivering, återaktivering och borttag av kravpaket kräver `Admin`.

## Kravunderlag

Ett kravunderlag styrs av sina egna uppdrag, inte av de kravområden vars krav
används i kravunderlaget.

När ett nytt kravunderlag skapas måste användaren vara inloggad med verifierat
HSA-id. Den inloggade användaren blir kravunderlagsansvarig. Om anropet anger
en annan kravunderlagsansvarig än den inloggade användaren stoppar tjänsten
skapandet.

Kravunderlagsansvarig, kravunderlagsmedförfattare och `Admin` kan ändra
kravunderlagets innehåll. Det omfattar metadata, behovsreferenser,
kravurvalssvar, RFI-frågelistan, tillägg och borttag av publicerade
bibliotekskrav, kravunderlagslokala krav och avsteg.

En kravområdesägare eller kravområdesmedförfattare får inte automatiskt
skrivbehörighet till ett kravunderlag bara för att kravunderlaget använder krav
från området. Om personen ska hjälpa till att ändra ett specifikt kravunderlag
måste kravunderlagsansvarig eller en administratör lägga till personen som
kravunderlagsmedförfattare.

Kravunderlagsmedförfattare kan ändra kravunderlagets innehåll, men inte
delegera behörighet vidare. Bara kravunderlagsansvarig och `Admin` kan ändra
kravunderlagsansvarig eller hantera
kravunderlagsmedförfattare.

Samma HSA-id får inte samtidigt vara kravunderlagsansvarig och
kravunderlagsmedförfattare för samma kravunderlag. Om bytet av ansvarig skulle ge
en sådan dubbel roll stoppar tjänsten ändringen.

`Admin` och `Reviewer` kan lista och läsa alla kravunderlag. Andra inloggade
användare ser bara sina tilldelade kravunderlag, där tilldelningen kommer från
att vara kravunderlagsansvarig eller kravunderlagsmedförfattare. Om användaren
saknar tilldelade kravunderlag visas en tom lista. En direktlänk till ett
befintligt men otillåtet kravunderlag stoppas med 403, medan ett saknat
kravunderlag stoppas med 404.

## Bibliotekskrav i kravunderlag

Användare som kan ändra ett kravunderlag kan lägga till publicerade
bibliotekskrav från vilket kravområde som helst. När ett publicerat
bibliotekskrav läggs till registreras att kravet används i kravunderlaget; det
ändrar inte bibliotekskravet eller kravområdet.

När ett kravunderlagslokalt krav lyfts till kravbiblioteket behöver aktören
behörighet i båda sammanhangen:

- skrivbehörighet i kravunderlaget som källa, som
  kravunderlagsansvarig, kravunderlagsmedförfattare eller `Admin`
- författarbehörighet i målkravområdet, som kravområdesägare,
  kravområdesmedförfattare eller `Admin`

Att vara kravområdesägare eller kravområdesmedförfattare ger inte full
läsbehörighet till varje kravunderlag där områdets krav används. Användning kan
visas genom rapporter, statistik eller tillämpningsspårbarhet utan att hela
kravunderlagets sammanhang exponeras.

## RFI-frågor och RFI-frågelistor

RFI-frågor hör till kravområdet i kravbiblioteksförvaltningen. Att skapa,
redigera, arkivera, återaktivera eller läsa en enskild RFI-frågas
förvaltningsdetaljer kräver författarbehörighet i frågans kravområde, som
kravområdesägare, kravområdesmedförfattare eller `Admin`.

Ett kravunderlags RFI-frågelista hör däremot till kravunderlaget.
Kravunderlagsansvarig, kravunderlagsmedförfattare och `Admin` kan ändra
listans omfattning, låsa eller låsa upp listan och ange RFI-relevans enligt
RFI-listans regler. Läsning och export av RFI-listan följer kravunderlagets
läsbehörighet; en `Reviewer` kan därför läsa RFI-listor i granskningsarbete
men får inte ändra dem enbart genom `Reviewer`-rollen.

RFI-frågeförslag knyter ihop de två behörighetssammanhangen. Ett förslag som
skapas från ett kravunderlag till ett kravområde kräver både skrivbehörighet i
kravunderlaget och författarbehörighet i mottagande kravområde. Förslag som
hanteras i kravbiblioteksförvaltningen kräver författarbehörighet i det
kravområde som förslaget gäller. Kravpaketsansvar eller uppdrag som
kravpaketsmedförfattare ger ingen egen RFI-behörighet.

## Kravbibliotek

Inloggade användare kan läsa publicerade bibliotekskrav och publik taxonomi.
Utkast, granskning, historik och arkiveringsarbete kräver
kravområdesägare, kravområdesmedförfattare, `Reviewer` eller `Admin` beroende
på åtgärd och kravområde.

Kravområdesägare, kravområdesmedförfattare och `Admin` kan författa
kravområdets krav, kravurvalsfrågor och RFI-frågor. Beslut i gransknings- och
arkiveringsflöden kräver däremot `Reviewer`; `Admin` räcker inte ensamt för
sådana beslut. En `Reviewer` får besluta om sitt eget förslag eller avsteg,
men tjänsten loggar detta som en högriskhändelse.

Förbättringsförslag kan skapas och ändras av inloggade användare. Att lösa ett
förslag eller besluta att avvisa det kräver författarbehörighet i kravområdet
eller `Admin`. Egen lösning loggas som högriskhändelse.

API-svaret för kravdetalj innehåller serverberäknade behörigheter för den
aktuella användaren och det aktuella kravet. UI:t använder de besluten för
att visa eller dölja livscykel- och mutationskontroller. Om användaren får
läsa kravet men inte ändra det visas sidan som skrivskyddad med ett kort
meddelande. Det finns ingen separat generell `/api/auth/permissions`-yta för
detta i nuvarande modell.

## Rapporter

Servergenererade PDF-rapporter kontrollerar behörighet innan rapportdata
hämtas. Rapporter från kravlistan i kravbiblioteket är tillgängliga för
vanliga inloggade användare, men PDF-versionen bygger bara på publicerade
kravversioner. Utkast, granskningsversioner och historik exponeras inte genom
list-PDF:en för användare som saknar starkare åtkomst.

Rapporter för historik, granskning, kombinerad granskning och förslagshistorik
kräver åtkomst till kravets historik. Kravunderlagsrapporter kontrollerar
läsåtkomst till kravunderlaget innan kravunderlagets poster hämtas.
Rapportmallarna fattar inga egna behörighetsbeslut; de renderar bara redan
auktoriserad rapportdata.

## AI-assisterat författande

AI-assisterat författande styrs av den generella autentiserings- och
auktoriseringsgränsen och använder samma uppdragsbaserade gräns som
författande i Kravhantering. En användare utan `Admin` måste välja exakt ett
auktoriserat behörighetssammanhang innan tjänsten hämtar modeller, hämtar
kreditinformation eller skickar en prompt till OpenRouter:

- `requirement_area` med ett kravområde där användaren är kravområdesägare
  eller kravområdesmedförfattare
- `specification` med ett kravunderlag där användaren är
  kravunderlagsansvarig eller kravunderlagsmedförfattare

`Admin` får använda AI-assisterat författande utan att ange
behörighetssammanhang. Det finns ingen separat AI-behörighet i nuvarande
modell. Om AI-assisterat författande senare behöver en separat
behörighetsmodell ska den beslutas som en egen policy med egna skäl.
En användare med `Admin` kan också stänga av AI-kravgenerering globalt i
Admin Center. Driftspärren `AI_REQUIREMENT_GENERATION_DISABLED` har högre
prioritet än den sparade Admin Center-inställningen.

## Normbibliotek

Normreferenser har en enklare behörighetsgräns än kravområden, kravpaket och
kravunderlag. En inloggad användare kan skapa en normreferens. Att ändra,
arkivera, återaktivera eller ta bort en normreferens kräver `Admin`.

## Admin Center

Admin Center är tillgängligt för användare med `Admin` eller
`PrivacyOfficer`. Användare utan någon av rollerna ser inte länken i den
globala navigationen. En direktlänk visar en sida som förklarar att behörighet
saknas utan att läsa in Admin Center-data eller klientimplementation.

Admin Center visar endast flikar som den aktuella rollen får använda. Den
första behöriga fliken i navigationsordningen är användarens startflik.

<!-- markdownlint-disable MD013 -->
| Flik | Vem kan använda den |
| --- | --- |
| Kolumner | Användare med `Admin`. |
| Identitet | Användare med `Admin`. |
| Inställningar (AI, Exporter och Rapporter) | Användare med `Admin`. |
| Taxonomi | Användare med `Admin`. |
| Statusar och arbetsflöden | Användare med `Admin`. |
| Behörighetsöversyn | Användare med `Admin` eller `PrivacyOfficer`. |
| Arkivering | Användare med `PrivacyOfficer`. |
| Dataskydd | Användare med `PrivacyOfficer`. |
| Åtgärdslogg | Användare med `Admin`. |
<!-- markdownlint-enable MD013 -->

`Admin` ger inte automatiskt dataskyddsbehörighet. En användare som behöver
både allmän administration och dataskydds- eller gallringsfunktioner måste ha
både `Admin` och `PrivacyOfficer`.

Om en direktlänk anger en befintlig flik som användaren saknar behörighet till
ersätter Kravhantering URL:en med den första behöriga fliken och visar ett kort
statusmeddelande. Panelkod och paneldata laddas först när en behörig flik är
aktiv.

## Behörighetsöversyn

`Behörighetsöversyn` är bara tillgänglig för användare med `Admin` eller
`PrivacyOfficer`. Att vara tilldelad granskningsperson räcker inte i sig.

Det innebär att en användare som bara har `Reviewer` fortfarande kan delta i
vanligt granskningsarbete, men inte kan öppna eller besluta
behörighetsöversyner i Admin Center.

Behörighetsöversynen omfattar de uppdrag som Kravhantering äger:
kravområdesägare, kravområdesmedförfattare, kravpaketsansvarig,
kravpaketsmedförfattare, kravunderlagsansvarig och
kravunderlagsmedförfattare. Globala IdP-roller granskas i identitetssystemet,
inte i Kravhantering.

En separat AI-behörighet ingår inte i behörighetsöversynen i nuvarande modell.
AI-användning följer granskningen av de uppdrag som ger författarbehörighet i
berört kravområde eller kravunderlag.

## Dataskyddsarbete

`Dataskydd` och `Arkivering` är tillgängliga för användare med
`PrivacyOfficer`. Dessa områden kan innehålla känsligt personuppgiftsarbete,
så Kravhantering kontrollerar rollen igen när användaren förhandsgranskar,
exporterar, sparar eller utför en åtgärd.

Att flikar döljs i gränssnittet är inte säkerhetsgränsen. Tjänsten stoppar
fortfarande åtgärden om den roll som krävs saknas.

En inloggad användare med verifierat HSA-id kan exportera sina egna
personuppgifter via självservice. Export av någon annans HSA-id kräver
`PrivacyOfficer`.
