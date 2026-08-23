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

Posterna om AI-anslutningskonfiguration och AI-integrationslager beskriver den
leverantörsneutrala implementationens operativa informationsmängder och
komponenter.

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
| Kravbibliotek och kravversioner | Förvalta gemensamma krav, status, historik och spårbarhet över tid. | Kravtext, acceptanskriterier, status, risknivå, verifieringsmetod, normreferenser, versionshistorik. | Ja, när aktörs- eller ägarfält kopplas till versionshistorik. Kravtext kan också innehålla personuppgifter om användare matar in sådana uppgifter. | Webb-UI, REST API, MCP, CSV/PDF-export och SQL Server. | Fastställs av förvaltningen. Applikationens arkivering är funktionell kravarkivering och ersätter inte dataskyddsgallring. | Fastställs av förvaltningen. Kravområden har appnära ägarstöd, men formellt informationsägarskap beslutas utanför repo:t. | [datamodell](../reference/database-schema.md), [kravlivscykel](../governance/lifecycle-workflow.md), [MCP](../integrations/mcp-server-contributor-guide.md), [rapporter](../reference/reports.md) |
| Kravurvalsfrågor och kravurvalssvar | Förvalta frivilliga urvalsfrågor som hjälper användare att välja relevanta bibliotekskrav i kravunderlag. | Kod för fråga, frågetext, svarstext, hjälptext, status, arkiveringsdatum samt länkar till kravpaket eller publicerade krav. | Nej, utöver eventuell personinformation som användare själva skriver in i fritext. | Webb-UI, REST API, rapporter/export och SQL Server. | Arkiverade frågor och svar kan gallras efter 365 dagar när inga sparade kravunderlagssvar fortfarande refererar dem. | Förvaltning och dataskyddshandläggare. | [datamodell](../reference/database-schema.md), [Admin Center](../governance/admin-center.md) |
| RFI-frågor och RFI-frågelistor | Förvalta generiska RFI-frågor per kravområde och stödja skriftlig dialog inför kravurval utan att lagra leverantörssvar. | RFI-frågekod, frågeversion, frågetext, syftestext, önskat svarsformat, rådgivande länkar, kravunderlagets scope, låsning och relevansbedömning. | Ja, aktörsmetadata för skapare/låsning/ändring och eventuell personinformation om användare skriver det i fritext. | Webb-UI, REST API, CSV/PDF-export och SQL Server. | Arkiverade RFI-frågor och historiska RFI-frågeversioner kan gallras efter 730 dagar när inga RFI-listor eller RFI-frågeförslag refererar dem. V1 lagrar inte leverantörssvar, sekretessprövning eller leverantörsportaldata. | Kravområdesförvaltning för frågebanken; kravunderlagsansvariga och medförfattare för kravunderlagets RFI-lista. | [datamodell](../reference/database-schema.md), [UI](../governance/requirements-ui-behaviour.md), [Admin Center](../governance/admin-center.md) |
| Kravunderlag och lokala krav | Sätta samman kravurval för upphandling, leverans eller förvaltning och följa lokala kravbeslut. | Kravurval, behovsreferenser, anteckningar, lokala kravtexter, användningsstatus och kopplingar till kravversioner. | Ja, om anteckningar eller lokala krav innehåller personuppgifter eller aktörsmetadata. | Webb-UI, REST API, rapporter/export och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Kravunderlagsansvariga och kravunderlagsmedförfattare är appnära uppdrag, inte slutligt informationsägarskap. | [datamodell](../reference/database-schema.md), [UI](../governance/requirements-ui-behaviour.md), [rapporter](../reference/reports.md), [uppdragsbaserad RBAC](../adr/0012-uppdragsbaserad-rbac.md) |
| Avvikelser och förbättringsförslag | Dokumentera avsteg, beslut, förbättringsförslag och uppföljning kopplad till krav. | Motivering, beslutsunderlag, status, skapare, beslutsfattare, lösning och kommentarer. | Ja. Aktörsfält, namn, HSA-id och fritext kan innehålla personuppgifter. | Webb-UI, REST API, rapporter/export, säkerhetsaudit vid riskmutationer och SQL Server. | Fastställs av förvaltningen. | Fastställs av förvaltningen. Appen kan visa besluts- och skaparspår, men ägarskap för informationen beslutas i förvaltningen. | [datamodell](../reference/database-schema.md), [riskanalys](./riskanalys.txt), [Admin Center](../governance/admin-center.md) |
| Ägare, uppdrag och behörighetsöversyn | Stödja ansvar i kravområden, kravunderlag och återkommande granskning av appstyrda uppdrag. | Ägarnamn, e-post, HSA-id, kravområde, kravunderlag, medförfattare, behörighetsöversynsbeslut och exportreferenser. | Ja. Uppgifterna identifierar levande personer och används för spårbarhet och ansvar. | Webb-UI, Admin Center, REST API, behörighetsöversynsexport och SQL Server. | Fastställs av förvaltningen. Radering av personuppgifter och personuppgiftsutdrag finns som separat Admin Center-stöd, men ersätter inte beslutade retentionregler. | Fastställs av förvaltningen. Appstyrda uppdrag har tekniska ansvarsrader, medan formella roll- och informationsägare fastställs i organisationen. | [Admin Center](../governance/admin-center.md), [rollista](./rollista-rbac-auth.txt), [personuppgiftsutdrag](./privacy-data-subject-access-export.md) |
| Identitet, session och säkerhetsaudit | Säkerställa inloggning, behörighet, spårbarhet och säkerhetsuppföljning. | OIDC-claims, sessionstillstånd, roller, HSA-id, request-id, klient-IP, authhändelser, MCP-aktör och auditdetaljer. | Ja. Session och audit kan innehålla HSA-id, namn, roller, IP-adress och händelsedata. | OIDC-/IdP-tjänst, webb-UI, MCP-tokenvalidering, plattformsloggning, SIEM eller annan auditmottagare. | Fastställs av förvaltningen och driftplattformen. Applikationen skriver säkerhetsaudit till loggström men äger inte loggplattformens retention. | Fastställs av förvaltningen och driftorganisationen. | [auth-beskrivning](./auth-how-it-works.md), [Admin Center](../governance/admin-center.md), [riskanalys](./riskanalys.txt) |
| Tillfälliga MCP-importvalideringar | Möjliggöra granskning och atomär körning av en validerad Kravimportfil samt begränsa resursförbrukning. | Inskickad import, valideringsresultat, körningskvitto, destinationssnapshot, TTL, reserverade byte och nycklad HMAC-fingerprint för skapande principal; separat aggregerat antal lyckade skapanden per 10-minutersfönster. | Ja, pseudonymiserad principalfingerprint och eventuella personuppgifter som användaren själv har skrivit i importinnehållet. Rått HSA-id lagras inte i sessionen eller anropsgränsposten. | MCP, app-runtime, Admin Center Privacy, personuppgiftsutdrag och SQL Server. | Kortlivad teknisk undantagslagring till TTL. Utgångna sessioner och anropsgränsposter gallras i begränsade batcher. Dataskyddsradering kan ta bort exakta fingerprintträffar och ogiltigförklarar då token. | Applikationsförvaltning, driftorganisation och dataskyddshandläggare. | [datamodell](../reference/database-schema.md), [MCP](../integrations/mcp-server-user-guide.md), [gallring](../operations/transient-state-cleanup.md) |
| AI-assisterat författande | Stödja kravförfattare med förslag baserade på ämne, instruktioner, bilder och taxonomi. | AI-anropets ämne, bildinnehåll, taxonomival, AI-svar och användningsmetadata. | Ja, om användaren matar in personuppgifter eller sekretessbelagt material i text eller bild. | Webb-UI och den AI-leverantör eller agentmiljö som nås genom den administratörsgodkända AI-anslutningen, samt SQL Server om AI-svar sparas som kravinformation. | Integritetsminimumet förbjuder att leverantören använder anropsdata för träning och kräver nollagring för varje serverägt AI-anrop. AI-assisterat författande är ett stödflöde, inte ett fristående långtidsarkiv. | Fastställs av förvaltningen. Aktuell bevisning för den exakta leverantörs- och modellvägen måste visa att integritetsminimumet kan uppfyllas före aktivering. | [AI-dokumentation](../governance/reference-data-and-ai.md), [ADR 0051](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md), [ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md), [ADR 0053](../adr/0053-integritetsminimum-for-ai-anrop.md) |
| AI-anslutningskonfiguration och leverantörshemligheter | Styra godkända AI-anslutningar, verifierade anslutningsmodellrevisioner och stabila körprofiler. | Anslutningsadress, attest, datapolicy, verifieringsbevis, förmågor, profilkonfigurationsversion, krypterad leverantörshemlighet och root-key-version. | Nej i avsedd strukturerad konfiguration. Attestfält får endast använda opaka organisationsreferenser och får aldrig innehålla namn, e-postadresser, HSA-id eller andra identifierare för levande personer. | Admin Center, app-runtime och SQL Server; extern root-keyring distribueras separat till appnoderna. | En oanvänd modellrevision kan avslutas och raderas permanent; tillhörande bevis och en tom modellbehållare raderas samtidigt. Gammal chiffertext raderas efter verifierad rotation och återkallad leverantörshemlighet. Anslutningar, attester och kvarvarande styrmetadata har ingen Admin Arkivering-policy, utan bevaras som operativ styrkonfiguration tills produktförvaltningen beslutar annat. Root-key-versioner bevaras så länge databasrader eller återställningsbara backuper behöver dem. | Produktadministratören och produktförvaltningen äger livscykeln och besluten om bevarande och gallring för styrkonfigurationen. Driften äger root-keyring, distribution, backup och återställning. | [ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md), [ADR 0056](../adr/0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md), [driftrutin](../operations/ai-connections.md) |
| Tillfällig AI-körkoordinering | Samordna FIFO-kö, samtidighet, retry och leases mellan appnoder. | Slumpmässiga kör- och konfigurations-ID:n, köordning, tillstånd, räknare och tidsgränser. Inga instruktioner, bilder, modellsvar, endpoints, hemligheter eller feltexter. | Nej. Identifierarna är opaka tekniska ID:n och får inte härledas från användar- eller innehållsdata. | App-runtime, SQL Server och schemalagd transient cleanup. | Raden raderas vid terminalutfall och annars efter ursprunglig total tidsgräns eller utgången körlease. Schemalagd cleanup tar bort kvarlämnade rader; ingen apparkivering eller legal hold. | Applikationsförvaltning för koordinationskontraktet och driftorganisationen för SQL-/cleanup-drift. | [datamodell](../reference/database-schema.md), [AI-driftrutin](../operations/ai-connections.md), [cleanup](../operations/transient-state-cleanup.md) |
| Tidsbegränsad AI-forensisk evidensinsamling | Utreda ett avgränsat AI-säkerhetsproblem efter uttrycklig begäran och oberoende godkännande. | Maskerade och storleksbegränsade utdrag från blockerad AI-indata eller AI-utdata, regel-id, tidsstämplar, insamlingsmetadata och insamlingsspecifikt aktörsfingeravtryck. | Ja. Utdrag kan fortfarande innehålla personuppgifter trots maskering; HSA-id-snapshots finns i styrposten och aktören i evidensraden är pseudonymiserad. | Endast SQL Server, Admin/Privacy Officer som är ursprunglig begärande eller godkännande part, Admin Center Dataskydd och personuppgiftsutdrag. Ingen stdout-, logg- eller SIEM-kopia skapas av evidenskanalen. | Insamling 5–60 minuter. Evidens gallras automatiskt 72 timmar efter stopp eller utgång; manuell Privacy Officer-gallring och dataskyddsradering kan ske tidigare. | Säkerhetsförvaltning för incidentändamålet, Privacy Officer för godkännande/gallring och driftorganisationen för SQL-/backupskydd. | [ADR 0050](../adr/0050-tidsbegransat-sql-lager-for-ai-forensisk-evidens.md), [datamodell](../reference/database-schema.md), [cleanup](../operations/transient-state-cleanup.md) |
| Rapporter och exporter | Dela kravbibliotek, kravdetaljer, historik, behörighetsöversynsevidens och personuppgiftsutdrag i läsbart format. | CSV, PDF, rapporthuvuden, kravdetaljer, historik, behörighetsöversynsunderlag och personuppgiftsutdrag. | Ja, om källdata innehåller aktörer, ägare, HSA-id, kommentarer eller annan personinformation. | Slutanvändare, Admin Center, webbläsare, rapportmottagare och eventuell vidarebehandling utanför applikationen. | Fastställs av förvaltningen. Exporterade filer hamnar utanför applikationens tekniska kontroll. | Fastställs av förvaltningen. Mottagare ansvarar för hantering efter export enligt organisationens regler. | [rapporter](../reference/reports.md), [Admin Center](../governance/admin-center.md), [personuppgiftsutdrag](./privacy-data-subject-access-export.md) |
| Operativa applikationsinställningar | Styra gemensamma resursgränser för CSV-exporter och stora PDF-rapporter. | Heltalsgränser för antal krav, filstorlek, samtidighet, timeout och PDF-worker-minne samt tekniska tidsstämplar. | Nej. Tabellen innehåller inte aktör, fritext eller verksamhetsinnehåll. | Admin Center, app-runtime och SQL Server. | Singleton-raden behålls som aktiv driftkonfiguration och omfattas inte av verksamhetsinformationens gallringsflöden. Ändringar spåras separat i säkerhetsaudit. | Applikationsförvaltning och driftorganisation. | [datamodell](../reference/database-schema.md), [Admin Center](../governance/admin-center.md), [kapacitet](../operations/capacity-management.md) |
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
personuppgifter. I ett behörigt och ändamålsbundet tilldelningsflöde visas den
verifierade identiteten utan generell maskering. Gränssnittet visar samtidigt
en skyddsvägledning som begränsar användningen till uppdraget, uppmanar till
minskad spridning och hänvisar till regionens dataskydds-, säkerhets- eller
HR-funktion. Flaggan ger ingen separat gallringsregel.

### Särskilt skydd för AI-forensiskt evidenslager

Det AI-forensiska evidenslagret ligger i separata SQL-tabeller och omfattas av den
versionsbundna runtime-rollen: appen får skapa/läsa/radera evidens men
inte uppdatera innehållet. SQL-transport är krypterad. Kryptering av SQL-data
i vila, backupkryptering och nyckelrotation är ett uttryckligt driftkrav och
måste verifieras i den lokala driftmiljön; applikationen inför inte en egen
fältkrypteringsnyckel.

En Admin kan endast begära ett tidsfönster. En annan person med rollen
Privacy Officer måste godkänna, och SQL Server-tid stoppar insamlingen senast
vid angiven utgång. Läsning tillåts först efter stopp eller utgång och endast
för den verifierade HSA-identitet som begärde eller godkände fönstret.
Svar är känsliga och `no-store`. Aktivering, stopp, utgång, läsning och
gallring ger endast metadata i säkerhetsaudit. Evidensdata, hemligheter och
direkta identiteter får aldrig skrivas till vanlig logg eller stdout.

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
| Oanvänd taxonomi | När kravområde saknar aktuella kravkopplingar, kravpaket saknar aktuella kravkopplingar, eller normreferens saknar aktuella krav-/lokalkravkopplingar, och inte har uppdaterats på minst 730 dagar. | Radera taxonomiraden direkt efter förhandsgranskning och bekräftelse. | Ingen separat arkivexport i v1; raden saknar beslutad versionshistorik i den aktiva databasen. | Rad som fortfarande refereras av krav, kravversioner, lokala krav genom normreferens eller dokumenterat verksamhetsbehov/legal hold. | Förvaltning och dataskyddshandläggare. |
| Arkiverade kravurvalsfrågor och kravurvalssvar | När frågan eller svaret har varit arkiverat i minst 365 dagar. | Radera frågan eller svaret och dess länkar till kravpaket eller krav. | Ingen separat arkivexport krävs eftersom sparad kravunderlagshistorik blockerar gallringskandidaten. | Frågor eller svar som fortfarande refereras av `specification_requirement_selection_answers`, färsk arkivering, aktivt arbete eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Arkiverade RFI-frågor och historiska RFI-frågeversioner | När frågan eller frågeversionen har varit utan aktuell användning i minst 730 dagar. | Radera historiska RFI-frågeversioner och arkiverade RFI-frågor som saknar RFI-listreferenser. Rådgivande länkar från RFI-frågeversionen raderas före frågeversionen. | Ingen separat arkivexport krävs eftersom RFI-listreferenser blockerar gallringskandidaten. Kravunderlagets RFI-lista exporteras i stället vid behov innan kravunderlaget arkiveras eller raderas. | RFI-frågeversioner och RFI-frågor som refereras av kravunderlagets RFI-lista, arkiverade RFI-frågor som refereras av RFI-frågeförslag, färsk arkivering, revision eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Gamla kravversioner utan kravunderlagsberoende | När versionen är Arkiverad i minst 365 dagar, har varit i vanlig Granskning i minst 365 dagar eller har varit Utkast utan redigering i minst 365 dagar, och aldrig har kopplats till kravunderlag. | Radera join-rader för paket/normreferenser och därefter versionsraden; radera kravets huvudrad om inga versioner återstår. | Ingen kravunderlagsexport krävs eftersom `has_specification_item_history = false`; kravtext som kan behöva historik ska inte matcha policyn. | Aktuell kravunderlagskoppling, tidigare kravunderlagshistorik, arkiveringsgranskning, aktivt arbete eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Kravunderlag utanför förvaltning | När kravunderlaget saknar status `Förvaltning` eller har annan status och inte har uppdaterats på minst 730 dagar. | Radera kravunderlaget och dess lokala krav, behovsreferenser och kravunderlagskopplingar först efter exportbekräftelse. | Exportera anonymiserad JSON med metadata, behovsreferenser, lokala krav, kopplade bibliotekskrav, den kravunderlagskopplade kravversionens egenskaper, taxonomietiketter, paket, normreferenser och avvikelser. Bibliotekskrav raderas inte av denna policy. | Kravunderlag i `Förvaltning`, pågående granskning/upphandling, aktivt uppdrag, dokumenterat verksamhetsbehov eller legal hold. | Förvaltning och dataskyddshandläggare. |
| Behörighetsöversyner | När översynen är slutförd/avbruten och beslutad lagringstid har passerat. | Gallra inte evidensraden automatiskt i v1. | Exportera översynsbeviset med avidentifierade aktörsfält när personidentifiering inte längre behövs. | Årlig revision, pågående åtgärd, externa revisionskrav eller legal hold. | Förvaltning, säkerhetsfunktion och dataskyddshandläggare. |
| Säkerhetsaudit och driftloggar | Fastställs av drift- och säkerhetsförvaltning utifrån spårbarhetskrav. | Hanteras i plattformsloggning/SIEM, inte av appens SQL-retention. | Appen ska inte skriva råa mål-HSA-id:n i loggar för gallring. | Incident, incidentutredning, revisionskrav och andra krav på loggbevarande. | Drift- och säkerhetsförvaltning. |
| Tillfälliga MCP-importvalideringar och anropsgränsposter | När `expires_at <= SYSUTCDATETIME()`. | Radera i begränsade, överlappningssäkra batcher via den schemalagda cleanup-tjänsten. Dataskyddsradering får radera en exakt principalfingerprint före TTL och ogiltigförklarar då berörda token. | Ingen arkivering; lagringen är ett uttryckligt kortlivat tekniskt undantag. Personuppgiftsutdrag visar endast säker metadata, aldrig token, importnyttolast, valideringsresultat eller destinationsnamn. | Pågående ej utgången session; incidenthantering i externa loggsystem påverkar inte SQL-radens TTL. | Driftorganisation och dataskyddshandläggare. |
| Tidsbegränsad AI-forensisk evidensinsamling | 72 timmar efter manuellt stopp eller SQL-tidsstyrd utgång. | Schemalagd cleanup raderar evidens i begränsade batcher och markerar styrposten som gallrad. Privacy Officer kan gallra omedelbart; dataskyddsradering stoppar och gallrar matchande fönster samt exakta aktörsfingeravtryck. | Ingen Admin Arkivering-policy och ingen arkivexport. Detta är ett uttryckligt appnära gallringsundantag: den fasta säkerhetsgränsen får inte förlängas med legal hold i appen. Metadata-only säkerhetsaudit kan finnas kvar enligt loggplattformens separata beslut. | Återläsning från backup får inte göra utgången evidens operativt åtkomlig; driftorganisationen måste återköra cleanup efter restore och låta backupkopior löpa ut enligt beslutad backupretention. | Säkerhetsförvaltning, Privacy Officer och driftorganisation. |
| Tillfällig AI-körkoordinering | Omedelbart vid terminalutfall; annars när total tidsgräns eller körlease har gått ut enligt SQL Server-tid. | Körvägen raderar raden transaktionellt. Schemalagd cleanup gallrar kvarlämnade rader i begränsade, överlappningssäkra batcher. | Ingen arkivering, export eller legal hold; tabellen är ett innehållsfritt tekniskt undantag. | Efter databasåterställning ska cleanup köras innan AI-trafik släpps så att utgångna kö- och leaserader inte återaktiveras. | Applikationsförvaltning och driftorganisation. |
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
| AI-integrationslager | Väljer administratörsstyrd körprofil, tillämpar integritetsminimumet och utför avgränsade AI-anrop genom en adapter. | AI-anropets text och bilder, fullständigt AI-svar, användningsmetadata och opaka spårnings-ID:n. | AI-anslutningar, anslutningsmodeller, förmågepolicy, säkerhetsgrindar och drifttelemetri styrs enligt ADR 0051 och ADR 0052. ADR 0053 kräver att varje serverägt anrop förbjuder träning och använder nollagring; saknad eller otillräcklig bevisning stoppar anropet före egress. |
| Rapport- och exportfunktioner | Skapar CSV, PDF och maskinläsbara exportunderlag för verksamhets- och dataskyddsbehov. | Den information som ingår i användarens valda rapport eller export. | Exportmottagare, klassningsmärkning, lagring och gallring efter nedladdning fastställs av förvaltningen. |
| Säkerhetsaudit | Skriver strukturerade säkerhetshändelser till plattformsloggning. | Aktör, händelsetyp, request-id, klient-IP, beslut och redigerade detaljer. | Loggskydd, SIEM-routning, retention och behörighet till loggverktyg fastställs av drift- och säkerhetsförvaltning. |
<!-- markdownlint-enable MD013 -->

## Integrationer och externa beroenden

<!-- markdownlint-disable MD013 -->
| Integration eller beroende | Användning | Information som kan beröras | Vad förvaltningen behöver föra vidare |
| --- | --- | --- | --- |
| OIDC-/IdP-tjänst | Inloggning, tokenutbyte, JWKS-hämtning, utloggning och MCP-tokenvalidering. | Identitetsattribut, roller, HSA-id, tokenmetadata och sessionsrelaterade uppgifter. | IdP-ägare, dataskyddsroll, geografisk behandling, MFA-krav, incidentkontakt och ansvar för identitetslivscykel. |
| MCP-klienter och AI-agenter | Godkända tekniska klienter som anropar `/api/mcp`. | Kravinformation, historik, mutationer, statusövergångar och klientens aktörsidentitet. | Klientägare, `client_id`, behörighetsomfång, loggkrav, notifieringsansvar och om klienten är intern integration eller extern part. |
| AI-leverantörer och agentmiljöer | AI-assisterat författande genom en administratörsgodkänd AI-anslutning. | AI-anropets text, bilder och användningsmetadata samt AI-svar. | Leverantörsbedömning, dataskyddsroll, datapolicy, retention, egress, informationsklass, attest och anslutningsmodellrevision. |
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
export, externa MCP-klienter eller AI-agenter samt AI-leverantörer och
agentmiljöer bakom aktiva AI-anslutningar när AI-assisterat författande är
aktiverat. AI-anslutningen ska inte räknas som en extern part i sig; den
identifierar den godkända kopplingen till behandlingsparten.

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
