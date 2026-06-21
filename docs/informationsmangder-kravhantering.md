<!-- cSpell:words dataskyddsstyrning förvaltningsunderlag källevidens -->
<!-- cSpell:words vidarebehandlas kravversioner kravarkivering -->
<!-- cSpell:words kravunderlagsberoende kravunderlagsexport -->
<!-- cSpell:words kravunderlagshistorik kravunderlagskopplade -->
<!-- cSpell:words kravunderlagssvar -->
<!-- cSpell:words kravunderlagskoppling kravunderlagskopplingar -->
<!-- cSpell:words kravversionens lokalkravkopplingar -->
<!-- cSpell:words appnära kravlivscykel kravbeslut aktörsmetadata appstyrda -->
<!-- cSpell:words retentionregler authhändelser auditdetaljer auditmottagare -->
<!-- cSpell:words kravförfattare kravfunktioner routning -->
<!-- cSpell:words tokenmetadata -->
<!-- cSpell:words användningsmetadata begärandeloggning trafikmetadata -->
<!-- cSpell:words leveranskedjeansvar -->
<!-- cSpell:words fältvis pseudonymisering -->

# Informationsmängder i Kravhantering

Detta dokument är ett förvaltningsunderlag för Kravhantering. Det beskriver
applikationens egna informationsmängder, systemkomponenter och integrationer
på den nivå som behövs för inventering, revision och överlämning till
förvaltningen.

Dokumentet är inte den juridiskt beslutade registerförteckningen, inte en
komplett tillgångsförteckning och inte ett GRC-stöd. Förvaltningen ansvarar
för att föra in uppgifterna i organisationens ordinarie it-stöd för
tillgångsförteckning, registerförteckning och dataskyddsstyrning.

Slutlig rättslig grund, informationsklassning, retention, gallring och
formellt ägarskap fastställs av förvaltningen.

## Källkrav

Underlaget stödjer arbetet med följande krav:

- **Inventering av information och andra relaterade tillgångar**:
  dokumenterad förteckning över informationstillgångar med tilldelat ägarskap.
- **Integritet och skydd av personuppgifter**: regler för skydd av
  personuppgifter, inklusive inbyggt dataskydd och dataskydd som standard.
- **Dataskyddskrav**: fastställande av laglig grund, ändamål,
  uppgiftstyper, registrerade, mottagare, ändamålsbegränsningar och
  lagringstid i registerförteckning.

## Informationsmängder

<!-- markdownlint-disable MD013 -->
| Informationsmängd | Ändamål i Kravhantering | Exempel på uppgifter | Personuppgifter | Preliminära mottagare eller integrationer | Retention och gallring | Ansvar eller ägare | Källevidens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kravbibliotek och kravversioner | Förvalta gemensamma krav, status, historik och spårbarhet över tid. | Kravtext, acceptanskriterier, status, risknivå, verifieringsmetod, normreferenser, versionshistorik. | Ja, när aktörs- eller ägarfält kopplas till versionshistorik. Kravtext kan också innehålla personuppgifter om användare matar in sådana uppgifter. | Webb-UI, REST API, MCP, CSV/PDF-export och SQL Server. | Fastställs av förvaltningen. Applikationens arkivering är funktionell kravarkivering och ersätter inte dataskyddsgallring. | Fastställs av förvaltningen. Kravområden har appnära ägarstöd, men formellt informationsägarskap beslutas utanför repo:t. | [datamodell](./database-schema.md), [kravlivscykel](./lifecycle-workflow.md), [arkitektur](./arkitekturbeskrivning-kravhantering.md) |
| Kravurvalsfrågor och kravurvalssvar | Förvalta frivilliga urvalsfrågor som hjälper användare att välja relevanta bibliotekskrav i kravunderlag. | Kod för fråga, frågetext, svarstext, hjälptext, status, arkiveringsdatum samt länkar till kravpaket eller publicerade krav. | Nej, utöver eventuell personinformation som användare själva skriver in i fritext. | Webb-UI, REST API, rapporter/export och SQL Server. | Arkiverade frågor och svar kan gallras efter 365 dagar när inga sparade kravunderlagssvar fortfarande refererar dem. | Förvaltning och dataskyddshandläggare. | [datamodell](./database-schema.md), [Admin Center](./admin-center.md) |
| RFI-frågor och RFI-frågelistor | Förvalta generiska RFI-frågor per kravområde och stödja skriftlig dialog inför kravurval utan att lagra leverantörssvar. | RFI-frågekod, frågeversion, frågetext, syftestext, önskat svarsformat, rådgivande länkar, kravunderlagets scope, låsning och relevansbedömning. | Ja, aktörsmetadata för skapare/låsning/ändring och eventuell personinformation om användare skriver det i fritext. | Webb-UI, REST API, CSV/PDF-export och SQL Server. | Fastställs av förvaltningen. V1 lagrar inte leverantörssvar, sekretessprövning eller leverantörsportaldata. | Kravområdesförvaltning för frågebanken; kravunderlagsansvariga och medförfattare för kravunderlagets RFI-lista. | [datamodell](./database-schema.md), [arkitektur](./arkitekturbeskrivning-kravhantering.md) |
| Kravunderlag och lokala krav | Sätta samman kravurval för upphandling, leverans eller förvaltning och följa lokala kravbeslut. | Kravurval, behovsreferenser, anteckningar, lokala kravtexter, användningsstatus och kopplingar till kravversioner. | Ja, om anteckningar eller lokala krav innehåller personuppgifter eller aktörsmetadata. | Webb-UI, REST API, rapporter/export och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Kravunderlagsansvariga och kravunderlagsmedförfattare är appnära uppdrag, inte slutligt informationsägarskap. | [datamodell](./database-schema.md), [arkitektur](./arkitekturbeskrivning-kravhantering.md), [RBAC-plan](./plan-RBAC.md) |
| Avvikelser och förbättringsförslag | Dokumentera avsteg, beslut, förbättringsförslag och uppföljning kopplad till krav. | Motivering, beslutsunderlag, status, skapare, beslutsfattare, lösning och kommentarer. | Ja. Aktörsfält, namn, HSA-id och fritext kan innehålla personuppgifter. | Webb-UI, REST API, rapporter/export, säkerhetsaudit vid riskmutationer och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Appen kan visa besluts- och skaparspår, men ägarskap för informationen beslutas i förvaltningen. | [datamodell](./database-schema.md), [riskanalys](./riskanalys.txt), [Admin Center](./admin-center.md) |
| Ägare, uppdrag och behörighetsöversyn | Stödja ansvar i kravområden, kravunderlag och återkommande granskning av appstyrda uppdrag. | Ägarnamn, e-post, HSA-id, kravområde, kravunderlag, medförfattare, behörighetsöversynsbeslut och exportreferenser. | Ja. Uppgifterna identifierar levande personer och används för spårbarhet och ansvar. | Webb-UI, Admin Center, REST API, behörighetsöversynsexport och SQL Server. | Fastställs av förvaltningen. Radering av personuppgifter och personuppgiftsutdrag finns som separat Admin Center-stöd, men ersätter inte beslutade retentionregler. | Fastställs av förvaltningen. Appstyrda uppdrag har tekniska ansvarsrader, medan formella roll- och informationsägare fastställs i organisationen. | [Admin Center](./admin-center.md), [rollista](./rollista-rbac-auth.txt), [personuppgiftsutdrag](./privacy-data-subject-access-export.md) |
| Identitet, session och säkerhetsaudit | Säkerställa inloggning, behörighet, spårbarhet och säkerhetsuppföljning. | OIDC-claims, sessionstillstånd, roller, HSA-id, request-id, klient-IP, authhändelser, MCP-aktör och auditdetaljer. | Ja. Session och audit kan innehålla HSA-id, namn, roller, IP-adress och händelsedata. | OIDC-/IdP-tjänst, webb-UI, MCP-tokenvalidering, plattformsloggning, SIEM eller annan auditmottagare. | Fastställs av förvaltningen och driftplattformen. Applikationen skriver säkerhetsaudit till loggström men äger inte loggplattformens retention. | Fastställs av förvaltningen och driftorganisationen. | [auth-beskrivning](./auth-how-it-works.md), [Admin Center](./admin-center.md), [riskanalys](./riskanalys.txt) |
| AI-assisterat författande | Stödja kravförfattare med förslag baserade på ämne, instruktioner, bilder och taxonomi. | Prompt, ämne, bildinnehåll, taxonomival, modellval, AI-svar och metadata om användning. | Ja, om användaren matar in personuppgifter eller sekretessbelagt material i prompt eller bild. | Webb-UI, OpenRouter och valda modellleverantörer när AI är aktiverat, samt SQL Server om AI-svar sparas som kravinformation. | Fastställs av förvaltningen. AI-assisterat författande ska behandlas som stödflöde och inte som fristående långtidsarkiv. | Fastställs av förvaltningen. Användning och leverantörsbedömning ska beslutas i ordinarie dataskydds- och leverantörsstyrning. | [AI-dokumentation](./reference-data-and-ai.md), [riskanalys](./riskanalys.txt), [arkitektur](./arkitekturbeskrivning-kravhantering.md) |
| Rapporter och exporter | Dela kravbibliotek, kravdetaljer, historik, behörighetsöversynsevidens och personuppgiftsutdrag i läsbart format. | CSV, PDF, rapporthuvuden, kravdetaljer, historik, behörighetsöversynsunderlag och personuppgiftsutdrag. | Ja, om källdata innehåller aktörer, ägare, HSA-id, kommentarer eller annan personinformation. | Slutanvändare, Admin Center, webbläsare, rapportmottagare och eventuell vidarebehandling utanför applikationen. | Fastställs av förvaltningen. Exporterade filer hamnar utanför applikationens tekniska kontroll. | Fastställs av förvaltningen. Mottagare ansvarar för hantering efter export enligt organisationens regler. | [rapporter](./reports.md), [Admin Center](./admin-center.md), [personuppgiftsutdrag](./privacy-data-subject-access-export.md) |
<!-- markdownlint-enable MD013 -->

## Artikel 32-bedömning av personuppgiftsskydd

Den här bedömningen avser appens avsiktliga identitets- och kontaktfält:
namn, e-post, HSA-id, aktörsfält, ägar- och uppdragsfält samt
säkerhetsauditens metadata. Personuppgifterna avser anställda eller
medarbetare och behöver kunna ses av andra behöriga anställda för ansvar,
spårbarhet, handläggning, behörighetsöversyn och historik.

För nuvarande användningsfall bedöms fältvis applikationskryptering och
pseudonymisering därför inte vara nödvändigt eller relevant. Sådana skydd
skulle försämra de verksamhetsfunktioner som uppgifterna finns för att stödja,
utan att ge proportionerlig riskreduktion när åtkomsten redan ska styras av
autentisering, rollstyrning, behörighetsöversyn och behörighetskontroller.

Befintliga appnära skydd är:

- federerad autentisering och validerad HSA-identitet
- rollstyrda admin- och dataskyddsflöden
- behörighetsöversyn för appstyrda uppdrag
- krypterad och signerad sessionscookie samt krypterad SQL-transport
- redigerad säkerhetsaudit som inte ska bära hemligheter eller råa
  mål-HSA-id i händelsedetaljer
- Radering av personuppgifter och personuppgiftsutdrag för HSA-id-baserade
  identitetsfält
- policy och hjälptexter som säger att fritextfält inte ska innehålla namn
  eller andra uppgifter som identifierar levande personer

Beslutet ska omprövas om Kravhantering börjar behandla externa personer,
känsligare personuppgifter, särskilt skyddsvärda personuppgifter eller
avsiktliga personuppgifter i fritext. Förvaltningen och driftorganisationen
behöver fortsatt verifiera skydd för vilande databaslagring, backup,
nyckelhantering, loggplattform och behörighet till driftloggar.

Kravansvarsperson kan också bära flaggan `hasProtectedPersonalData`, mappad
från HSA `hsaProtectedPerson`, för att visa att HSA-personposten har skyddade
personuppgifter. Flaggan transporteras och exporteras men ger ännu ingen
särskild UI-maskering eller gallringsregel; sådan policy beslutas separat.

## Gallrings- och arkiveringsmatris

Kravhanterings funktionella kravarkivering är inte samma sak som
dataskyddsgallring. Ett krav kan vara arkiverat i livscykeln och fortfarande
behöva finnas kvar som verksamhetshistorik. Arkivexport betyder här att
verksamhetsspåret bevaras utanför applikationens aktiva databas och att
personidentifierande aktörsuppgifter avidentifieras i exporten när de inte
längre behöver vara läsbara i applikationen.

<!-- markdownlint-disable MD013 -->
| Informationsmängd | När aktiv läsbar information inte längre behövs | Gallringsåtgärd | Arkivering och avidentifiering | Undantag | Ansvar |
| --- | --- | --- | --- | --- | --- |
| Beslutade avvikelser och lokala avvikelser | När beslutet är fattat och beslutad lagringstid efter beslut/uppdatering har passerat. | Gallra inte beslutsraden automatiskt om beslutet behövs som historik. | Exportera avvikelse och beslut med avidentifierade aktörsfält innan eventuell borttagning. | Pågående granskning, öppet ärende, revision eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Åtgärdade förbättringsförslag | När förslaget är löst/avfärdat och beslutad lagringstid har passerat. | Gallra eller arkivera enligt policy. | Exportera förslagets verksamhetsinnehåll med avidentifierad skapare och lösningsaktör när historik behövs. | Förslag som fortfarande är öppna, granskas eller behövs för release-/revisionsspår. | Förvaltning och dataskyddshandläggare. |
| Kravansvarsperson utan kravansvarstilldelning | När kravansvarspersonen inte längre pekas ut av kravområden, kravunderlag eller kravpaket och beslutad lagringstid har passerat. | Radera kravansvarspersonens lokala personrad. | Ingen separat arkivpost i applikationen. | Kravansvarsperson som fortfarande pekas ut av aktuell eller påbörjad kravansvarstilldelning, aktivt arbete, dokumenterat verksamhetsbehov eller legal hold. | Dataskyddshandläggare. |
| Oanvänd taxonomi | När kravområde saknar aktuella kravkopplingar, eller när kravpaket eller normreferens saknar aktuella krav-/lokalkravkopplingar, och inte har uppdaterats på minst 730 dagar. | Radera taxonomiraden direkt efter förhandsgranskning och bekräftelse. | Ingen separat arkivexport i v1; raden saknar beslutad versionshistorik i den aktiva databasen. | Rad som fortfarande refereras av krav, kravversioner, lokala krav genom paket/normreferens eller dokumenterat verksamhetsbehov/legal hold. | Förvaltning och dataskyddshandläggare. |
| Arkiverade kravurvalsfrågor och kravurvalssvar | När frågan eller svaret har varit arkiverat i minst 365 dagar. | Radera frågan eller svaret och dess länkar till kravpaket eller krav. | Ingen separat arkivexport krävs eftersom sparad kravunderlagshistorik blockerar gallringskandidaten. | Frågor eller svar som fortfarande refereras av `specification_requirement_selection_answers`, färsk arkivering, aktivt arbete eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Arkiverade RFI-frågor och hanterade RFI-frågeförslag | När frågan eller förslaget inte längre behövs som förvaltningshistorik och beslutad lagringstid har passerat. | Gallra eller arkivera enligt policy. Låsta RFI-listor i kravunderlag kan fortsätta referera historiska frågeversioner. | Exportera kravunderlagets RFI-lista vid behov innan kravunderlaget arkiveras eller raderas. | RFI-frågeversioner som refereras av låsta kravunderlag, öppna förslag, revision eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Gamla kravversioner utan kravunderlagsberoende | När versionen är Arkiverad i minst 365 dagar, har varit i vanlig Granskning i minst 365 dagar eller har varit Utkast utan redigering i minst 365 dagar, och aldrig har kopplats till kravunderlag. | Radera join-rader för paket/normreferenser och därefter versionsraden; radera kravets huvudrad om inga versioner återstår. | Ingen kravunderlagsexport krävs eftersom `has_specification_item_history = false`; kravtext som kan behöva historik ska inte matcha policyn. | Aktuell kravunderlagskoppling, tidigare kravunderlagshistorik, arkiveringsgranskning, aktivt arbete eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Kravunderlag utanför förvaltning | När kravunderlaget saknar status `Förvaltning` eller har annan status och inte har uppdaterats på minst 730 dagar. | Radera kravunderlaget och dess lokala krav, behovsreferenser och kravunderlagskopplingar först efter exportbekräftelse. | Exportera anonymiserad JSON med metadata, behovsreferenser, lokala krav, kopplade bibliotekskrav, den kravunderlagskopplade kravversionens egenskaper, taxonomietiketter, paket, normreferenser och avvikelser. Bibliotekskrav raderas inte av denna policy. | Kravunderlag i `Förvaltning`, pågående granskning/upphandling, aktivt uppdrag, dokumenterat verksamhetsbehov eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Behörighetsöversyner | När översynen är slutförd/avbruten och beslutad lagringstid har passerat. | Gallra inte evidensraden automatiskt i v1. | Exportera översynsbeviset med avidentifierade aktörsfält när personidentifiering inte längre behövs. | Årlig revision, pågående åtgärd, externa revisionskrav eller legal hold. | Förvaltning, säkerhetsfunktion och dataskyddshandläggare. |
| Säkerhetsaudit och driftloggar | Fastställs av drift- och säkerhetsförvaltning utifrån spårbarhetskrav. | Hanteras i plattformsloggning/SIEM, inte av appens SQL-retention. | Appen ska inte skriva råa mål-HSA-id:n i loggar för gallring. | Incident, incidentutredning, revisionskrav och andra krav på loggbevarande. | Drift- och säkerhetsförvaltning. |
| Exporterade filer och backup | När informationen lämnar applikationen eller ingår i backupkedjan. | Hanteras i mottagande lagringsyta eller backup-/restore-rutin. | Applikationens retention ändrar inte redan exporterade filer eller backupkopior. | Avtalade backup-, revisions- och återläsningskrav. | Driftorganisation och mottagare av export. |
<!-- markdownlint-enable MD013 -->

Admin Center har en separat flik för Arkivering med retention-preview, export
och körning via `/api/admin/archiving/*`. Flödet använder policyer för att
hitta kandidater, visar vilka rader som kräver arkivexport eller kan raderas
direkt, stödjer undantag/legal hold och loggar körningen utan råa mål-HSA-id:n
eller fritextvärden. Avidentifiering ska ske i arkivexporten, inte genom att
blanda ihop radering av personuppgifter och arkivering i samma vy. Faktiska
lagringstider och beslutsreferenser ska fastställas av förvaltningen innan
produktionskörning.

## Systemkomponenter

<!-- markdownlint-disable MD013 -->
| Systemkomponent | Roll i lösningen | Berörd information | Förvaltningsnotering |
| --- | --- | --- | --- |
| Next.js webbapp och REST API | Primärt användargränssnitt och HTTP-API för krav, kravunderlag, Admin Center, rapporter och dataskyddsflöden. | Alla appnära informationsmängder som användaren har behörighet till. | Driftmodell, åtkomst, informationsklassning och formellt systemägarskap fastställs av förvaltningen. |
| Microsoft SQL Server via TypeORM | Persistens för kravinformation, historik, taxonomi, ägare, uppdrag, avvikelser, förbättringsförslag och Admin Center-data. | Strukturerad verksamhetsinformation och personuppgifter i databastabeller. | Backup, återläsning, databasretention, kryptering och driftansvar fastställs av förvaltningen och driftorganisationen. |
| Auth och session | OIDC-inloggning, sessionshantering, rolltolkning, HSA-id-validering och CSRF-skydd. | Identitetsuppgifter, roller, sessionstillstånd och request-kontext. | IdP-kontrakt, MFA-krav, sessionstid och identitetslivscykel fastställs av förvaltningen tillsammans med IdP-ägare. |
| MCP-gränssnitt | Externt tekniskt gränssnitt för godkända AI-agenter och klienter till kravfunktioner. | Kravinformation, historik, statusövergångar och verifierad MCP-aktör. | Godkända klienter, klientägare, behörighetsomfång och eventuell vidarebehandling fastställs i förvaltningens integrationsstyrning. |
| Rapport- och exportfunktioner | Skapar CSV, PDF och maskinläsbara exportunderlag för verksamhets- och dataskyddsbehov. | Den information som ingår i användarens valda rapport eller export. | Exportmottagare, klassningsmärkning, lagring och gallring efter nedladdning fastställs av förvaltningen. |
| Säkerhetsaudit | Skriver strukturerade säkerhetshändelser till plattformsloggning. | Aktör, händelsetyp, request-id, klient-IP, beslut och redigerade detaljer. | Loggskydd, SIEM-routning, retention och behörighet till loggverktyg fastställs av drift- och säkerhetsförvaltning. |
<!-- markdownlint-enable MD013 -->

## Integrationer och externa beroenden

<!-- markdownlint-disable MD013 -->
| Integration eller beroende | Användning | Information som kan beröras | Vad förvaltningen behöver föra vidare |
| --- | --- | --- | --- |
| OIDC-/IdP-tjänst | Inloggning, tokenutbyte, JWKS-hämtning, utloggning och MCP-tokenvalidering. | Identitetsattribut, roller, HSA-id, tokenmetadata och sessionsrelaterade uppgifter. | IdP-ägare, dataskyddsroll, geografisk behandling, MFA-krav, incidentkontakt och ansvar för identitetslivscykel. |
| MCP-klienter och AI-agenter | Godkända tekniska klienter som anropar `/api/mcp`. | Kravinformation, historik, mutationer, statusövergångar och klientens aktörsidentitet. | Klientägare, `client_id`, behörighetsomfång, loggkrav, notifieringsansvar och om klienten är intern integration eller extern part. |
| OpenRouter och valda modellleverantörer | AI-assisterat författande när `OPENROUTER_API_KEY` är aktiverad. | Prompt, instruktioner, bilder, taxonomi, modellval, AI-svar och användningsmetadata. | Leverantörsbedömning, dataskyddsroll, datapolicy, retention, egress, sekretessklassning och revisionsstatus. |
| Driftplattform, reverse proxy, loggning och SIEM | Runtime, TLS-terminering, hemlighetshantering, begärandeloggning och säkerhetsaudit. | Trafikmetadata, driftloggar, säkerhetsloggar, sessionscookies i transit och miljöparametrar. | Plattformsägare, geografisk driftplats, loggretention, åtkomst till loggar/hemligheter, incidentväg och tekniska säkerhetskrav. |
| CI/CD-, paket- och containerkedja | Bygg, test, beroendehämtning, containerbas och säkerhetskontroller. | Källkod, byggloggar, dependency metadata och syntetisk testdata. | Leveranskedjeansvar, godkända källor, åtkomst till byggloggar, secrets policy och beslut om produktionsdata inte får behandlas där utan särskilt godkännande. |
<!-- markdownlint-enable MD013 -->

### Underleverantörer vid egen lokal drift

Vid en installation i kundens egen lokala driftmiljö ska
förvaltningen först skilja på interna driftfunktioner och externa
parter. Om kunden själv driver applikationsvärd, SQL Server,
Keycloak eller annan IdP, reverse proxy, loggning, SIEM och backup
inom den egna organisationen finns normalt inga externa
underleverantörer som behandlar systemets informationsmängder
enbart genom installationen.

Följande ska dokumenteras som underleverantör eller
personuppgiftsbiträde när funktionen utförs av extern part eller
extern tjänst: drift- eller plattformspartner, databasdrift,
extern DBA, IdP, loggning, SIEM, övervakning, backup,
arkivlagring, support med åtkomst till loggar, databasutdrag eller
export, externa MCP-klienter eller AI-agenter samt OpenRouter och
modellleverantörer när AI-assisterat författande är aktiverat.

Programvaruleverantörer, paketkällor, containerregister och
publika containerkällor räknas i normalfallet som
beroenden i leveranskedjan, inte underleverantörer. De ska bara
föras in som underleverantörer om de får produktionsdata, loggar,
telemetri, supportpaket, fjärråtkomst eller annan faktisk åtkomst
till informationsmängderna.

## Överlämning till förvaltningen

Förvaltningen bör använda detta dokument som indata till organisationens
ordinarie register och styrning. Minsta överlämning är:

1. Skapa eller uppdatera poster för informationsmängderna i
   tillgångsförteckningen.
2. Koppla informationsmängderna till rätt systemkomponenter och integrationer.
3. Fastställ rättslig grund, ändamål, registrerade, mottagare,
   informationsklassning, retention, gallring och ägarskap.
4. Dokumentera vilka externa parter som är tekniska integrationer,
   underleverantörer, personuppgiftsbiträden eller interna stödtjänster.
5. Granska underlaget vid större ändringar i Kravhantering och minst enligt
   organisationens ordinarie granskningscykel.
