<!-- cSpell:words dataskyddsstyrning förvaltningsunderlag källevidens -->
<!-- cSpell:words vidarebehandlas kravversioner kravhistorik kravarkivering -->
<!-- cSpell:words kravunderlagsberoende kravunderlagsexport -->
<!-- cSpell:words kravunderlagshistorik kravunderlagskopplade -->
<!-- cSpell:words kravunderlagskoppling kravunderlagskopplingar -->
<!-- cSpell:words kravversionens lokalkravkopplingar -->
<!-- cSpell:words appnära kravlivscykel kravbeslut aktörsmetadata appstyrda -->
<!-- cSpell:words retentionregler authhändelser auditdetaljer auditmottagare -->
<!-- cSpell:words kravförfattare kravdata kravfunktioner routning -->
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
| Kravbibliotek och kravversioner | Förvalta gemensamma krav, status, historik och spårbarhet över tid. | Kravtext, acceptanskriterier, status, risknivå, verifieringsmetod, normreferenser, versionshistorik. | Ja, när aktörs- eller ägarfält kopplas till kravhistorik. Kravtext kan också innehålla personuppgifter om användare matar in sådana uppgifter. | Webb-UI, REST API, MCP, CSV/PDF-export och SQL Server. | Fastställs av förvaltningen. Applikationens arkivering är funktionell kravarkivering och ersätter inte dataskyddsgallring. | Fastställs av förvaltningen. Kravområden har appnära ägarstöd, men formellt informationsägarskap beslutas utanför repo:t. | [datamodell](./database-schema.md), [kravlivscykel](./lifecycle-workflow.md), [arkitektur](./arkitekturbeskrivning-kravhantering.md) |
| Kravunderlag och lokala krav | Sätta samman kravurval för upphandling, leverans eller förvaltning och följa lokala kravbeslut. | Kravurval, behovsreferenser, anteckningar, lokala kravtexter, användningsstatus och kopplingar till kravversioner. | Ja, om anteckningar eller lokala krav innehåller personuppgifter eller aktörsmetadata. | Webb-UI, REST API, rapporter/export och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Ansvariga för kravunderlag och medförfattare är appnära uppdrag, inte slutligt informationsägarskap. | [datamodell](./database-schema.md), [arkitektur](./arkitekturbeskrivning-kravhantering.md), [RBAC-plan](./plan-RBAC.md) |
| Avvikelser och förbättringsförslag | Dokumentera avsteg, beslut, förbättringsförslag och uppföljning kopplad till krav. | Motivering, beslutsunderlag, status, skapare, beslutsfattare, lösning och kommentarer. | Ja. Aktörsfält, namn, HSA-id och fritext kan innehålla personuppgifter. | Webb-UI, REST API, rapporter/export, säkerhetsaudit vid riskmutationer och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Appen kan visa besluts- och skaparspår, men ägarskap för informationen beslutas i förvaltningen. | [datamodell](./database-schema.md), [riskanalys](./riskanalys.txt), [Admin Center](./admin-center.md) |
| Ägare, uppdrag och behörighetsöversyn | Stödja ansvar i kravområden, kravunderlag och återkommande granskning av appstyrda uppdrag. | Ägarnamn, e-post, HSA-id, område, kravunderlag, medförfattare, access review-beslut och exportreferenser. | Ja. Uppgifterna identifierar levande personer och används för spårbarhet och ansvar. | Webb-UI, Admin Center, REST API, access review-export och SQL Server. | Fastställs av förvaltningen. GDPR-radering och dataportabilitet finns som separat Admin Center-stöd, men ersätter inte beslutade retentionregler. | Fastställs av förvaltningen. Appstyrda uppdrag har tekniska ansvarsrader, medan formella roll- och informationsägare fastställs i organisationen. | [Admin Center](./admin-center.md), [rollista](./rollista-rbac-auth.txt), [dataportabilitet](./privacy-data-portability.md) |
| Identitet, session och säkerhetsaudit | Säkerställa inloggning, behörighet, spårbarhet och säkerhetsuppföljning. | OIDC-claims, sessionstillstånd, roller, HSA-id, request-id, klient-IP, authhändelser, MCP-aktör och auditdetaljer. | Ja. Session och audit kan innehålla HSA-id, namn, roller, IP-adress och händelsedata. | OIDC-/IdP-tjänst, webb-UI, MCP-tokenvalidering, plattformsloggning, SIEM eller annan auditmottagare. | Fastställs av förvaltningen och driftplattformen. Applikationen skriver säkerhetsaudit till loggström men äger inte loggplattformens retention. | Fastställs av förvaltningen och driftorganisationen. | [auth-beskrivning](./auth-how-it-works.md), [Admin Center](./admin-center.md), [riskanalys](./riskanalys.txt) |
| AI-generering | Stödja kravförfattare med förslag baserade på ämne, instruktioner, bilder och taxonomi. | Prompt, ämne, bildinnehåll, taxonomival, modellval, AI-svar och metadata om användning. | Ja, om användaren matar in personuppgifter eller sekretessbelagt material i prompt eller bild. | Webb-UI, OpenRouter och valda modellleverantörer när AI är aktiverat, samt SQL Server om AI-svar sparas som kravdata. | Fastställs av förvaltningen. AI-generering ska behandlas som stödflöde och inte som fristående långtidsarkiv. | Fastställs av förvaltningen. Användning och leverantörsbedömning ska beslutas i ordinarie dataskydds- och leverantörsstyrning. | [AI-dokumentation](./reference-data-and-ai.md), [riskanalys](./riskanalys.txt), [arkitektur](./arkitekturbeskrivning-kravhantering.md) |
| Rapporter och exporter | Dela kravbibliotek, kravdetaljer, historik, access review-evidens och dataskyddsexport i läsbart format. | CSV, PDF, rapporthuvuden, kravdetaljer, historik, access review-underlag och data subject export. | Ja, om källdata innehåller aktörer, ägare, HSA-id, kommentarer eller annan personinformation. | Slutanvändare, Admin Center, webbläsare, rapportmottagare och eventuell vidarebehandling utanför applikationen. | Fastställs av förvaltningen. Exporterade filer hamnar utanför applikationens tekniska kontroll. | Fastställs av förvaltningen. Mottagare ansvarar för hantering efter export enligt organisationens regler. | [rapporter](./reports.md), [Admin Center](./admin-center.md), [dataportabilitet](./privacy-data-portability.md) |
<!-- markdownlint-enable MD013 -->

## Artikel 32-bedömning av personuppgiftsskydd

Den här bedömningen avser appens avsiktliga identitets- och kontaktfält:
namn, e-post, HSA-id, aktörsfält, ägar- och uppdragsfält samt
säkerhetsauditens metadata. Personuppgifterna avser anställda eller
medarbetare och behöver kunna ses av andra behöriga anställda för ansvar,
spårbarhet, handläggning, behörighetsgranskning och historik.

För nuvarande användningsfall bedöms fältvis applikationskryptering och
pseudonymisering därför inte vara nödvändigt eller relevant. Sådana skydd
skulle försämra de verksamhetsfunktioner som uppgifterna finns för att stödja,
utan att ge proportionerlig riskreduktion när åtkomsten redan ska styras av
autentisering, rollstyrning, access review och behörighetskontroller.

Befintliga appnära skydd är:

- federerad autentisering och validerad HSA-identitet
- rollstyrda admin- och dataskyddsflöden
- access review för appstyrda uppdrag
- krypterad och signerad sessionscookie samt krypterad SQL-transport
- redigerad säkerhetsaudit som inte ska bära hemligheter eller råa
  mål-HSA-id i händelsedetaljer
- GDPR-radering och dataportabilitet för HSA-id-baserade identitetsfält
- policy och hjälptexter som säger att fritextfält inte ska innehålla namn
  eller andra uppgifter som identifierar levande personer

Beslutet ska omprövas om Kravhantering börjar behandla externa personer,
känsligare personuppgifter, särskilt skyddsvärda personuppgifter eller
avsiktliga personuppgifter i fritext. Förvaltningen och driftorganisationen
behöver fortsatt verifiera skydd för vilande databaslagring, backup,
nyckelhantering, loggplattform och behörighet till driftloggar.

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
| Fristående ägare utan aktiva uppdrag | När ägaren inte längre är kopplad till kravområden eller kravunderlag och beslutad lagringstid har passerat. | Radera ägarposten. | Ingen separat arkivpost i applikationen. | Ägare som fortfarande är kopplad till kravområden, kravpaket eller annan aktiv ansvarsyta. | Dataskyddshandläggare. |
| Oanvänd taxonomi | När kravområde, kravpaket eller normreferens saknar aktuella krav-/lokalkravkopplingar och inte har uppdaterats på minst 730 dagar. | Radera taxonomiraden direkt efter förhandsgranskning och bekräftelse. | Ingen separat arkivexport i v1; raden saknar beslutad kravhistorik i den aktiva databasen. | Rad som fortfarande refereras av krav, lokala krav, kravversioner eller dokumenterat verksamhetsbehov/legal hold. | Förvaltning och dataskyddshandläggare. |
| Gamla kravversioner utan kravunderlagsberoende | När versionen är Arkiverad i minst 365 dagar, har varit i vanlig Granskning i minst 365 dagar eller har varit Utkast utan redigering i minst 365 dagar, och aldrig har kopplats till kravunderlag. | Radera join-rader för paket/normreferenser och därefter versionsraden; radera kravets huvudrad om inga versioner återstår. | Ingen kravunderlagsexport krävs eftersom `has_specification_item_history = false`; kravtext som kan behöva historik ska inte matcha policyn. | Aktuell kravunderlagskoppling, tidigare kravunderlagshistorik, arkiveringsgranskning, aktivt arbete eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Kravunderlag utanför förvaltning | När kravunderlaget saknar status `Förvaltning` eller har annan status och inte har uppdaterats på minst 730 dagar. | Radera kravunderlaget och dess lokala krav, behovsreferenser och kravunderlagskopplingar först efter exportbekräftelse. | Exportera anonymiserad JSON med metadata, behovsreferenser, lokala krav, kopplade bibliotekskrav, den kravunderlagskopplade kravversionens egenskaper, taxonomietiketter, paket, normreferenser och avvikelser. Bibliotekskrav raderas inte av denna policy. | Kravunderlag i `Förvaltning`, pågående granskning/upphandling, aktivt uppdrag, dokumenterat verksamhetsbehov eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Behörighetsöversyner | När översynen är slutförd/avbruten och beslutad lagringstid har passerat. | Gallra inte evidensraden automatiskt i v1. | Exportera översynsbeviset med avidentifierade aktörsfält när personidentifiering inte längre behövs. | Årlig revision, pågående åtgärd, externa revisionskrav eller legal hold. | Förvaltning, säkerhetsfunktion och dataskyddshandläggare. |
| Säkerhetsaudit och driftloggar | Fastställs av drift- och säkerhetsförvaltning utifrån spårbarhetskrav. | Hanteras i plattformsloggning/SIEM, inte av appens SQL-retention. | Appen ska inte skriva råa mål-HSA-ID:n i loggar för gallring. | Incident, incidentutredning, revisionskrav och andra krav på loggbevarande. | Drift- och säkerhetsförvaltning. |
| Exporterade filer och backup | När informationen lämnar applikationen eller ingår i backupkedjan. | Hanteras i mottagande lagringsyta eller backup-/restore-rutin. | Applikationens retention ändrar inte redan exporterade filer eller backupkopior. | Avtalade backup-, revisions- och återläsningskrav. | Driftorganisation och mottagare av export. |
<!-- markdownlint-enable MD013 -->

Admin Center har en separat flik för Arkivering med retention-preview, export
och körning via `/api/admin/archiving/*`. Flödet använder policyer för att
hitta kandidater, visar vilka rader som kräver arkivexport eller kan raderas
direkt, stödjer undantag/legal hold och loggar körningen utan råa mål-HSA-ID:n
eller fritextvärden. Avidentifiering ska ske i arkivexporten, inte genom att
blanda ihop GDPR-radering och arkivering i samma vy. Faktiska lagringstider och
beslutsreferenser ska fastställas av förvaltningen innan produktionskörning.

## Systemkomponenter

<!-- markdownlint-disable MD013 -->
| Systemkomponent | Roll i lösningen | Berörd information | Förvaltningsnotering |
| --- | --- | --- | --- |
| Next.js webbapp och REST API | Primärt användargränssnitt och HTTP-API för krav, kravunderlag, Admin Center, rapporter och dataskyddsflöden. | Alla appnära informationsmängder som användaren har behörighet till. | Driftmodell, åtkomst, informationsklassning och formellt systemägarskap fastställs av förvaltningen. |
| Microsoft SQL Server via TypeORM | Persistens för kravdata, historik, taxonomi, ägare, uppdrag, avvikelser, förbättringsförslag och Admin Center-data. | Strukturerad verksamhetsinformation och personuppgifter i databastabeller. | Backup, återläsning, databasretention, kryptering och driftansvar fastställs av förvaltningen och driftorganisationen. |
| Auth och session | OIDC-inloggning, sessionshantering, rolltolkning, HSA-id-validering och CSRF-skydd. | Identitetsuppgifter, roller, sessionstillstånd och request-kontext. | IdP-kontrakt, MFA-krav, sessionstid och identitetslivscykel fastställs av förvaltningen tillsammans med IdP-ägare. |
| MCP-gränssnitt | Externt tekniskt gränssnitt för godkända AI-agenter och klienter till kravfunktioner. | Kravdata, historik, statusövergångar och verifierad MCP-aktör. | Godkända klienter, klientägare, behörighetsomfång och eventuell vidarebehandling fastställs i förvaltningens integrationsstyrning. |
| Rapport- och exportfunktioner | Skapar CSV, PDF och maskinläsbara exportunderlag för verksamhets- och dataskyddsbehov. | Den information som ingår i användarens valda rapport eller export. | Exportmottagare, klassningsmärkning, lagring och gallring efter nedladdning fastställs av förvaltningen. |
| Säkerhetsaudit | Skriver strukturerade säkerhetshändelser till plattformsloggning. | Aktör, händelsetyp, request-id, klient-IP, beslut och redigerade detaljer. | Loggskydd, SIEM-routning, retention och behörighet till loggverktyg fastställs av drift- och säkerhetsförvaltning. |
<!-- markdownlint-enable MD013 -->

## Integrationer och externa beroenden

<!-- markdownlint-disable MD013 -->
| Integration eller beroende | Användning | Information som kan beröras | Vad förvaltningen behöver föra vidare |
| --- | --- | --- | --- |
| OIDC-/IdP-tjänst | Inloggning, tokenutbyte, JWKS-hämtning, utloggning och MCP-tokenvalidering. | Identitetsattribut, roller, HSA-id, tokenmetadata och sessionsrelaterade uppgifter. | IdP-ägare, dataskyddsroll, geografisk behandling, MFA-krav, incidentkontakt och ansvar för identitetslivscykel. |
| MCP-klienter och AI-agenter | Godkända tekniska klienter som anropar `/api/mcp`. | Kravdata, historik, mutationer, statusövergångar och klientens aktörsidentitet. | Klientägare, `client_id`, behörighetsomfång, loggkrav, notifieringsansvar och om klienten är intern integration eller extern part. |
| OpenRouter och valda modellleverantörer | AI-generering av krav när `OPENROUTER_API_KEY` är aktiverad. | Prompt, instruktioner, bilder, taxonomi, modellval, AI-svar och användningsmetadata. | Leverantörsbedömning, dataskyddsroll, datapolicy, retention, egress, sekretessklassning och revisionsstatus. |
| Driftplattform, reverse proxy, loggning och SIEM | Runtime, TLS-terminering, hemlighetshantering, begärandeloggning och säkerhetsaudit. | Trafikmetadata, driftloggar, säkerhetsloggar, sessionscookies i transit och miljöparametrar. | Plattformsägare, geografisk driftplats, loggretention, åtkomst till loggar/hemligheter, incidentväg och tekniska säkerhetskrav. |
| CI/CD-, paket- och containerkedja | Bygg, test, beroendehämtning, containerbas och säkerhetskontroller. | Källkod, byggloggar, dependency metadata och syntetisk testdata. | Leveranskedjeansvar, godkända källor, åtkomst till byggloggar, secrets policy och beslut om produktionsdata inte får behandlas där utan särskilt godkännande. |
<!-- markdownlint-enable MD013 -->

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
