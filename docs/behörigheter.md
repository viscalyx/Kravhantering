# Behörigheter

Den här sidan förklarar vilka roller som ger åtkomst till känsliga delar av
Kravhantering. Den är skriven för personer som använder eller stödjer tjänsten.

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
| Kravområdesägare | Ett kravområde | Huvudansvar för krav och kravurvalsfrågor inom området. |
| Kravområdesmedförfattare | Ett kravområde | Författarstöd för krav och kravurvalsfrågor inom området. |
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

- kravområdesägare får bara verifieras av `Admin`
- kravområdesmedförfattare får verifieras av kravområdesägare,
  kravområdesmedförfattare eller `Admin` för kravområdet
- kravpaketsansvarig och kravpaketsmedförfattare får verifieras av
  kravpaketsansvarig eller `Admin` för ett befintligt kravpaket
- vid skapande av kravpaket får HSA-id verifieras av en användare som får
  skapa kravpaket
- kravunderlagsansvarig och kravunderlagsmedförfattare får verifieras av
  kravunderlagsansvarig, kravunderlagsmedförfattare eller `Admin` för
  kravunderlaget
- vid skapande av kravunderlag får den inloggade användaren verifiera sitt
  eget HSA-id som kravunderlagsansvarig

## Kravområden

Kravområden och byte av kravområdesägare hanteras som administrativ
referensdata. Bara `Admin` kan skapa, ändra eller ta bort kravområden och byta
kravområdesägare. Ett kravområdesägar-HSA-id måste vara verifierat som
kravansvarsperson innan det sparas.

Samma HSA-id får inte samtidigt vara kravområdesägare och
kravområdesmedförfattare för samma kravområde. Om en administratör försöker
byta ägare till en person som redan är medförfattare stoppar tjänsten
ändringen.

Kravområdesägare och kravområdesmedförfattare används som
författarbehörighet inom kravområdet. Den behörigheten används bland annat när
ett kravunderlagslokalt krav ska lyftas till kravbiblioteket och när en
användare ska få skapa kravpaket.

## Kravpaket

Kravpaket har både uppdragsstyrning och särskilda Admin-steg.

En användare får skapa kravpaket om användaren är inloggad med verifierat
HSA-id och är kravområdesägare eller kravområdesmedförfattare i minst ett
kravområde. `Admin` får också skapa kravpaket. Den som skapar kravpaketet blir
kravpaketsansvarig.

Kravpaketsansvarig och `Admin` får ändra kravpaketets metadata, byta
kravpaketsansvarig och hantera kravpaketsmedförfattare. En
kravpaketsmedförfattare är ett appägt uppdrag som visas i dataskydd och
behörighetsöversyn, men ger inte i sig rätt att byta ansvarig eller delegera
kravpaketets uppdrag vidare.

Samma HSA-id får inte samtidigt vara kravpaketsansvarig och
kravpaketsmedförfattare för samma kravpaket.

Arkivering och borttag av kravpaket kräver `Admin`. Återaktivering av
kravpaket ligger i dag bakom den generella inloggningskontrollen och är inte
ännu uppdragsstyrd.

## Kravunderlag

Ett kravunderlag styrs av sina egna uppdrag, inte av de kravområden vars krav
används i kravunderlaget.

När ett nytt kravunderlag skapas måste användaren vara inloggad med verifierat
HSA-id. Den inloggade användaren blir kravunderlagsansvarig. Om anropet anger
en annan kravunderlagsansvarig än den inloggade användaren stoppar tjänsten
skapandet.

Kravunderlagsansvarig, kravunderlagsmedförfattare och `Admin` är den avsedda
uppdragsgruppen för att ändra kravunderlagets innehåll. Den
uppdragskontroll som finns i servern i dag omfattar kravunderlagets metadata
och byte av kravunderlagsansvarig. Där krävs kravunderlagsansvarig,
kravunderlagsmedförfattare eller `Admin`.

Flera innehållsrutter för kravunderlag ligger fortfarande bakom generell
inloggning eller den äldre auktoriseringstjänstegränsen. Det gäller bland
annat vissa ändringar av behovsreferenser, kravurvalssvar, tillägg och borttag
av publicerade bibliotekskrav, kravunderlagslokala krav och avsteg. Den
uppdragsbaserade policyn för dessa rutter är målbilden för återstående
RBAC-införing.

En kravområdesägare eller kravområdesmedförfattare får inte automatiskt
skrivbehörighet till ett kravunderlag bara för att kravunderlaget använder krav
från området. Om personen ska hjälpa till att ändra ett specifikt kravunderlag
måste kravunderlagsansvarig eller en administratör lägga till personen som
kravunderlagsmedförfattare.

Målpolicyn är att kravunderlagsmedförfattare kan ändra kravunderlagets
innehåll, men inte delegera behörighet vidare. Bara kravunderlagsansvarig och
`Admin` ska kunna ändra kravunderlagsansvarig eller hantera
kravunderlagsmedförfattare.

Samma HSA-id får inte samtidigt vara kravunderlagsansvarig och
kravunderlagsmedförfattare för samma kravunderlag. Om ansvarigbytet skulle ge
en sådan dubbel roll stoppar tjänsten ändringen.

## Bibliotekskrav i kravunderlag

Målpolicyn är att användare som kan ändra ett kravunderlag kan lägga till
publicerade bibliotekskrav från vilket kravområde som helst. När ett publicerat
bibliotekskrav läggs till registreras att kravet används i kravunderlaget; det
ändrar inte bibliotekskravet eller kravområdet.

När ett kravunderlagslokalt krav lyfts till kravbiblioteket är målpolicyn att
aktören behöver behörighet i båda sammanhangen:

- skrivbehörighet i kravunderlaget som källa, som
  kravunderlagsansvarig, kravunderlagsmedförfattare eller `Admin`
- författarbehörighet i målkravområdet, som kravområdesägare,
  kravområdesmedförfattare eller `Admin`

Servern kontrollerar i dag författarbehörigheten i målkravområdet vid lyftet.
Källkravunderlagets uppdragskontroll hör till den återstående
RBAC-införingen.

Att vara kravområdesägare eller kravområdesmedförfattare ger inte full
läsbehörighet till varje kravunderlag där områdets krav används. Användning kan
visas genom rapporter, statistik eller tillämpningsspårbarhet utan att hela
kravunderlagets sammanhang exponeras.

Denna uppdragspolicy är målbilden för den återstående RBAC-införingen. Vissa
rutter gör redan uppdragsbaserade behörighetskontroller, och återstående
arbete med auktorisering i API, MCP, rapporter och användargränssnitt följs i
[ärende #270](https://github.com/viscalyx/Kravhantering/issues/270).

## Normbibliotek

Normreferenser har en enklare behörighetsgräns än kravområden, kravpaket och
kravunderlag. En inloggad användare kan skapa en normreferens. Att ändra,
arkivera, återaktivera eller ta bort en normreferens kräver `Admin`.

## Admin Center

Admin Center visar privilegierade flikar även när du inte kan använda dem.
Flikar som du inte kan använda är nedtonade och kan inte väljas. Det gör det
tydligt att funktionen finns och vilken roll som krävs.

<!-- markdownlint-disable MD013 -->
| Flik | Vem kan använda den |
| --- | --- |
| Kolumner | Användare som kan öppna Admin Center. |
| Identitet | Användare med `Admin`. |
| Taxonomi | Användare som kan öppna Admin Center. |
| Statusar och arbetsflöden | Användare som kan öppna Admin Center. |
| Behörighetsöversyn | Användare med `Admin` eller `PrivacyOfficer`. |
| Arkivering | Användare med `PrivacyOfficer`. |
| Dataskydd | Användare med `PrivacyOfficer`. |
| Åtgärdslogg | Användare med `Admin`. |
<!-- markdownlint-enable MD013 -->

## Nedtonade flikar

När en flik är nedtonad har kontot inte den roll som krävs för arbetet. Ett
kort meddelande förklarar vilken roll som krävs. Sidan ändras inte när du
väljer fliken.

Om någon skickar en direktlänk till en flik som du inte kan använda öppnar
Kravhantering i stället Admin Center på en flik som du får se.

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

Äldre AI-behörighetsflaggor ingår inte längre i behörighetsöversynen. De
användes inte som faktisk åtkomstkontroll och ska inte presenteras som om de
ger eller begränsar åtkomst.

## Dataskyddsarbete

`Dataskydd` och `Arkivering` är tillgängliga för användare med
`PrivacyOfficer`. Dessa områden kan innehålla känsligt personuppgiftsarbete,
så Kravhantering kontrollerar rollen igen när användaren förhandsgranskar,
exporterar, sparar eller utför en åtgärd.

Den nedtonade fliken är därför bara en hjälpsam vägvisare. Tjänsten stoppar
fortfarande åtgärden om den roll som krävs saknas.

En inloggad användare med verifierat HSA-id kan exportera sina egna
personuppgifter via självservice. Export av någon annans HSA-id kräver
`PrivacyOfficer`.
