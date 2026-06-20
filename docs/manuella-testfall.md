<!-- cSpell:words AUTHZ areaco DevTools KUF noroles pkglead PkgCoAuthor -->
<!-- cSpell:words RetentionFresh RetentionLinked RetentionOrphan specco -->
<!-- markdownlint-disable MD033 -->

# Manuella testfall

Den här manualen används för riktad eller full manuell testning när
integrationstester inte kan köras. Testfallen utgår från lokal utvecklingsmiljö,
seedad SQL Server-databas och lokal Keycloak-realm.

Alla steg beskriver vad en testare ska göra i webbläsaren. När ett testfall
explicit anger API-kontroll ska den göras med `scripts/dev-curl.sh`, eftersom
vanlig `curl` inte använder samma lokala autentiseringsstöd.

## Innehåll

- [Konfigurerade användare](#konfigurerade-användare)
- [Allmän förberedelse](#allmän-förberedelse)
- [Autentisering och behörighet](#autentisering-och-behörighet)
  - [AUTH-01 till AUTH-11](#auth-01-logga-in-via-keycloak)
  - [AUTHZ-00 till AUTHZ-10](#authz-00-fas-0-testdata-och-identiteter)
- [Kravbibliotek](#kravbibliotek)
- [Skapa krav och livscykel](#skapa-krav-och-livscykel)
- [Samarbete i kravdetalj](#samarbete-i-kravdetalj)
- [Kravunderlag](#kravunderlag)
- [Avsteg](#avsteg)
- [Admincenter](#admincenter)
- [Dataskydd och personuppgifter](#dataskydd-och-personuppgifter)
- [Utvecklar- och robusthetsytor](#utvecklar--och-robusthetsytor)

## Konfigurerade användare

Alla konton använder lösenordet `devpass`. Kontona är endast för lokal
utveckling och test.

<!-- markdownlint-disable MD013 -->
| Användare | Visningsnamn | Roller | `employeeHsaId` | Testsyfte |
| --- | --- | --- | --- | --- |
| `olle.areaowner` | Olle AreaOwner | _(ingen)_ | `SE5560000001-areaowner1` | Kravområdesägare. |
| `cora.coauthor` | Cora CoAuthor | _(ingen)_ | `SE5560000001-areaco1` | Kravområdesmedförfattare. |
| `linnea.areaowner` | Linnéa AreaOwner | _(ingen)_ | `SE5560000001-linneab` | Bred dataskyddsyta och data för kravområden. |
| `petra.specresp` | Petra specresp | _(ingen)_ | `SE5560000001-specresp1` | Kravunderlagsansvarig. |
| `signe.speccoauthor` | Signe SpecCoAuthor | _(ingen)_ | `SE5560000001-specco1` | Kravunderlagsmedförfattare. |
| `leo.pkglead` | Leo PackageLead | _(ingen)_ | `SE5560000001-pkglead1` | Kravpaketsansvarig. |
| `paul.pkgcoauthor` | Paul PkgCoAuthor | _(ingen)_ | `SE5560000001-pkgco1` | Kravpaketsmedförfattare. |
| `rita.reviewer` | Rita Reviewer | `Reviewer` | `SE5560000001-reviewer1` | Granskningsflöden utan Admin. |
| `ada.admin` | Ada Admin | `Admin`, `PrivacyOfficer` | `SE5560000001-admin1` | Full Admin och dataskydd. |
| `only.admin` | Only Admin | `Admin` | `SE5560000001-admin2` | Admin utan dataskydd. |
| `disa.privacy` | Disa PrivacyOfficer | `PrivacyOfficer` | `SE5560000001-privacy1` | Dataskydd utan Admin. |
| `kalle.one` | Kalle Svensson | _(ingen)_ | `SE5560000001-kalle1` | Dubblettnamn och behörighetsöversyn. |
| `kalle.two` | Kalle Svensson | _(ingen)_ | `SE5560000001-kalle2` | Dubblettnamn. |
| `noah.noroles` | Noah NoRoles | _(ingen)_ | `SE5560000001-noroles1` | Negativa behörighetstester. |
<!-- markdownlint-enable MD013 -->

## Allmän förberedelse

1. Starta lokal IdP vid behov: `npm run idp:up`.
1. Återställ databas när testet kräver ren seed: `npm run db:setup`.
1. Starta applikationen: `npm run dev`.
1. Öppna `http://localhost:3000`.
1. Logga ut mellan rollkänsliga testfall.
1. Om Keycloak-data verkar gammal, återställ IdP enligt
   [auth-developer-workflow.md](./auth-developer-workflow.md).

Viktiga seedade ytor:

- Kravbibliotek: `/sv/requirements`.
- Nytt krav: `/sv/requirements/new`.
- Kravunderlag: `/sv/specifications`.
- Seedat kravunderlag: `/sv/specifications/AUTHZ-SPEC-2026`.
- Avsteg/livscykel: `/sv/specifications/PLAYWRIGHT-LIFECYCLE-2026`.
- Admincenter: `/sv/admin`.
- Dataskydd: `/sv/privacy`.
- Seedat kravområde för behörighet: `AUTHZ-AREA-2026` med prefix `AUTHZ`.
- Seedat kravpaket för behörighet: `AUTHZ kravpaket`.

Behörighetsmatrisen finns i [behörigheter.md](./behörigheter.md).

## Autentisering och behörighet

### AUTH-01: logga in via Keycloak

**Syfte:** Bekräfta att verklig OIDC-redirect och session fungerar.

**Användare:** `ada.admin`.

**Steg:**

1. Öppna `/sv/requirements` i en utloggad webbläsarsession.
1. Följ omdirigeringen till Keycloak.
1. Logga in som `ada.admin`.
1. Kontrollera användarmenyn i applikationen.

**Förväntat resultat:** Kravbiblioteket visas och användarmenyn visar
Admin-behörighet.

### AUTH-02: logga ut och kräv inloggning på skyddade sidor

**Syfte:** Säkerställa att utloggning tar bort åtkomst till skyddade vyer.

**Användare:** `ada.admin`.

**Steg:**

1. Logga in och öppna `/sv/admin`.
1. Logga ut via användarmenyn.
1. Öppna `/sv/admin` igen.

**Förväntat resultat:** Användaren skickas till inloggning och Admincenter
visas inte utan ny autentisering.

<a id="auth-03-anonym-api-begaran-ger-json-401"></a>

### AUTH-03: anonym API-begäran ger JSON 401

**Syfte:** Bekräfta att skyddade API:er returnerar maskinläsbart 401-svar.

**Användare:** Ingen inloggad användare.

**Steg:**

1. Logga ut ur applikationen.
1. Kör `scripts/dev-curl.sh GET /api/auth/me --anonymous`.
1. Upprepa mot en skyddad API-yta, till exempel `/api/requirements`.

**Förväntat resultat:** Svaret är HTTP 401 med JSON-body. Ingen HTML-login
returneras från API-anropet.

### AUTH-04: sessionsprojektion döljer råa tokenvärden

**Syfte:** Kontrollera att `/api/auth/me` bara visar säkra sessionsfält.

**Användare:** `ada.admin`.

**Steg:**

1. Logga in som `ada.admin`.
1. Kör `scripts/dev-curl.sh GET /api/auth/me`.
1. Kontrollera svarets fält.

**Förväntat resultat:** Svaret visar autentisering, HSA-id och roller men inte
råa access-, refresh- eller id-tokenvärden.

### AUTH-05: Admin kommer åt Admincenter

**Syfte:** Bekräfta positiv behörighet för global roll `Admin`.

**Användare:** `ada.admin`.

**Steg:**

1. Logga in som `ada.admin`.
1. Öppna `/sv/admin`.
1. Välj fliken `Taxonomi`.
1. Gör en ofarlig kontroll, till exempel att statusar och taxonomier listas.

**Förväntat resultat:** Admincenter laddar och Admin-flikar är användbara.

<a id="auth-06-admin-utan-dataskyddsroll-kan-inte-anvanda-dataskyddsflikar"></a>

### AUTH-06: Admin utan dataskyddsroll kan inte använda dataskyddsflikar

**Syfte:** Kontrollera att `Admin` inte automatiskt ger dataskyddsbehörighet.

**Användare:** `only.admin`.

**Steg:**

1. Logga in som `only.admin`.
1. Öppna `/sv/admin`.
1. Kontrollera att vanliga Admin-flikar visas.
1. Försök öppna dataskydds- eller gallringsytor som kräver
   `PrivacyOfficer`.

**Förväntat resultat:** Admin-ytor fungerar, men dataskyddsflikar saknas eller
nekas.

<a id="auth-07-dataskyddsansvarig-utan-adminbehorighet"></a>

### AUTH-07: dataskyddsansvarig utan Adminbehörighet

**Syfte:** Kontrollera att `PrivacyOfficer` inte ger Adminbehörighet.

**Användare:** `disa.privacy`.

**Steg:**

1. Logga in som `disa.privacy`.
1. Öppna `/sv/privacy`.
1. Kör en förhandsgranskning av personuppgifter för ett känt HSA-id.
1. Försök öppna Admincenter-flikar som `Åtgärdslogg` eller `Taxonomi`.

**Förväntat resultat:** Dataskyddsytor fungerar, men Admin-only-ytor nekas.

<a id="auth-08-anvandare-utan-roll-nekas-privilegierat-arbete"></a>

### AUTH-08: användare utan roll nekas privilegierat arbete

**Syfte:** Kontrollera negativ behörighet för användare utan global roll eller
ansvarstilldelning.

**Användare:** `noah.noroles`.

**Steg:**

1. Logga in som `noah.noroles`.
1. Öppna `/sv/admin`.
1. Öppna `/sv/specifications/AUTHZ-SPEC-2026`.
1. Försök nå API:er för Admin, AI-generering och ändring av kravunderlag med
   `scripts/dev-curl.sh`.

**Förväntat resultat:** UI visar nekad åtkomst eller saknade kontroller.
API:erna svarar 403 för privilegierade åtgärder.

### AUTH-09: felaktig auth-callback visar webbläsarfel

**Syfte:** Säkerställa att trasig callback inte skapar en halv session.

**Användare:** Ingen särskild.

**Steg:**

1. Öppna auth-callback med saknade eller felaktiga parametrar.
1. Kontrollera sidan som visas.
1. Öppna `/sv/requirements` efteråt.

**Förväntat resultat:** Callback-sidan visar ett tydligt fel och användaren måste
logga in på nytt.

<a id="auth-10-behorighetsmatris-for-ansvarstilldelningar"></a>

### AUTH-10: behörighetsmatris för ansvarstilldelningar

**Syfte:** Köra en snabb manuell kontroll mot behörighetsmatrisen.

**Användare:** Alla roll- och ansvarspersoner i tabellen ovan.

**Steg:**

1. Kontrollera varje global roll mot [behörigheter.md](./behörigheter.md).
1. Kontrollera varje ansvarstilldelning mot sitt ägda objekt.
1. För varje positiv åtgärd, gör en liten ändring och ladda om sidan.
1. För varje negativ åtgärd, kontrollera både UI-denial och API-denial när
   API-yta finns.
1. Öppna kravdetalj där användaren får läsa men inte ändra och kontrollera att
   sidan visar skrivskyddat läge utan livscykelkontroller.

**Förväntat resultat:** Varje användare får bara göra det som rollen eller
ansvarstilldelningen uttryckligen medger. Otillåtna åtgärder på kravets
detaljsida saknas eller är inaktiva redan i UI:t, och API:t nekar samma
åtgärd.

<a id="auth-11-playwrightfaser-for-behorighetsroller"></a>

### AUTH-11: Playwright-faser för behörighetsroller

**Syfte:** Säkerställa att de manuella testfallen speglar Playwright-filerna i
`tests/integration/authorization/*.spec.ts`.

**Användare:** Alla AUTHZ-användare.

**Steg:**

1. Gå igenom `AUTHZ-00` till `AUTHZ-10` nedan.
1. Jämför varje fas med motsvarande spec-fil och fasdokument.
1. Kontrollera att positiva och negativa behörighetspåståenden finns både i
   manual och automatiserade tester.

**Förväntat resultat:** Manual, fasdokument och spec-filer beskriver samma
behörighetsrisker.

### AUTHZ-00: Fas 0, testdata och identiteter

**Syfte:** Kontrollera att testmiljön innehåller alla separata personer och
AUTHZ-fixtures.

**Användare:** `ada.admin`.

**Steg:**

1. Logga in som `ada.admin`.
1. Öppna `/sv/admin` och kontrollera att applikationen fungerar efter seed.
1. Öppna `/sv/specifications/AUTHZ-SPEC-2026`.
1. Öppna `/sv/requirements` och sök efter kravområde eller prefix `AUTHZ`.
1. Öppna `Kravbiblioteksförvaltning` och sök efter `AUTHZ kravpaket`.

**Förväntat resultat:** Seedade AUTHZ-objekt finns och ansvarstilldelningarna
är fördelade på Olle, Cora, Petra, Signe, Leo och Paul enligt
användartabellen.

### AUTHZ-01: ingen global roll och ingen ansvarstilldelning

**Syfte:** Kontrollera att en användare utan roll inte kan utföra privilegierat
arbete.

**Användare:** `noah.noroles`.

**Steg:**

1. Logga in som `noah.noroles`.
1. Öppna `/sv/specifications/AUTHZ-SPEC-2026`.
1. Kontrollera att sidan inte visar redigerings- eller AI-kontroller.
1. Försök öppna `/sv/admin`.
1. Kör API-kontroll för att uppdatera `AUTHZ-SPEC-2026`.

**Förväntat resultat:** Läsning är bara tillåten där produkten medger det.
Privilegierade UI-kontroller saknas och API svarar 403.

### AUTHZ-02: kravområdesägare

**Syfte:** Kontrollera positiv och negativ behörighet för
kravområdesägare.

**Användare:** `olle.areaowner`.

**Steg:**

1. Logga in som `olle.areaowner`.
1. Öppna kravområdet `AUTHZ-AREA-2026` eller skapa en isolerad testyta.
1. Gör en liten tillåten ändring i kravområdets metadata eller skapa ett krav
   inom det ägda området.
1. Öppna radåtgärden `Hantera medförfattare` och verifiera att
   dialogen visar ett tilläggsfält överst, laddningsläge vid hämtning och en
   sparad tabell med kravområdesmedförfattare.
1. Ladda om sidan och kontrollera att ändringen finns kvar.
1. Försök administrera global Admin-yta och ändra kravunderlagsansvarig.

**Förväntat resultat:** Olle kan arbeta inom sitt kravområde men kan inte ta
Admin- eller kravunderlagsansvar utanför sin tilldelning.

### AUTHZ-03: kravområdesmedförfattare

**Syfte:** Kontrollera att kravområdesmedförfattare får bidra men inte styra
tilldelningar.

**Användare:** `cora.coauthor`.

**Steg:**

1. Logga in som `cora.coauthor`.
1. Öppna kravområdet `AUTHZ-AREA-2026`.
1. Skapa ett krav i det tilldelade kravområdet via API eller UI och verifiera
   att kravet sparas.
1. Försök ändra kravområdets ägare eller listan över medförfattare.
1. Kör API-kontroll mot samma otillåtna tilldelningsändring.

**Förväntat resultat:** Cora kan skapa krav inom området men får 403 för
tilldelningsstyrning och global Admin.

### AUTHZ-04: kravunderlagsansvarig

**Syfte:** Kontrollera att kravunderlagsansvarig kan styra sitt kravunderlag.

**Användare:** `petra.specresp`.

**Steg:**

1. Logga in som `petra.specresp`.
1. Öppna `/sv/specifications` och filtrera fram `AUTHZ-SPEC-2026`.
1. Öppna redigeringsåtgärden och ändra ett säkert metadatafält, till exempel
   verksamhetsbehovsreferens.
1. Stäng redigeringen och öppna radåtgärden `Hantera medförfattare`.
1. Kontrollera att tilläggsfältet ligger över den sparade tabellen och lägg
   till eller verifiera en kravunderlagsmedförfattare i dialogen.
1. Försök utföra Admin-only-åtgärd eller dataskyddsförhandsgranskning.

**Förväntat resultat:** Petra kan förvalta sitt kravunderlag och dess
tilldelningar men nekas global Admin och dataskydd.

### AUTHZ-05: kravunderlagsmedförfattare

**Syfte:** Kontrollera att kravunderlagsmedförfattare kan redigera innehåll men
inte delegera ansvar.

**Användare:** `signe.speccoauthor`.

**Steg:**

1. Logga in som `signe.speccoauthor`.
1. Öppna `/sv/specifications/AUTHZ-SPEC-2026`.
1. Gör en liten tillåten innehållsändring.
1. Ladda om sidan och verifiera att ändringen finns kvar.
1. Öppna kravunderlagslistan och försök hitta radåtgärden för att hantera
   medförfattare, och försök ändra kravunderlagsansvarig.

**Förväntat resultat:** Signe kan ändra innehåll men inte ändra ansvar eller
medförfattare.

### AUTHZ-06: kravpaketsansvarig

**Syfte:** Kontrollera att kravpaketsansvarig kan ändra sitt paket men inte
utföra Admin-only-åtgärder.

**Användare:** `leo.pkglead`.

**Steg:**

1. Logga in som `leo.pkglead`.
1. Öppna `Kravbiblioteksförvaltning` och sök efter `AUTHZ kravpaket`.
1. Redigera paketets beskrivning med en liten unik testtext.
1. Öppna radåtgärden `Hantera medförfattare` och verifiera att paketets
   kravpaketsmedförfattare visas i en sparad tabell och kan läggas till eller
   tas bort i den separata dialogen.
1. Ladda om sidan och verifiera att Leo fortfarande är kravpaketsansvarig.
1. Försök arkivera paketet om UI visar åtgärden, annars kontrollera API.

**Förväntat resultat:** Leo kan uppdatera paketmetadata men kan inte utföra
Admin-only-arkivering.

### AUTHZ-07: kravpaketsmedförfattare

**Syfte:** Kontrollera att kravpaketsmedförfattare kan bidra till paket men
inte ta över ansvar.

**Användare:** `paul.pkgcoauthor`.

**Steg:**

1. Logga in som `paul.pkgcoauthor`.
1. Öppna `AUTHZ kravpaket`.
1. Gör en tillåten innehållsändring om UI tillåter det.
1. Försök ändra kravpaketsansvarig eller öppna radåtgärden för att hantera
   medförfattare.
1. Kontrollera otillåten åtgärd med API om UI inte visar kontrollen.

**Förväntat resultat:** Paul får bara de paketåtgärder som
kravpaketsmedförfattare har behörighet till och nekas ansvarsstyrning.

### AUTHZ-08: Admin

**Syfte:** Kontrollera positiv Admin-behörighet och gräns mot dataskydd när
rollen saknas.

**Användare:** `ada.admin` och `only.admin`.

**Steg:**

1. Logga in som `ada.admin` och öppna `/sv/admin`.
1. Kontrollera Admin-flikar, åtgärdslogg och åtkomstöversyn.
1. Kontrollera att Ada även kan använda dataskyddsytor.
1. Logga ut och logga in som `only.admin`.
1. Upprepa Admin-kontrollen och försök använda dataskyddsflikar.

**Förväntat resultat:** Ada har både Admin och dataskydd. Only har Admin men
nekas dataskydd.

### AUTHZ-09: Reviewer

**Syfte:** Kontrollera att `Reviewer` kan granska men inte administrera.

**Användare:** `rita.reviewer`.

**Steg:**

1. Logga in som `rita.reviewer`.
1. Öppna en krav- eller avstegsgranskning som ligger i granskningsläge.
1. Utför en tillåten granskningsåtgärd.
1. Försök öppna Admincenter, dataskydd och ansvarstilldelnings-API.

**Förväntat resultat:** Rita kan utföra granskningsarbete men nekas Admin,
dataskydd och ansvarsstyrning.

### AUTHZ-10: dataskyddsansvarig

**Syfte:** Kontrollera att `PrivacyOfficer` kan hantera personuppgifter men
inte administrera taxonomi eller krav.

**Användare:** `disa.privacy`.

**Steg:**

1. Logga in som `disa.privacy`.
1. Öppna `/sv/privacy`.
1. Förhandsgranska personuppgifter för `SE5560000001-linneab`.
1. Exportera eller granska resultatet enligt dataskyddsflödet.
1. Försök öppna Admincenter och ändra krav-/paketansvar.

**Förväntat resultat:** Disa kan köra dataskyddsflöden men nekas Admin och
produktansvar som hon inte har.

## Kravbibliotek

### REQ-01: kravbiblioteket laddar seedade krav

**Syfte:** Kontrollera att huvudlistan visar seedade krav.

**Användare:** `ada.admin`.

**Steg:** Öppna `/sv/requirements`, vänta in tabellen och öppna ett känt krav
som `INT0001`.

**Förväntat resultat:** Listan laddar, kravets detalj visas och metadata är
läslig.

### REQ-02: språkbyte behåller användbar lista

**Syfte:** Kontrollera svensk/engelsk lokalisering.

**Steg:** Växla språk från kravbiblioteket och gå tillbaka till svenska.

**Förväntat resultat:** Tabellen fungerar efter språkbyte och svenska etiketter
återkommer.

### REQ-03: filtrera på krav-id och rensa filter

**Steg:** Sök efter `INT0001`, kontrollera träff, klicka `Rensa` och kontrollera
att fler krav visas.

**Förväntat resultat:** Filter begränsar listan och rensning återställer den.

### REQ-04: sortera på sorterbar kolumn

**Steg:** Klicka en sorterbar kolumnrubrik två gånger.

**Förväntat resultat:** Sorteringsindikator och radordning ändras konsekvent.

### REQ-05: kolumnväljare sparar synliga kolumner

**Steg:** Öppna kolumnväljaren, dölj en valfri kolumn, ladda om sidan och visa
kolumnen igen.

**Förväntat resultat:** Valet ligger kvar efter omladdning och kan återställas.

### REQ-06: återställ lokala listinställningar

**Steg:** Ändra filter eller kolumner och använd återställningsfunktionen.

**Förväntat resultat:** Kravbiblioteket återgår till standardvy.

### REQ-07: ändra bredd på tabellkolumn

**Steg:** Dra en kolumnkant horisontellt.

**Förväntat resultat:** Kolumnen ändrar bredd utan att tabellen blir oanvändbar.

### REQ-08: sticky header och flytande verktyg är användbara

**Steg:** Scrolla kravbiblioteket och använd den flytande åtgärdsytan.

**Förväntat resultat:** Header och åtgärder ligger kvar på ett läsbart sätt.

### REQ-09: innehållsordning i inline-detalj

**Steg:** Öppna ett krav i inline-detalj.

**Förväntat resultat:** Kravtext visas före acceptanskriterier och därefter
metadata, referenser och paket.

### REQ-10: rapport från kravlistan fungerar

**Steg:** Öppna rapport-/utskriftsmenyn från kravbiblioteket och välj en
listbaserad rapport.

**Förväntat resultat:** Rapporten öppnas eller laddas ned utan fel. PDF från
kravlistan innehåller bara publicerade kravversioner även om listan innehåller
krav med utkast eller granskning.

### REQ-11: svensk länk till krav omdirigerar till befintlig kravdetalj

**Steg:** Öppna `/krav/INT0001`, `/sv/krav/INT0001` och
`/en/krav/INT0001` i webbläsaren.

**Förväntat resultat:** Användaren hamnar på samma kravdetalj som via
`/requirements/INT0001`, `/sv/requirements/INT0001` respektive
`/en/requirements/INT0001`. Befintliga länkar till krav med `/requirements`
fortsätter att fungera.

### REQ-12: lokaliserad felåterhämtning

**Steg:** Öppna `/sv/error-boundary-test` och använd länken tillbaka till
kravbiblioteket.

**Förväntat resultat:** Felpanelen är på svenska och läcker inte stacktrace.

### REQ-13: detaljmenyer går att använda med tangentbord

**Steg:** Öppna `Dela` och `Skriv ut` i kravdetaljvyn med tangentbord, navigera
med piltangenter och stäng med Escape.

**Förväntat resultat:** Fokus hålls korrekt och kopiering annonseras.

### REQ-14: kravbiblioteksförvaltning hanterar paket och frågor

**Steg:**

1. Öppna `Kravbiblioteksförvaltning`.
1. Kontrollera `Kravpaket` och `Kravurvalsfrågor`.
1. Skapa ett testpaket och kontrollera att formuläret visar ansvarsinformation
   samt inloggad användare som kravpaketsansvarig utan redigerbart
   ansvarsfält.
1. Klicka antalet i kolumnen `Kopplade krav` och kontrollera att en
   skrivskyddad dialog öppnas för kravpaketets kopplade krav.
1. Filtrera, redigera och arkivera testpaketet.
1. Öppna samma skrivskyddade dialog via knappen i redigeringsformuläret och
   kontrollera att redigeringsformuläret ligger kvar när dialogen stängs.
1. Byt kravpaketsansvarig med HSA-id, tabba från suffixfältet och kontrollera
   att verifierat namn och e-post visas som text i bytesdialogen.
1. Öppna radåtgärden `Hantera medförfattare` för testpaketet och kontrollera
   att den separata dialogen har tilläggsfält överst, laddningsläge och en
   sparad tabell för att lägga till och ta bort kravpaketsmedförfattare.
1. Skapa en kravurvalsfråga, lägg till svar och ändra ordning.
1. Kontrollera synlighetsvillkor, hierarkimodal och kravurvalsförhandsvisning.

**Förväntat resultat:** Förvaltningsytorna ligger utanför Admincenter, paket
och frågor sparas korrekt, den som skapar kravpaketet blir
kravpaketsansvarig, ansvarspersoner hanteras med HSA-id och destruktiva
åtgärder kräver bekräftelse.

### REQ-15: AI-kravgenerator rensar scope-bundna resultat

**Steg:** Generera krav med valt kravområde, byt kravområde efter att resultat
visas och försök skapa.

**Förväntat resultat:** Resultat och skapa-knapp rensas när scope ändras.

## Skapa krav och livscykel

### LIFE-01: skapa krav från UI

**Steg:** Öppna `/sv/requirements/new`, kontrollera att Spara är dimmad, välj
kravområde, fyll kravtext och obligatoriska fält och kontrollera att Spara
tänds. Klicka Avbryt, avbryt förkastandet och kontrollera att formuläret är
kvar. Klicka Avbryt igen, bekräfta förkastandet och öppna formuläret på nytt
för att spara ett krav.

**Förväntat resultat:** Obligatoriska fält är markerade med asterisk och en
kort notis vid formulärets actionknappar förklarar markeringen. Spara är
dimmad tills användaren har gjort en normaliserad formulärändring. Kravet
skapas och öppnas i listan. Formulär med osparade ändringar stängs inte utan
bekräftelse.

### LIFE-02: validera obligatoriska fält vid skapande

**Steg:** Kontrollera att ett helt oförändrat formulär inte kan skickas. Gör
sedan en ofullständig ändring, till exempel fyll kravtext men lämna ett annat
obligatoriskt fält tomt, och försök skicka.

**Förväntat resultat:** Obligatoriska fält är markerade med asterisk,
fältfel visas och inget krav skapas.

### LIFE-03: skicka utkast till granskning

**Steg:** Öppna ett utkast och välj åtgärden för att skicka till granskning.

**Förväntat resultat:** Status ändras till granskning.

### LIFE-04: återför granskningskrav till utkast

**Steg:** Öppna krav i granskning och välj återför till utkast.

**Förväntat resultat:** Kravet blir utkast igen.

### LIFE-05: godkänn och publicera granskat krav

**Steg:** Öppna krav i granskning och godkänn publicering.

**Förväntat resultat:** Kravet blir publicerat.

### LIFE-06: skapa ny utkastversion från publicerat krav

**Steg:** Öppna publicerat krav och skapa ny version.

**Förväntat resultat:** En ny utkastversion skapas utan att historiken tappas.

### LIFE-07: återställ arkiverad kravversion

**Steg:** Öppna arkiverat krav och använd återställningsåtgärden.

**Förväntat resultat:** Kravet återställs till aktiv hantering.

### LIFE-08: avbryt initiering av arkivering

**Steg:** Starta arkivering och avbryt bekräftelsen.

**Förväntat resultat:** Kravet förblir oförändrat.

### LIFE-09: godkänn arkivering efter ett avbrutet godkännande

**Steg:** Starta arkivering, avbryt, starta igen och bekräfta.

**Förväntat resultat:** Endast den bekräftade arkiveringen genomförs.

### LIFE-10: avbryt arkivering efter avbruten åtgärd

**Steg:** Testa flödet för att avbryta pågående arkivering och bekräfta först andra
gången.

**Förväntat resultat:** Status följer den slutligt bekräftade åtgärden.

### LIFE-11: detaljrapporter finns per status

**Steg:** Öppna krav i utkast, granskning, publicerat och arkiverat läge och
kontrollera rapportmenyn.

**Förväntat resultat:** Tillgängliga rapporter matchar kravets status.
Rapporter för historik, granskning, kombinerad granskning och förslagshistorik
går bara att hämta när användaren har åtkomst till kravets historik.

### LIFE-12: publicering ersätter kravpaketsmedlemskap

**Steg:** Skapa eller välj ett publicerat krav som ingår i ett kravpaket.
Skapa en ny utkastversion med ett annat kravpaketsval. Öppna
kravpaketslistans dialog för kopplade krav innan publicering och kontrollera
att bara den publicerade föregångaren visas. Skicka utkastet till granskning
och publicera det. Öppna de berörda kravpaketens dialoger igen.

**Förväntat resultat:** Före publicering visar kravpaketet fortfarande den
publicerade föregångaren. Efter publicering visas den nya publicerade
kravversionen i sitt valda kravpaket, och föregångaren ligger inte kvar som
kopplat krav i det tidigare paketet.

### LIFE-13: arkivering utan efterträdare bevarar pakethistorik

**Steg:** Skapa eller välj ett publicerat krav som ingår i ett kravpaket.
Arkivera kravet utan att först skapa en ny kravversion. Öppna kravpaketets
dialog för kopplade krav och kontrollera praktisk användning, till exempel
kravurval till kravunderlag om paketet används där. Öppna därefter
kravbibliotekets kravlista, filtrera på samma kravpaket och välj status
`Arkiverad`.

**Förväntat resultat:** Den arkiverade kravversionens paketkoppling bevaras
som historik, men kravpaketets praktiska listor och urval använder inte det
arkiverade kravet som tillgängligt krav. Kravbibliotekets paketfilter kan
däremot visa det arkiverade kravet när användaren själv har valt status
`Arkiverad`.

## Samarbete i kravdetalj

### COL-01: lägg till krav i kravunderlag

**Steg:** Öppna ett krav, använd åtgärden för att lägga till i kravunderlag och
välj ett testunderlag.

**Förväntat resultat:** Kravet visas i valt kravunderlag.

### COL-02: registrera förbättringsförslag

**Steg:** Öppna ett krav och skapa ett förbättringsförslag.

**Förväntat resultat:** Förslaget visas med rätt status och skapare.

### COL-03: begär granskning av förbättringsförslag

**Steg:** Öppna ett förslag och skicka det till granskning.

**Förväntat resultat:** Status visar att granskning begärts.

### COL-04: lös förbättringsförslag

**Steg:** Öppna ett granskningsbart förslag, ange lösningskommentar och lös.

**Förväntat resultat:** Förslaget markeras som löst.

### COL-05: avvisa förbättringsförslag

**Steg:** Öppna ett förslag och avvisa med motivering.

**Förväntat resultat:** Förslaget får avvisad status och motiveringen sparas.

### COL-06: rapport för förslagshistorik innehåller förslag

**Steg:** Öppna rapport för förslagshistorik på ett krav med förslag.

**Förväntat resultat:** Rapporten innehåller förslagens status och historik.

### COL-07: metadata visar kravområdesägare och taxonomi

**Steg:** Öppna kravdetalj och granska metadata.

**Förväntat resultat:** Kravområdesägare, kategori, typ, kvalitetsegenskap,
paket och referenser visas.

## Kravunderlag

### SPEC-01: lista, filtrera och rensa kravunderlag

**Steg:** Öppna `/sv/specifications`, filtrera på `AUTHZ`, rensa filtret.

**Förväntat resultat:** Listan begränsas och återställs.

### SPEC-02: skapa nytt kravunderlag

**Steg:** Öppna skapa-dialogen och kontrollera att Spara är dimmad. Fyll unikt
ID och namn, klicka utanför dialogen och kontrollera att den inte stängs.
Klicka Avbryt och avbryt förkastandet. Lämna kravunderlagets livscykelstatus
tom och försök spara. Välj därefter livscykelstatus och spara.

**Förväntat resultat:** Spara är dimmad tills användaren har gjort en
normaliserad metadataändring. Formuläret stoppar sparning utan
livscykelstatus. Formulär med osparade ändringar kräver bekräftelse innan det
stängs, och
klick utanför dialogen stänger den inte. När livscykelstatus är vald skapas
kravunderlaget och öppnas.

### SPEC-03: redigera kravunderlag från titelåtgärd

**Steg:** Öppna detalj, använd titelns redigeringsåtgärd och kontrollera att
Spara är dimmad innan ändring. Ändra text, klicka X och avbryt
förkastandet. Spara ny text. Kontrollera att kravunderlagets livscykelstatus är
obligatorisk och inte kan blankas.

**Förväntat resultat:** Spara tänds först efter metadataändringen. X visar
bekräftelse innan formulär med osparade ändringar förkastas. Ändringen visas efter
omladdning och livscykelstatusen finns kvar.

### SPEC-04: ta bort kravunderlag med bekräftelse

**Steg:** Skapa tillfälligt kravunderlag, välj ta bort, avbryt först och
bekräfta sedan.

**Förväntat resultat:** Avbruten borttagning gör inget; bekräftad borttagning
tar bort underlaget.

### SPEC-05: delade listor scrollar oberoende

**Steg:** Öppna kravunderlagsdetalj med långa listor och scrolla respektive
panel.

**Förväntat resultat:** Panelerna påverkar inte varandras scrollposition.

### SPEC-06: lägg till och ta bort krav i kravunderlagsdetalj

**Steg:** Lägg till ett krav, kontrollera att det syns och ta sedan bort det.

**Förväntat resultat:** Kopplingen skapas och tas bort korrekt.

### SPEC-07: skapa och lyft unikt krav i kravunderlag

**Steg:** Skapa ett nytt krav direkt från kravunderlaget. Ändra
användningsstatus till ett annat läge än `Inkluderad` och lyft sedan kravet
till kravbiblioteket.

**Förväntat resultat:** Kravet får unikt ID och kopplas till underlaget. Lyft
skapar ett nytt utkast i kravbiblioteket oavsett användningsstatus, medan
källkravet ligger kvar i kravunderlaget.

### SPEC-08: uppdatera användningsstatus

**Steg:** Ändra status för ett krav i kravunderlaget.

**Förväntat resultat:** Statusen sparas och visas efter omladdning.

### SPEC-09: hantera behovsreferenser

**Steg:** Lägg till, redigera och ta bort behovsreferens.

**Förväntat resultat:** Referenser sparas och tas bort enligt användarens val.

### SPEC-10: generera upphandlingsrapport och Anbuds-CSV

**Steg:** Öppna ett kravunderlag med livscykelstatus `Upphandling`, öppna
rapportmenyn och välj `Kravbilaga för upphandling`. Öppna exportmenyn och välj
`Anbuds-CSV` samt `Full CSV-export`. Upprepa robusthetskontrollen med ett
kravunderlag vars ID innehåller mellanslag eller snedstreck.

**Förväntat resultat:** Rapporten genereras för hela kravunderlaget, sorterad
på Krav-ID, och innehåller bara Krav-ID, Kravtext, Kvalitetsegenskap med
ISO-kapitel och Normreferenser utan rå URI. `Anbuds-CSV` innehåller samma
kravfält och en separat Norm-URI-kolumn. `Full CSV-export` finns också.
Rapportlänken öppnas korrekt och CSV-exporten hanterar fel från servern eller
webbläsaren utan att bryta sidan.

### SPEC-10b: generera genomföranderapport för införande och utveckling

**Steg:** Öppna kravunderlag med livscykelstatus `Införande` respektive
`Utveckling`, öppna rapportmenyn och välj `Genomföranderapport`. Kontrollera även
exportmenyn.

**Förväntat resultat:** Rapporten genereras för hela kravunderlaget och
innehåller intern uppföljningsmetadata, kravversion, kravområde, kategori, typ,
kvalitetsegenskap, risknivå, kravversionsstatus, verifierbarhet,
behovsreferens, användningsstatus och normreferenser. `Anbuds-CSV` visas inte.
`Full CSV-export` visas.

### SPEC-10c: generera förvaltningsrapport

**Steg:** Öppna kravunderlag med livscykelstatus `Förvaltning`, öppna
rapportmenyn och välj `Förvaltningsrapport`.

**Förväntat resultat:** Rapporten återanvänder genomföranderapportens fält och
visar dessutom avstegssignal och rest från införande. Avvikna krav flaggas via
avstegssignalen, inte genom att räknas som implementerad rest.

### SPEC-10d: kravunderlagsrapporter kräver läsbehörighet

**Steg:** Försök öppna en kravunderlagsrapport eller CSV-export för ett
kravunderlag där användaren saknar läsbehörighet.

**Förväntat resultat:** Åtkomsten nekas innan rapport- eller exportdata visas.

### SPEC-11: återställ kolumnvyer för kravunderlag

**Steg:** Ändra kolumner i kravunderlagslistan och återställ.

**Förväntat resultat:** Standardkolumner visas igen.

### SPEC-12: svara på kravurvalsfrågor

**Steg:** Öppna kravunderlagets kravurvalsfrågor, välj svar och spara urval.

**Förväntat resultat:** Laddningstexten visas utan en tillfällig svarsräknare.
När frågorna har laddats visas svarsräknaren, till exempel `Besvarade: 0/1`.
Urvalet sparas och kravlistan uppdateras.

## Avsteg

### DEV-01: skapa avstegsutkast

**Steg:** Öppna avstegsyta, skapa utkast med motivering och spara.

**Förväntat resultat:** Avsteget sparas som utkast.

### DEV-02: begär avstegsgranskning

**Steg:** Öppna utkast och skicka till granskning.

**Förväntat resultat:** Status ändras till granskning.

### DEV-03: avbryt återföring till utkast

**Steg:** Starta återföring från granskning och avbryt bekräftelsen.

**Förväntat resultat:** Avsteget ligger kvar i granskning.

### DEV-04: godkänn avsteg

**Steg:** Som behörig kravgranskare, godkänn avsteg med kommentar.

**Förväntat resultat:** Avsteget markeras som godkänt och låses.

### DEV-05: avslå avsteg

**Steg:** Som behörig kravgranskare, avslå avsteg med kommentar.

**Förväntat resultat:** Avsteget markeras som avslaget och låses.

### DEV-06: beslutade avsteg är terminala

**Steg:** Öppna godkänt eller avslaget avsteg och försök ändra beslutet.

**Förväntat resultat:** Inga åtgärder för ny beslutscykel visas.

### DEV-07: användare utan roll kan inte besluta avsteg

**Steg:** Logga in som `noah.noroles`, öppna avsteg i granskning och försök
besluta via UI och API.

**Förväntat resultat:** UI saknar beslutsåtgärder och API svarar 403.

## Admincenter

### ADMIN-01: kolumnstandarder påverkar nya kravbiblioteksvyer

**Steg:** Som Admin, ändra standardkolumn och öppna kravbiblioteket i ny
session.

**Förväntat resultat:** Ny vy följer Admin-inställningen.

### ADMIN-02: taxonomi- och statussidor sparar ändringar

**Steg:** Öppna ett testbart taxonomi- eller statusformulär, kontrollera att
Spara är dimmad innan ändring, gör en liten ändring, klicka Avbryt och avbryt
förkastandet. Spara därefter ändringen.

**Förväntat resultat:** Spara tänds först efter ändringen. Formulär med
osparade ändringar kräver bekräftelse innan det stängs. Ändringen visas efter
omladdning.

### ADMIN-03: webbläsarens bakåtknapp återställer taxonomiflik

**Steg:** Öppna en Admin-flik, navigera vidare och använd bakåtknappen.

**Förväntat resultat:** Rätt flik och URL återställs.

### ADMIN-04: små skärmar kan använda Admin-flikar och åtgärder

**Steg:** Minska webbläsarbredden och kontrollera att Admin-navigering och
knappar går att använda.

**Förväntat resultat:** Kontrollerna överlappar inte och är klickbara.

### ADMIN-05: normbibliotek ligger under förvaltning

**Steg:** Öppna `Kravbiblioteksförvaltning` och kontrollera normbibliotekets
placering och länkar.

**Förväntat resultat:** Normbiblioteket finns i förvaltningsytan, inte som
taxonomiflik i Admincenter.

### ADMIN-06: ny normreferens använder responsiv formulärlayout

**Steg:** Öppna Normbibliotek, klicka `Ny normreferens` och jämför layout på
desktop respektive smal mobilbredd.

**Förväntat resultat:** Desktop visar formuläret i två kolumner med
Normreferens-ID sist och fullbrett. Mobil visar samma fält i en kolumn utan
överlapp.

### ADMIN-07: åtgärdslogg filtrerar och exporterar CSV

**Steg:** Öppna åtgärdslogg, filtrera på aktör eller händelse och exportera.

**Förväntat resultat:** Listan filtreras och CSV innehåller matchande rader.

### ADMIN-08: åtkomstöversyn, beslut och export

**Steg:** Öppna åtkomstöversyn, fatta ett testbeslut och exportera underlag.

**Förväntat resultat:** Beslut sparas och exporten innehåller beslutet.

### ADMIN-09: åtkomstöversyn avvisar för långa kommentarer

**Steg:** Ange kommentar som överskrider maxlängd och försök spara.

**Förväntat resultat:** Valideringsfel visas och beslutet sparas inte.

### ADMIN-10: arkiveringsgallring kräver dataskyddsroll

**Steg:** Jämför `only.admin` och `ada.admin` på gallringsförhandsgranskning.

**Förväntat resultat:** Only nekas; Ada kan förhandsgranska.

### ADMIN-11: status- och riskikoner visas på kravytor

**Steg:** Öppna kravlista, kravdetalj och rapport där status/risk visas.

**Förväntat resultat:** Ikoner och etiketter renderas konsekvent.

### ADMIN-12: arkiverad kravurvalsretention undantar sparad historik

**Steg:** Kör gallringsförhandsgranskning för arkiverade kravurvalsdata.

**Förväntat resultat:** Sparad historik undantas enligt retentionregeln.

### ADMIN-13: byte av kravområdesägare använder HSA-id

**Steg:** Öppna kravområdeslistan och kontrollera att radåtgärderna för
medförfattare, redigering och borttagning visas som ikonknappar. Öppna
radåtgärden `Hantera medförfattare` och kontrollera att den separata dialogen
kan läsa in, visa laddningsläge, lägga till och ta bort
kravområdesmedförfattare i en sparad tabell. Öppna sedan ett kravområde för
redigering. Kontrollera att formuläret öppnas i en modal, dra
beskrivningsfältet nedåt så långt webbläsaren tillåter och försök sedan minska
fältet under öppningshöjden. Ändra därefter kravområdesägare via HSA-id med
verifierat personuppslag.

**Förväntat resultat:** Listan visar ikonbaserade knappar för Hantera
medförfattare, Redigera och Ta bort. Medförfattare hanteras i en separat modal,
inte i metadataformuläret. Beskrivningsfältet begränsas av fönstrets höjd så
att Spara och Avbryt fortfarande är åtkomliga, och fältet kan inte minskas
under öppningshöjden. Ägarskapet sparas på HSA-id och visas med persondetaljer.
Efter nästa lyckade ändring kan den inloggade aktörens egen levande personrad
uppdateras från sessionen utan att inloggning eller sparande fördröjs.

### ADMIN-14: HSA-id-prefix administreras från Identitet

**Steg:** Öppna fliken `Identitet`, lägg till eller ändra ett testprefix och
kontrollera valideringen.

**Förväntat resultat:** Prefixet sparas och används i HSA-id-validering.

## Dataskydd och personuppgifter

### PRIV-01: egen personuppgiftsexport

**Steg:** Logga in och öppna `/sv/privacy`, exportera egna uppgifter.

**Förväntat resultat:** Exporten innehåller den inloggade användarens uppgifter.

### PRIV-02: PrivacyOfficer förhandsgranskar med HSA-id

**Steg:** Som `disa.privacy`, sök på `SE5560000001-linneab`.

**Förväntat resultat:** Förhandsgranskningen hittar rätt person via HSA-id.

### PRIV-03: förhandsgranskat mål exporterar JSON och PDF

**Steg:** Kör dataskyddsförhandsgranskning och exportera i båda formaten.

**Förväntat resultat:** JSON och PDF laddas ned och avser samma målperson.

### PRIV-04: dubblettnamn söker enbart med HSA-id

**Steg:** Sök på `kalle.one` och `kalle.two` via HSA-id.

**Förväntat resultat:** Personerna blandas inte ihop trots samma namn.

### PRIV-05: ersättningsperson med växlingsåtgärd

**Steg:** Välj åtgärden som byter personansvar till ersättare.

**Förväntat resultat:** Förhandsgranskningen visar vilka rader som byts.

### PRIV-06: anonymisera och hoppa över

**Steg:** Välj en anonymiseringsåtgärd och en hoppa-över-åtgärd i samma
förhandsgranskning.

**Förväntat resultat:** Åtgärderna visas separat och kan verkställas korrekt.

### PRIV-07: gammal förhandsgranskning avvisas

**Steg:** Skapa förhandsgranskning, gör den inaktuell och försök verkställa.

**Förväntat resultat:** Verkställandet avvisas och ny förhandsgranskning krävs.

### PRIV-08: dataskyddsverkställande skapar åtgärdslogg

**Steg:** Verkställ en tillåten dataskyddsåtgärd och öppna åtgärdsloggen.

**Förväntat resultat:** Loggen visar målperson, åtgärd och aktör.

### PRIV-09: export för kravansvarsperson utan tilldelning

**Steg:** Förhandsgranska `SE5560000001-retentionorphan`.

**Förväntat resultat:** Exporten innehåller lokal kravansvarsperson men inte
otilldelade personer som inte matchar målet.

## Utvecklar- och robusthetsytor

### DEVTOOLS-01: Developer Mode-chip kopierar referens

**Steg:** Aktivera Developer Mode, hovra över en annoterad kontroll och kopiera
referensen.

**Förväntat resultat:** Referensen kopieras och bekräftas visuellt.

### DEVTOOLS-02: Developer Mode ligger kvar vid navigering

**Steg:** Aktivera Developer Mode, navigera mellan kravbibliotek och Admincenter.

**Förväntat resultat:** Läget fortsätter vara aktivt.

### DEVTOOLS-03: rapportkontroller i kravunderlag är annoterade

**Steg:** Öppna rapportkontroller i kravunderlag med Developer Mode.

**Förväntat resultat:** Relevanta kontroller visar kopierbara referenser.

### RES-01: engelsk Admin-felåterhämtning

**Steg:** Byt till engelska, öppna Admin-felyta och använd återhämtningslänk.

**Förväntat resultat:** Feltexten är engelsk och länken återför till säker vy.

### RES-02: startsida smoke

**Steg:** Öppna startsidan både utloggad och inloggad.

**Förväntat resultat:** Startsidan laddar utan fel och leder vidare korrekt.

### RES-03: readiness och build-metadata

**Steg:** Kontrollera readiness-endpoint och synlig buildmetadata enligt lokal
miljö.

**Förväntat resultat:** Readiness svarar OK och metadata saknar känsliga
värden.
