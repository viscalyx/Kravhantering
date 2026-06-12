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
| `Admin` | Administratör. Hanterar gemensam administration och granskar åtgärdslogg. |
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
| Kravpaketsmedförfattare | Ett kravpaket | Författarstöd för kravpaketet och dess innehåll. |
| Kravunderlagsansvarig | Ett kravunderlag | Huvudansvar för kravunderlaget och dess kravunderlagslokala innehåll. |
| Kravunderlagsmedförfattare | Ett kravunderlag | Författarstöd för kravunderlaget och dess kravunderlagslokala innehåll. |
<!-- markdownlint-enable MD013 -->

## Kravunderlag

Ett kravunderlag styrs av sina egna uppdrag, inte av de kravområden vars krav
används i kravunderlaget.

Kravunderlagsansvarig, kravunderlagsmedförfattare och `Admin` kan ändra
kravunderlagets innehåll. Det omfattar metadata, behovsreferenser,
kravurvalssvar, tillägg och borttag av publicerade bibliotekskrav,
kravunderlagslokala krav och avsteg. Separata beslutssteg kan fortfarande kräva
en annan roll, till exempel `Reviewer` för granskningsbeslut.

En kravområdesägare eller kravområdesmedförfattare får inte automatiskt
skrivbehörighet till ett kravunderlag bara för att kravunderlaget använder krav
från området. Om personen ska hjälpa till att ändra ett specifikt kravunderlag
måste kravunderlagsansvarig eller en administratör lägga till personen som
kravunderlagsmedförfattare.

Kravunderlagsmedförfattare kan ändra kravunderlagets innehåll, men kan inte
delegera behörighet vidare. Bara kravunderlagsansvarig och `Admin` kan ändra
kravunderlagsansvarig eller hantera kravunderlagsmedförfattare.

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

Denna uppdragspolicy är målbilden för den återstående RBAC-införingen. Vissa
rutter gör redan uppdragsbaserade behörighetskontroller, och återstående
arbete med auktorisering i API, MCP, rapporter och användargränssnitt följs i
[ärende #270](https://github.com/viscalyx/Kravhantering/issues/270).

## Admin Center

Admin Center visar privilegierade flikar även när du inte kan använda dem.
Flikar som du inte kan använda är nedtonade och kan inte väljas. Det gör det
tydligt att funktionen finns och vilken roll som krävs.

<!-- markdownlint-disable MD013 -->
| Flik | Vem kan använda den |
| --- | --- |
| Kolumner | Användare som kan öppna Admin Center. |
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

## Dataskyddsarbete

`Dataskydd` och `Arkivering` är tillgängliga för användare med
`PrivacyOfficer`. Dessa områden kan innehålla känsligt personuppgiftsarbete,
så Kravhantering kontrollerar rollen igen när användaren förhandsgranskar,
exporterar, sparar eller utför en åtgärd.

Den nedtonade fliken är därför bara en hjälpsam vägvisare. Tjänsten stoppar
fortfarande åtgärden om den roll som krävs saknas.
