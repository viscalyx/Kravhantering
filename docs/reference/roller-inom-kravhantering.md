# Rollista för autentisering och behörighetsstyrning

## Inledning

Denna rollista beskriver de roller och uppdrag som en användare kan
tilldelas i den nuvarande autentiserings- och behörighetsmodellen.
Modellen utgår från en OIDC-kompatibel identitetsleverantör för
autentisering. Keycloak används i lokal utveckling och prodlike-miljöer,
medan produktionsleverantör beslutas per miljö.

Behörighetsstyrningen är uppdragsbaserad RBAC. Globala IdP-roller används
för tvärgående ansvar som granskning, administration och dataskydd.
Författar- och förvaltningsbehörighet styrs i stället genom
HSA-id-bundna kravansvarstilldelningar i applikationens databas.

Roll- och uppdragsnamnen nedan är formulerade för
verksamhetsdokumentation. Underliggande tekniska rollvärden i
identitetsintyg är fortsatt `Reviewer`, `Admin` och `PrivacyOfficer`.
Uppdrag som kravområdesägare, kravpaketsmedförfattare eller
kravunderlagsansvarig ska inte införas som globala IdP-roller.

## Roll/Uppdrag: Autentiserad användare

**Syfte med rollen/uppdraget:**
Att ge en verifierad användare grundläggande åtkomst till applikationen
och till publicerat kravinnehåll. Rollen utgör basnivån i
behörighetsmodellen och kräver inte något särskilt författar-,
förvaltnings- eller granskningsuppdrag. Alla vidare behörigheter bygger
på att användaren är autentiserad och har ett verifierat HSA-id.

**Ansvar:**
Den autentiserade användaren ansvarar för att använda systemet enligt
gällande verksamhetsregler, läsa publicerat material i rätt sammanhang
och lämna förbättringsförslag när brister eller förbättringsbehov
identifieras. Användaren ska inte ändra, godkänna, besluta eller
administrera material utan särskild tilldelning.

Autentisering ger inte generell läsåtkomst till alla kravunderlag. En
användare utan `Admin` eller `Reviewer` ser bara de kravunderlag där
personen är kravunderlagsansvarig eller kravunderlagsmedförfattare.

**Kompetenser och erfarenheter:**

- Grundläggande förståelse för kravhanteringens syfte och struktur.
- Förmåga att tolka publicerade krav.
- Kännedom om verksamhetens processer för avvikelser och
  förbättringsförslag.
- Förmåga att beskriva förbättringsbehov sakligt och spårbart.
- Grundläggande digital kompetens och vana att arbeta i verksamhetssystem.

**Exempel på arbetsuppgifter:**

- Läsa publicerade krav och publik taxonomi.
- Söka i kravbiblioteket.
- Ta del av rapporter som bygger på publicerat kravinnehåll.
- Skapa och ändra förbättringsförslag för publicerade krav.
- Följa status på egna eller relevanta förbättringsförslag.
- Exportera egna personuppgifter via självservice när HSA-id:t är
  verifierat.

## Roll/Uppdrag: Kravområdesägare

**Syfte med rollen/uppdraget:**
Att ge en namngiven person huvudansvar för ett kravområde.
Kravområdesägaren är den primära författar- och
förvaltningsansvariga för krav inom kravområdet och är den person vars
HSA-id kopplas till kravområdets ägarpost. Uppdraget säkerställer
tydligt ansvar för kvalitet, aktualitet och livscykelhantering av
kravområdets krav.

**Ansvar:**
Kravområdesägaren ansvarar för att krav inom det egna kravområdet tas
fram, hålls aktuella, skickas till granskning och vid behov initieras för
arkiveringsgranskning. Slutliga gransknings- och arkiveringsbeslut
kräver `Reviewer`. Rollen ansvarar också för att medförfattare används
korrekt, att områdets RFI-frågor hålls användbara och att kravområdet inte
lämnas utan ansvarig ägare.

**Kompetenser och erfarenheter:**

- God sakkunskap inom det aktuella kravområdet.
- Erfarenhet av kravarbete, förvaltning eller arkitektur.
- Förmåga att bedöma kravs kvalitet, omfattning och konsekvenser.
- Kännedom om kravens livscykel från utkast till arkivering.
- Förmåga att samordna med medförfattare och granskare.
- Förståelse för spårbarhet, versionshantering och ansvarsfördelning.
- God skriftlig förmåga på svenska.

**Exempel på arbetsuppgifter:**

- Skapa och redigera bibliotekskrav inom det egna kravområdet.
- Skapa och underhålla kravurvalsfrågor inom det egna kravområdet.
- Skapa, redigera, arkivera och återaktivera RFI-frågor inom det egna
  kravområdet.
- Hantera RFI-frågeförslag som avser det egna kravområdet.
- Skicka krav från Utkast till Granskning.
- Initiera arkiveringsgranskning för publicerade krav som inte längre ska
  gälla.
- Återskapa arkiverade kravversioner som nytt utkast vid behov.
- Hantera kravområdets medförfattare enligt behörighetsreglerna.
- Lämna över kravområdesägarskap till verifierad kravansvarsperson.
- Bedöma och hantera förbättringsförslag som avser kravområdets krav.
- Säkerställa att kravområdet har korrekt ägarinformation.

## Roll/Uppdrag: Kravområdesmedförfattare

**Syfte med rollen/uppdraget:**
Att ge en eller flera personer möjlighet att stödja kravområdesägaren i
framtagning och underhåll av krav inom ett kravområde. Uppdraget ger
författarbehörighet utan att flytta huvudansvaret från
kravområdesägaren.

**Ansvar:**
Kravområdesmedförfattaren ansvarar för att bidra till kravens innehåll,
kvalitet och uppdatering inom tilldelat kravområde. Uppdraget ska
utföras i samverkan med kravområdesägaren. Medförfattaren får bidra i
kravens livscykel och RFI-frågeförvaltning men får inte ändra kravområdets
metadata, byta ägare eller hantera kravområdets medförfattare.

**Kompetenser och erfarenheter:**

- Relevant sakkunskap inom kravområdet.
- Praktisk erfarenhet av att formulera, granska eller underhålla krav.
- Förmåga att arbeta strukturerat enligt fastställd kravprocess.
- Förståelse för versionshantering och spårbar dokumentation.
- Förmåga att samverka med kravområdesägare och granskare.
- God skriftlig förmåga på svenska.

**Exempel på arbetsuppgifter:**

- Skapa och redigera kravutkast inom tilldelat kravområde.
- Skapa och redigera kravurvalsfrågor inom tilldelat kravområde.
- Skapa, redigera, arkivera och återaktivera RFI-frågor inom tilldelat
  kravområde.
- Hantera RFI-frågeförslag inom tilldelat kravområde.
- Skicka krav från Utkast till Granskning.
- Initiera arkiveringsgranskning när kravet bör tas ur bruk.
- Återställa arkiverade krav till nytt utkast när det är motiverat.
- Bidra med underlag till hantering av förbättringsförslag.
- Delta i kvalitetssäkring före formell granskning.
- Uppdatera kravtexter efter återkoppling från granskare eller verksamhet.

## Roll/Uppdrag: Kravpaketsansvarig

**Syfte med rollen/uppdraget:**
Att ge en namngiven person ansvar för ett kravpaket inom kravbibliotekets
förvaltning. Kravpaketsansvarig är den person vars HSA-id och
visningsnamn kopplas till kravpaketet och som ansvarar för att paketets
namn, syfte, avgränsning och användning hålls tydliga över tid.

**Ansvar:**
Kravpaketsansvarig ansvarar för att kravpaketet är verksamhetsmässigt
begripligt, aktuellt och användbart som urvalsgrund i kravunderlag.
Uppdraget omfattar att ändra kravpaketets metadata, byta
kravpaketsansvarig och hantera kravpaketsmedförfattare. Arkivering,
återaktivering och borttag av kravpaket kräver `Admin`.

Uppdraget omfattar inte att direkt ändra vilka kravversioner som ingår i
paketet. Sådan medlemskapshantering sker genom kravens ordinarie
livscykel och metadata.

**Kompetenser och erfarenheter:**

- God förståelse för den gruppering eller användningssituation som
  kravpaketet beskriver.
- Erfarenhet av kravarbete, kravbiblioteksförvaltning eller
  tillämpningsstyrning.
- Förmåga att formulera korta och tydliga paketnamn samt syfte och
  avgränsning.
- Förståelse för hur kravpaket används i kravurvalsfrågor och
  kravunderlag.
- Kännedom om kravens livscykel och skillnaden mellan paketmetadata och
  kravversioners innehåll.
- Förmåga att samordna med kravområdesägare,
  kravpaketsmedförfattare och kravunderlagsansvariga.

**Exempel på arbetsuppgifter:**

- Skapa kravpaket när personen har författarbehörighet i minst ett
  kravområde.
- Underhålla kravpaketets namn samt syfte och avgränsning.
- Hantera kravpaketets medförfattare enligt behörighetsreglerna.
- Bedöma när ett kravpaket bör arkiveras eller återaktiveras och vid
  behov samordna med administratör.
- Samordna med kravområdesägare när paketets kravurval behöver förändras.
- Stödja kravurvalsfrågor där svar pekar på kravpaket.
- Överlämna paketansvar till annan verifierad kravansvarsperson.

## Roll/Uppdrag: Kravpaketsmedförfattare

**Syfte med rollen/uppdraget:**
Att ge en eller flera personer ett dokumenterat stöd- och
medförfattarskap för ett kravpaket utan att flytta huvudansvaret från
kravpaketsansvarig. Uppdraget är en applikationsägd HSA-id-tilldelning
som ingår i dataskyddsflöden och behörighetsöversyn.

**Ansvar:**
Medförfattaren för kravpaket ansvarar för att bidra med sakkunskap om
paketets syfte, avgränsning och användning. Uppdraget ger inte i sig rätt
att ändra kravpaketets metadata, byta kravpaketsansvarig, hantera
medförfattare, arkivera, återaktivera eller ta bort kravpaketet.

**Kompetenser och erfarenheter:**

- God förståelse för den användningssituation som kravpaketet beskriver.
- Relevant sakkunskap inom de kravområden eller kravunderlag där paketet
  används.
- Förmåga att bidra till tydliga paketnamn samt syfte och avgränsning.
- Förståelse för kravpaketets roll som urvalsgrund, inte som egen
  kravversion.
- Förmåga att samverka med kravpaketsansvarig och kravområdesägare.

**Exempel på arbetsuppgifter:**

- Bidra med underlag till kravpaketets namn, syfte, avgränsning och relevans.
- Bidra med underlag till kravurvalsfrågor där kravpaketet används som
  urvalsgrund.
- Delta i genomgångar av paketets användning.
- Stödja kravpaketsansvarig inför ändringar i paketmetadata.
- Läsa kravpaketets metadata och medförfattarlista.
- Förekomma som kravansvarstilldelning i dataskyddsexport och
  behörighetsöversyn.

## Roll/Uppdrag: Kravunderlagsansvarig

**Syfte med rollen/uppdraget:**
Att ge en namngiven person huvudansvar för ett kravunderlag. Uppdraget
omfattar styrning av underlagets innehåll och lokala krav samt ansvar för
att underlaget hålls korrekt och användbart i både införande- och
förvaltningsfas.

**Ansvar:**
Den kravunderlagsansvarige ansvarar för kravunderlagets sammansättning,
underlagslokala krav, RFI-frågelista, avvikelser och tilldelade
medförfattare. Uppdraget omfattar både praktisk hantering av underlagets
innehåll och samordning av ändringar så att underlaget fortsätter stödja sitt
avsedda användningsområde.

**Kompetenser och erfarenheter:**

- God förståelse för kravunderlagets verksamhetsområde och användning.
- Erfarenhet av kravsammanställning, projektgenomförande eller
  förvaltning.
- Förmåga att bedöma konsekvenser av att lägga till eller ta bort krav.
- Kännedom om avvikelsehantering.
- Förmåga att prioritera och samordna arbete med medförfattare.
- Förståelse för skillnaden mellan bibliotekskrav och underlagslokala
  krav.
- God kommunikativ och skriftlig förmåga.

**Exempel på arbetsuppgifter:**

- Lägga till och ta bort publicerade bibliotekskrav i kravunderlaget.
- Skapa och redigera underlagslokala krav.
- Ändra RFI-frågelistans omfattning, låsa eller låsa upp listan och ange
  RFI-relevans.
- Hantera kravunderlagets medförfattare.
- Skapa, redigera och följa upp avvikelser kopplade till underlaget.
- Samordna ändringar med berörda kravområden.
- Säkerställa att kravunderlaget är aktuellt inför användning eller
  förvaltning.
- Skapa RFI-frågeförslag från kravunderlaget bara när personen också har
  författarbehörighet i mottagande kravområde.
- Vid behov överlämna ansvar i samband med livscykeländringar.

## Roll/Uppdrag: Kravunderlagsmedförfattare

**Syfte med rollen/uppdraget:**
Att ge en eller flera personer möjlighet att stödja den
kravunderlagsansvarige i hantering av ett kravunderlag. Uppdraget
möjliggör praktiskt arbete med underlagets innehåll utan att
huvudansvaret för underlaget flyttas.

**Ansvar:**
Kravunderlagsmedförfattaren ansvarar för att bidra till ett korrekt och
uppdaterat kravunderlag inom ramen för tilldelat uppdrag. Arbetet ska ske
i samverkan med kravunderlagsansvarig och följa samma krav på
spårbarhet, kvalitet och korrekt avvikelsehantering.

Kravunderlagsmedförfattaren kan ändra kravunderlagets innehåll, men får
inte delegera behörighet vidare, byta kravunderlagsansvarig eller hantera
kravunderlagets medförfattare.
RFI-frågeförslag från kravunderlaget kräver dessutom författarbehörighet i
det mottagande kravområdet.

**Kompetenser och erfarenheter:**

- Kunskap om kravunderlagets sakområde.
- Erfarenhet av kravarbete, projektarbete eller systemförvaltning.
- Förmåga att hantera ändringar strukturerat.
- Grundläggande förståelse för avvikelsehantering.
- Förmåga att samverka med kravunderlagsansvarig och andra berörda
  roller.
- God skriftlig förmåga på svenska.

**Exempel på arbetsuppgifter:**

- Redigera underlagslokala krav.
- Föreslå och genomföra ändringar i kravunderlagets innehåll.
- Ändra RFI-frågelistans omfattning, låsning och relevans inom tilldelat
  kravunderlag.
- Lägga till eller ta bort krav enligt tilldelad behörighet.
- Skapa och redigera avvikelser kopplade till kravunderlaget.
- Delta i genomgångar av kravunderlagets aktualitet och kvalitet.
- Förbereda underlag för beslut av kravunderlagsansvarig eller granskare.

## Roll/Uppdrag: Granskare

**Syfte med rollen/uppdraget:**
Att säkerställa kvalificerad granskning av krav, avvikelsebeslut och
granskningsflöden. Granskaren motsvarar det tekniska rollvärdet
`Reviewer` och är en global roll som inte är knuten till ett enskilt
kravområde eller kravunderlag.

**Ansvar:**
Granskaren ansvarar för att bedöma om krav och beslut håller tillräcklig
kvalitet för publicering eller formellt beslut. Rollen ska tillämpa
verksamhetens rutiner för opartiskhet och separation of duties.

Nuvarande systempolicy tillåter att en `Reviewer` fattar beslut även när
samma persons HSA-id visar att personen själv har skapat underlaget,
avsteget eller förslaget. Sådana egna beslut ska hanteras med särskild
varsamhet och loggas som högriskhändelser.

**Kompetenser och erfarenheter:**

- Dokumenterad erfarenhet av arkitektur, kravarbete eller kvalificerad
  granskning.
- Förmåga att bedöma krav ur kvalitets-, konsekvens- och
  efterlevnadsperspektiv.
- Kunskap inom relevanta specialistområden, exempelvis IT-säkerhet,
  infrastruktur eller utveckling.
- Förståelse för opartisk granskning och separation of duties.
- Förmåga att ge tydlig och konstruktiv återkoppling.
- God kännedom om organisationens kravprocess.
- Hög integritet och förmåga att fatta välgrundade beslut.

**Exempel på arbetsuppgifter:**

- Granska krav som skickats från Utkast till Granskning.
- Publicera krav som uppfyller granskningskraven.
- Avvisa krav till Utkast med motivering när de behöver omarbetas.
- Godkänna eller avbryta arkiveringsgranskning.
- Fatta granskningsbeslut om avvikelser där rollen har mandat.
- Läsa kravunderlag och deras RFI-frågelistor brett för granskningsarbete.
- Bidra med specialistbedömningar inom arkitektur- och kravfrågor.

Granskare får inte i kraft av `Reviewer` använda privilegierade Admin
Center-flikar som behörighetsöversyn eller åtgärdslogg.

## Roll/Uppdrag: Administratör

**Syfte med rollen/uppdraget:**
Att ge ett begränsat antal användare övergripande administrativ
behörighet för systemets kataloger, konfiguration och tilldelningar.
Administratören motsvarar det tekniska rollvärdet `Admin` och har ett
systemövergripande ansvar snarare än ett ansvar för ett enskilt
kravområde, kravpaket eller kravunderlag.

**Ansvar:**
Administratören ansvarar för att grunddata, behörighetskritiska
tilldelningar och administrativa kataloger hanteras korrekt. Rollen ska
säkerställa att kravområden har kravområdesägare, att kravunderlag har
kravunderlagsansvariga och att systemets styrande konfiguration stödjer
verksamhetens processer.

`Admin` är ett brett administrativt undantag för många läs-, författar-
och konfigurationsåtgärder. Rollen ersätter däremot inte `Reviewer` för
granskningsbeslut som publicering, arkiveringsbeslut eller
avstegsbeslut.

**Kompetenser och erfarenheter:**

- God förståelse för systemets informationsmodell och behörighetsmodell.
- Erfarenhet av systemadministration eller informationsförvaltning.
- Förmåga att hantera behörighetskritiska ändringar med hög noggrannhet.
- Kännedom om kravområden, kravpaket, kravunderlag och tillhörande
  grunddata.
- Förståelse för personuppgiftsminimering och spårbarhet.
- Förmåga att felsöka behörighets- och konfigurationsfrågor.
- Hög integritet och god förmåga att följa fastställda rutiner.

**Exempel på arbetsuppgifter:**

- Administrera kravområden och tilldela eller ändra kravområdesägare.
- Hantera administrativa kataloger och terminologi.
- Konfigurera kravversionsstatusar, användningsstatusar, kolumner och
  grunddata.
- Tilldela eller ändra kravunderlagsansvarig när verksamheten kräver det.
- Administrera kravpaket, inklusive arkivering, återaktivering och borttag.
- Administrera RFI-frågor och stödja behörighetsstyrda RFI-liståtgärder.
- Hantera situationer där ett kravområde saknar ägare.
- Utföra övergripande kontroller av behörighets- och tilldelningsdata.
- Läsa åtgärdsloggen och stödja felsökning av åtkomstproblem.

## Roll/Uppdrag: Dataskyddshandläggare

**Syfte med rollen/uppdraget:**
Att ge en särskilt utsedd användare behörighet att hantera
dataskyddsflöden för strukturerade personuppgifter i applikationen.
Dataskyddshandläggaren motsvarar det tekniska rollvärdet
`PrivacyOfficer` och är en smal global roll som inte ger övriga
administratörsrättigheter.

**Ansvar:**
Dataskyddshandläggaren ansvarar för att ärenden om dataportabilitet,
GDPR-radering, arkiveringsretention och behörighetsöversyn hanteras
korrekt, spårbart och med minsta möjliga påverkan på kravhistorik och
ansvarskedjor. Rollen ska säkerställa att matchning görs med verifierat
HSA-id och att namn eller fritext inte används som grund för radering.

**Kompetenser och erfarenheter:**

- God förståelse för dataskydd, personuppgiftsminimering och
  GDPR-relaterade rättigheter.
- Förmåga att bedöma när radering, anonymisering, byte av ansvarig eller
  undantag är lämpligt.
- Förståelse för HSA-id som stabil identitetsnyckel och för risker med
  namnmatchning.
- Kännedom om applikationens strukturerade identitetsfält, åtgärdslogg
  och säkerhetslogg.
- Förmåga att hantera känsliga ärenden med hög integritet och dokumenterad
  spårbarhet.
- Förståelse för skillnaden mellan dataskyddsradering, funktionell
  arkivering och verksamhetsretention.

**Exempel på arbetsuppgifter:**

- Förhandsgranska HSA-id-baserade träffar inför GDPR-radering.
- Exportera personuppgifter för egen eller behörigt granskad registrerad
  person.
- Utföra radering, anonymisering eller byte av aktiva tilldelningar enligt
  beslutad policy.
- Skapa eller hantera undantag när bevarande, legal hold eller
  verksamhetsbehov hindrar radering.
- Granska arkiverings- och retentionskandidater innan borttagning körs.
- Skapa, besluta, slutföra och exportera behörighetsöversyner.
- Säkerställa att dataskyddsåtgärder dokumenteras utan att råa
  målidentiteter sprids i loggar eller exporter.

## Roll/Uppdrag: Behörighetsöversynshandläggare

**Syfte med rollen/uppdraget:**
Att ge en behörig användare ansvar att genomföra en behörighetsöversyn av
applikationsstyrda uppdrag. Detta är inte ett separat HSA-id-bundet
uppdrag och inte en separat global IdP-roll. I nuvarande modell utförs
arbetet av användare med `Admin` eller `PrivacyOfficer`.

**Ansvar:**
Behörighetsöversynshandläggaren ansvarar för att bedöma om varje
inventerad behörighetsrad fortfarande är korrekt, ska ändras, ska
återkallas eller inte är tillämplig. Granskningen ska genomföras sakligt,
spårbart och med hänsyn till principen om minsta behörighet.

Behörighetsöversynen omfattar de uppdrag som Kravhantering äger:
kravområdesägare, kravområdesmedförfattare, kravpaketsansvarig,
kravpaketsmedförfattare, kravunderlagsansvarig och
kravunderlagsmedförfattare. Globala IdP-roller, källkodsåtkomst och
externt tilldelade MCP-klienter granskas i de system där de
tilldelas. En separat AI-behörighet ingår inte i nuvarande modell;
AI-användning följer de uppdrag som ger författarbehörighet i valt
behörighetssammanhang.

**Kompetenser och erfarenheter:**

- God förståelse för applikationens uppdrag, roller och ansvarsfördelning.
- Förmåga att bedöma om en person fortsatt behöver ett visst uppdrag.
- Kännedom om principen om minsta behörighet och återkommande
  behörighetsöversyn.
- Förmåga att dokumentera beslut och motiveringar tydligt.
- Förståelse för vilka globala roller och externa åtkomster som granskas
  utanför applikationen.
- Hög integritet och vana att hantera behörighetskritiska beslut.

**Exempel på arbetsuppgifter:**

- Skapa eller öppna en behörighetsöversyn.
- Besluta om inventerade rader ska godkännas, ändras, återkallas eller
  markeras som ej tillämpliga.
- Dokumentera kommentar eller motivering där beslutet kräver
  förtydligande.
- Kontrollera att ansvariga och medförfattare fortfarande behöver sina
  uppdrag.
- Hänvisa till extern evidens för globala IdP-roller, källkodsåtkomst
  eller MCP-klienter när sådan granskning sker utanför applikationen.
- Avbryta, slutföra eller exportera översynen enligt fastställd rutin.

## Roll/Uppdrag: Teknisk MCP-konsument

**Syfte med rollen/uppdraget:**
Att ge en godkänd teknisk klient, exempelvis en MCP-konsument,
kontrollerad åtkomst till API-baserade funktioner. Uppdraget är inte en
personroll. Klienten autentiseras med Bearer-token och måste bära ett
giltigt `employeeHsaId` i realformat. Det HSA-id:t kan vara personbundet
eller syntetiskt beroende på godkänd integrationsmodell och tilldelade
uppdrag.

**Ansvar:**
Den tekniska MCP-konsumenten ska endast användas för avsedda
integrationsflöden och med minsta möjliga behörighet. Ansvarig för
integrationen ska säkerställa att klientuppgifter skyddas, att tokens
hanteras säkert och att klienten endast får de uppdrag som krävs för dess
syfte. Provisionering av externa MCP-klienter granskas i det system där
klientåtkomsten tilldelas och kan refereras som extern evidens i
behörighetsöversynen.

**Kompetenser och erfarenheter:**

- Erfarenhet av säkra systemintegrationer och API-användning.
- Förståelse för OAuth 2.0 Client Credentials och tokenbaserad åtkomst.
- Kunskap om principen om minsta behörighet.
- Förmåga att hantera klienthemligheter och tekniska identiteter säkert.
- Förståelse för kravhanteringssystemets behörighetsmodell.
- Förmåga att övervaka och felsöka integrationsflöden.

**Exempel på arbetsuppgifter:**

- Anropa godkända MCP-funktioner med giltig Bearer-token.
- Utföra automatiserade läs- eller skrivoperationer inom tilldelat
  uppdrag.
- Verifiera att klientens `employeeHsaId` matchar avsedd tilldelning.
- Rotera och skydda klientuppgifter enligt fastställd rutin.
- Felsöka token- och behörighetsfel i integrationsflöden.
- Säkerställa att integrationen inte använder bredare behörighet än
  nödvändigt.

## Roller och uppdrag som uttryckligen inte ska användas som IdP-roller

Följande tidigare eller tänkbara benämningar ska inte införas som globala
IdP-roller i den nuvarande modellen:

- **Författare / Author**: författarbehörighet styrs genom uppdrag som
  kravområdesägare, kravområdesmedförfattare, kravunderlagsansvarig eller
  kravunderlagsmedförfattare.
- **Förvaltare / Steward**: förvaltningsansvar följer av
  kravunderlagsansvarig när kravunderlagets livscykel går över i
  förvaltning.
- **Kravpaketsansvarig / Package Lead** och
  **Kravpaketsmedförfattare / Package Co-author**:
  behörighet för kravpaket styrs genom applikationsägda
  HSA-id-tilldelningar.
- **AI-behörig / AI Author**: AI-assisterat författande har ingen separat
  AI-roll i nuvarande modell utan följer det uppdrag som ger
  författarbehörighet i valt behörighetssammanhang.
- **Behörighetsöversynsgranskare / Access Review Reviewer**:
  behörighetsöversyn hanteras av `Admin` eller `PrivacyOfficer`, inte av
  en separat IdP-roll.
