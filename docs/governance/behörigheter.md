# Behörigheter

Den här sidan förklarar vilka roller som ger åtkomst till känsliga delar av
Kravhantering. Den hjälper användare och support att avgöra vilken roll eller
vilket uppdrag som behövs för en åtgärd.

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
eller återanvända en lokal kravansvarsperson. Om direktuppslaget inte är
tillgängligt visar gränssnittet vägledning. Redan sparade kravansvarspersoner
kan fortfarande återanvändas i tillåtna uppdrag. HSA-personuppslaget är
behörighetsstyrt per syfte:

- kravområdesägare får verifieras av `Admin` vid skapande av kravområde, eller
  av aktuell kravområdesägare eller `Admin` vid överlämning av ett befintligt
  kravområde
- kravområdesmedförfattare får verifieras av aktuell kravområdesägare eller
  `Admin` för kravområdet
- kravpaketsansvarig och kravpaketsmedförfattare får verifieras av
  kravpaketsansvarig eller `Admin` för ett befintligt kravpaket
- vid skapande av kravpaket får en användare som får skapa kravpaket
  verifiera sitt eget HSA-id som kravpaketsansvarig
- kravunderlagsansvarig och kravunderlagsmedförfattare får verifieras av
  kravunderlagsansvarig eller `Admin` för kravunderlaget
- vid skapande av kravunderlag får den inloggade användaren verifiera sitt
  eget HSA-id som kravunderlagsansvarig

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
finns i området går prefixet inte längre att ändra.

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
HSA-id. Den inloggade användaren blir kravunderlagsansvarig. Det går inte att
ange en annan kravunderlagsansvarig vid skapandet.

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

Överenskommelser har en snävare beslutsgräns. Kravunderlagsansvarig,
kravunderlagsmedförfattare och `Admin` får förbereda utkast och ändra deras
innehåll. Bara den tilldelade kravunderlagsansvariga får fastställa, bekräfta,
rätta, förkasta, avbryta eller avsluta en överenskommelse. `Admin` eller
`Reviewer` räcker inte ensamt för dessa beslut. När en överenskommelse har
bekräftats kan innehållet inte längre redigeras som ett utkast.

Beslut att godkänna eller avslå avsteg kräver `Reviewer`. Att avbryta ett
pågående avstegsärende med motivering kräver skrivbehörighet i kravunderlaget.
Att avsluta ett tillämpligt godkänt avsteg kräver däremot att användaren är
kravunderlagsansvarig; det ursprungliga granskningsbeslutet bevaras.

`Admin` och `Reviewer` kan lista och läsa alla kravunderlag. Andra inloggade
användare ser bara sina tilldelade kravunderlag, där tilldelningen kommer från
att vara kravunderlagsansvarig eller kravunderlagsmedförfattare. Om användaren
saknar tilldelade kravunderlag visas en tom lista. En direktlänk ger inte
åtkomst till ett kravunderlag som användaren saknar behörighet till.

Samma läsregel gäller kravunderlagets kravtillämpningar,
kravunderlagslokala krav, avstegslistor och enskilda avsteg.

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
Den ofiltrerade förvaltningslistan visar bara RFI-frågor från kravområden där
användaren har författarbehörighet; `Admin` kan läsa listan över alla
kravområden. Att filtrera på ett kravområde ger inte tillgång till dess
förvaltningslista om användaren saknar författarbehörighet där.

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

Läsbehörigheten för en bestämd kravversion beror på versionens aktuella
status. En publicerad version kan läsas utan ansvarstilldelning även när
kravet har ett nyare utkast. Utkast, granskning
och arkiverade versioner kräver kravområdesägare, kravområdesmedförfattare,
`Reviewer` eller `Admin`. Detta gäller även tidigare publicerade versioner
som nu är arkiverade efter att en ny version publicerats; ett datum för
tidigare publicering ger inte läsbehörighet.

Kravområdesägare, kravområdesmedförfattare och `Admin` kan författa
kravområdets krav, kravurvalsfrågor och RFI-frågor. Beslut i gransknings- och
arkiveringsflöden kräver däremot `Reviewer`; `Admin` räcker inte ensamt för
sådana beslut. En `Reviewer` får besluta om sitt eget avsteg.

För kravurvalsfrågor omfattar författarbehörigheten skapande, redigering,
duplicering, ordning, synlighetsvillkor, svar och livscykel. Den som får läsa
men inte författa ser en skrivskyddad förvaltningsyta.

Förbättringsförslag kräver författarbehörighet i kravområdet eller `Admin`
för att skapas, ändras, tas bort, skickas till granskning eller återföras till
utkast. Samma behörighet krävs för att lösa eller avvisa ett förslag och koppla
det till en genomförandeversion. `Reviewer` ger inte i sig dessa behörigheter.

Direkt läsning av ett förbättringsförslag följer läsregeln för det tillhörande
kravet. Förslag till publicerade krav kan därför läsas där publicerad
kravinformation är tillåten. Förslag till opublicerade krav kräver
författarbehörighet i kravområdet, `Reviewer` eller `Admin`.

Om användaren får läsa kravet men inte ändra det visas sidan som
skrivskyddad med ett kort meddelande.

## Rapporter

PDF-rapporter från kravlistan i kravbiblioteket är tillgängliga för
vanliga inloggade användare och följer kravens läsbehörighet. Användare utan
författaruppdrag eller rollen `Reviewer` eller `Admin` får bara läsa
publicerade krav genom list-PDF:en.

Rapporter för historik, granskning, kombinerad granskning och förslagshistorik
kräver åtkomst till kravets historik. Kravunderlagsrapporter kontrollerar
läsåtkomst till kravunderlaget innan kravunderlagets poster hämtas.

## AI-assisterat författande

AI-assisterat författande använder samma uppdragsbaserade behörighet som
författande i Kravhantering. Vid generering och AI-reparation av en kravimport
måste användaren välja exakt ett kravområde eller kravunderlag som destination.
En användare utan `Admin` behöver motsvarande uppdrag:

- kravområdesägare eller kravområdesmedförfattare i det valda kravområdet
- kravunderlagsansvarig eller kravunderlagsmedförfattare i det valda
  kravunderlaget

`Admin` behöver inget tilldelat författaruppdrag, men måste fortfarande välja
destination. Det finns ingen separat AI-behörighet i nuvarande modell.
AI-anrop använder administratörsförvaltade AI-anslutningar och körprofiler.
Behörighet att författa ger inte rätt att administrera anslutningar, modeller
eller kreditinformation.

En användare med `Admin` kan stänga av AI-kravgenerering globalt i Admin Center.
AI-stödet kan också vara spärrat av driftorganisationen, oavsett
Admin Center-inställningen. En författarbehörighet garanterar därför
inte att AI-stödet är tillgängligt.

## Normbibliotek

För närvarande kan en inloggad användare skapa en normreferens via
webbgränssnittet, medan skapande via MCP kräver `Admin`. Behörighetskontrollen
skiljer sig alltså mellan dessa vägar. Att ändra, arkivera, återaktivera eller
ta bort en normreferens kräver `Admin`.

## Admin Center

Admin Center är tillgängligt för användare med `Admin` eller
`PrivacyOfficer`. Användare utan någon av rollerna ser inte länken i den
globala navigationen. En direktlänk visar en sida som förklarar att behörighet
saknas.

Admin Center visar endast flikar som den aktuella rollen får använda. Den
första behöriga fliken i navigationsordningen är användarens startflik.

<!-- markdownlint-disable MD013 -->
| Flik | Vem kan använda den |
| --- | --- |
| Kolumner | Användare med `Admin`. |
| Identitet | Användare med `Admin`. |
| Inställningar (AI, Säkerhet, Importer, Exporter och Rapporter) | Användare med `Admin`. |
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
statusmeddelande.

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
