# Driftsättningspolicyer för AI-anslutningar

Den här guiden är för dig som driftoperatör och ska konfigurera en
AI-anslutning för första gången. Du behöver inte kunna applikationens kod, men
du behöver samordna beslut från nätverksdrift, PKI eller certifikatansvarig,
informationssäkerhet, dataskydd och produktadministratören.

Guiden beskriver dessa tre miljövariabler:

- `AI_CONNECTION_EGRESS_POLICIES_JSON`
- `AI_CONNECTION_DATA_POLICIES_JSON`
- `AI_CONNECTION_TLS_POLICIES_JSON`

Variablerna innehåller inte leverantörshemligheter. De är driftsättningens
skyddsräcken för vart applikationen får ansluta, vilken TLS-tillit som ska
användas och vilken behandling som får ske. Tomma objekt, `{}`, är det säkra
standardvärdet och blockerar AI-aktivering tills driften har lagt in granskade
policyer.

## Kort förklaring av variablerna

När Kravhantering använder en extern AI-tjänst lämnar information
applikationen. De här tre variablerna fungerar därför som tre kontrollfrågor
som alla måste få ett godkänt svar:

- `AI_CONNECTION_EGRESS_POLICIES_JSON`: **Vart får informationen skickas?**
  Här listas de exakta AI-tjänster som applikationen får ansluta till.
- `AI_CONNECTION_TLS_POLICIES_JSON`: **Hur kontrollerar vi att vi ansluter
  till rätt tjänst?** Här anges vilken typ av certifikatkontroll som ska
  användas. Variabeln innehåller inte certifikat eller privata nycklar.
- `AI_CONNECTION_DATA_POLICIES_JSON`: **Vilken information får behandlas och
  under vilka villkor?** Här anges exempelvis tillåtna länder eller regioner,
  högsta informationsklass, om personuppgifter får behandlas och om
  AI-leverantören får lagra information eller använda den för träning.

I Admin Center beskriver administratören vad en viss AI-anslutning ska använda
och vad leverantören har lovat. Variablerna ovan beskriver vad organisationens
drift, informationssäkerhet och dataskydd faktiskt tillåter. Applikationen gör
AI-anropet endast när båda beskrivningarna stämmer överens.

## Varför policyerna ligger utanför applikationsdatabasen

Databasen innehåller inställningarna för varje AI-anslutning. Om även de
yttersta säkerhetsreglerna låg där skulle samma administrationsväg kunna ändra
både anslutningen och reglerna som ska begränsa den.

Därför ligger säkerhetsreglerna i en separat konfiguration som ägs av driften.
Administratören kan välja en regel som driften redan har godkänt, men kan inte
via Admin Center lägga till en ny AI-tjänst eller tillåta en ny typ av
databehandling. Det kan jämföras med att administratören väljer en dörr, medan
driften bestämmer vilka dörrar som över huvud taget får låsas upp.

Det är separationen som är viktig, inte just en `.env`-fil. Den inbyggda
lösningen använder miljövariabler, men en annan driftkontrollerad och
skrivskyddad konfigurationskälla kan också användas. Om en regel saknas
blockeras AI-anropet. En vanlig databastabell som applikationen själv kan ändra
ger däremot inte samma oberoende skydd.

## Steg för steg: från beslut till aktiv körprofil

Följ stegen i ordning. Referensdelarna längre ned förklarar varje JSON-fält
i detalj.

### Steg 1: förbered ett säkert arbetsläge

Innan du ändrar något:

1. Kontrollera att den globala AI-spärren är aktiv. I produktion ska
   `AI_REQUIREMENT_GENERATION_DISABLED` vara `1` under arbetet.
2. Bestäm vilken test- eller stagingmiljö som ska användas för verifieringen.
3. Kontrollera vem som kan redigera appens miljöfil och starta om appnoderna.
4. Kontrollera vem som har administratörsbehörighet till Admin Center.
5. Skapa ett ändringsärende där beslut, granskare och återställningsplan kan
   dokumenteras.

Resultat efter steget: AI-trafik kan inte släppas av misstag medan
konfigurationen tas fram.

### Steg 2: skriv ned den exakta anslutningsadressen

Be tjänsteägaren om den fullständiga adress som adaptern ska använda, till
exempel:

```text
https://openrouter.ai/api/v1
```

Ta sedan fram dess origin. För exemplet är den:

```text
https://openrouter.ai
```

Du kan kontrollera en origin med Node.js:

```bash
node -e 'console.log(new URL(process.argv[1]).origin)' \
  'https://openrouter.ai/api/v1'
```

Adressen får inte innehålla användarnamn, lösenord, frågesträng eller
fragment. Använd inte en bredare domän än den faktiska tjänsten.

Resultat efter steget: du har dokumenterat en fullständig anslutningsadress
och en exakt origin.

### Steg 3: avgör om destinationen är publik eller privat

Be nätverksansvarig klassificera destinationen:

- Publik tjänst: DNS ska endast ge publika IP-adresser. Originen ska ligga i
  `allowedOrigins`.
- Privat sidecar: DNS kan ge privata, loopback-, link-local- eller interna
  adresser. Originen ska ligga i `privateSidecarOrigins` och varje tillåten
  IP-adress ska ligga i `privateSidecarAddresses`.

Ta fram samtliga förväntade IPv4- och IPv6-svar för en privat sidecar. Använd
inte subnät, jokertecken eller en adress som bara råkar gälla på en appnod.

Resultat efter steget: du vet vilken egress-lista som ska användas och har ett
granskat destinationsunderlag för brandvägg eller proxy.

### Steg 4: skapa egress-policyn

Välj ett stabilt namn, exempelvis `openrouter_api`. Namnet är en
egress-policynyckel och ska senare anges exakt likadant i Admin Center.

För en publik tjänst skriver du:

```json
{
  "openrouter_api": {
    "allowedOrigins": ["https://openrouter.ai"],
    "privateSidecarOrigins": []
  }
}
```

För en privat sidecar följer du i stället exemplet under
[Privat sidecar i egress-policyn](#privat-sidecar-i-egress-policyn).

Resultat efter steget: du har ett granskningsbart JSON-objekt för
`AI_CONNECTION_EGRESS_POLICIES_JSON` och ett policynyckelnamn för
Admin Center.

### Steg 5: fastställ TLS-tilliten

Be PKI- eller certifikatansvarig svara på vilken CA-kedja som utfärdar
tjänstens certifikat.

Om vanlig publik Web PKI ska användas, välj en stabil nyckel, exempelvis
`public_web_pki`, och skriv:

```json
{
  "public_web_pki": "public_web_pki"
}
```

Om tjänsten använder privat CA ska du stanna här och läsa
[Privat CA](#privat-ca). Miljövariabeln ensam kan inte installera CA-material
eller skapa den transport som krävs.

Resultat efter steget: du har ett användbart TLS-policyobjekt eller ett tydligt
arbete för den privata PKI-integrationen. Du har också den TLS-policynyckel som
ska anges i Admin Center.

### Steg 6: bestäm vilka anropstyper som ska tillåtas

Gå igenom de tre fasta anropstyperna med produktägare,
informationssäkerhetsansvarig och dataskyddsansvarig:

- `generate_without_images`
- `generate_with_images`
- `repair_invalid_import_json`

För varje avsedd anropstyp ska beslutet ange:

1. tillåtna behandlingsregioner;
2. organisationens informationsklasser från lägst till högst;
3. anropstypens högsta informationsklass;
4. om personuppgifter ska behandlas;
5. att leverantörsträning är förbjuden;
6. att maximal lagringstid är noll dagar.

Aktivera inte en anropstyp som saknar ett granskat beslut. Bilder ska bedömas
utifrån sitt faktiska innehåll; bildstöd är inte i sig ett godkännande av
personuppgifter.

Resultat efter steget: du har ett beslutat datablad för varje anropstyp som
ska aktiveras.

### Steg 7: skapa datapolicyerna

Översätt varje beslutat datablad till JSON enligt
[Datapolicy per anropstyp](#datapolicy-per-anropstyp). Om samma beslut gäller
för alla tre kan du utgå från det
[kompletta exemplet](#komplett-exempel-för-alla-tre-anropstyper).

Kontrollera särskilt att:

- varje avsedd anropstyp finns som en exakt toppnivånyckel;
- regionnamn är identiska med de namn som ska användas i attesten;
- anropstypens klass och den planerade attestklassen finns i
  `informationClassOrder`;
- `maximumRetentionDays` är `0`;
- `requireTrainingProhibited` är `true`.

Resultat efter steget: du har ett granskningsbart JSON-objekt för
`AI_CONNECTION_DATA_POLICIES_JSON`.

### Steg 8: planera den matchande attesten

Skicka datapolicyerna till den person som ska registrera och godkänna
attesten i Admin Center. Kontrollera före driftsättning att den planerade
attesten har:

- en aktuell granskning och beslutsreferens;
- samma godkända regionnamn som datapolicyn;
- en informationsklass som möter varje avsedd anropstyps krav;
- noll dagars lagring;
- ingen leverantörsträning;
- ett personuppgiftsbesked som motsvarar den verkliga behandlingen;
- fullständiga uppgifter om leverantör och underbiträden.

Resultat efter steget: driftsättningspolicyn och attesten motsäger inte
varandra innan någon teknisk aktivering påbörjas.

### Steg 9: validera och skriv miljövariablerna

Validera först de tre läsbara JSON-objekten med `jq -e .`. Minifiera dem sedan
med `jq -c .` och skriv varje variabel på en enda rad i miljöfilen. Se
[Redigera och kontrollera JSON](#redigera-och-kontrollera-json) för exakta
kommandon.

För lokal utveckling finns OpenRouter-policyer för syntetiska demodata i
`.env.development`. Lokala ändringar läggs i `.env.development.local`. För den
dokumenterade RHEL-driftsättningen är filen
`/etc/kravhantering/app.env`.

Resultat efter steget: miljöfilen innehåller tre syntaktiskt giltiga
JSON-objekt utan leverantörshemligheter.

### Steg 10: driftsätt samma värden på alla appnoder

Distribuera miljöfilen med den ordinarie konfigurationshanteringen. Kontrollera
att alla appnoder får samma version och starta om app-runtime på samtliga
noder. En ändrad miljövariabel läses inte in av en redan startad process.

Kontrollera uppstartslogg och health enligt den ordinarie driftrutinen, men
skriv inte ut hela miljöfilen i logg eller supportmaterial.

Resultat efter steget: alla appnoder verkställer samma driftsättningspolicy.

### Steg 11: registrera anslutningen i Admin Center

Öppna `Administrationscenter > Inställningar > AI` och skapa eller redigera
AI-anslutningen. Ange:

- den fullständiga anslutningsadressen från steg 2;
- egress-policynyckeln från steg 4;
- TLS-policynyckeln från steg 5;
- den autentiseringstyp som leverantören och organisationen har godkänt.

Spara anslutningen. Registrera och godkänn sedan attesten från steg 8.
Leverantörshemligheten registreras genom den separata, skrivskyddade
hemlighetshanteringen i Admin Center och ska inte ligga i miljöfilen.

Resultat efter steget: Admin Center refererar till exakt de policyobjekt som
driften har driftsatt.

### Steg 12: verifiera i beroendeordning

Utför åtgärderna i denna ordning:

1. verifiera och aktivera leverantörshemligheten om autentisering kräver den;
2. öppna modellformuläret och kör den sammanhållna verifieringen;
3. granska alla förmågor och körprofilskompatibiliteter;
4. spara den verifierade modellrevisionen;
5. aktivera AI-anslutningen;
6. välj den verifierade modellrevisionen direkt på en stabil körprofil;
7. granska driftbudgetarna och spara profilen;
8. upprepa punkt 6–7 för övriga avsedda anropstyper.

Om en aktivering misslyckas ska du använda
[felsökningstabellen](#vanliga-fel-och-vad-de-betyder). Vidga inte en policy
enbart för att få ett grönt resultat.

Resultat efter steget: varje avsedd körprofil visar den enda huvudstatusen
`Aktiv` och binder direkt en exakt verifierad modellrevision till en godkänd
anslutning.

Körprofilens huvudstatus har följande prioritet:

1. `Ej konfigurerad` när ingen modellrevision är vald.
2. `Pausad` när en konfigurerad profil är administrativt pausad.
3. `Blockerad` när en vald modellrevision har ett ogiltigt administrativt
   beroende.
4. `Aktiv` när profilen har en vald modellrevision, inte är pausad och alla
   administrativa beroenden är giltiga.

Operativ leverantörshälsa och kretsbrytarläge är separat driftinformation.
En reparerad blockerad profil blir automatiskt `Aktiv`. En pausad profil
förblir `Pausad` efter reparation tills en administratör återupptar den.

### Steg 13: slutför driftsättningsgrinden

Genomför checklistan i den här guiden och den fullständiga
[driftsättningsgrinden](./ai-connections.md#pre-deployment-gate). Kontrollera
att larm, egresskontroll, root-keyring, attest, verifieringsbevis och samtliga
avsedda stabila körprofiler är godkända.

Släpp den globala AI-spärren först efter det formella beslutet.

Resultat efter steget: miljön kan ta emot de uttryckligen godkända AI-anropen
utan att användaren kan välja en annan leverantör eller försvaga policyn.

## Tre lager som måste stämma överens

En AI-anslutning blir användbar först när tre olika lager stämmer överens.

<!-- markdownlint-disable MD013 -->
| Lager | Ägare | Vad det bestämmer |
| --- | --- | --- |
| Driftsättningspolicy | Drift, nätverk, PKI, informationssäkerhet och dataskydd | Vilka destinationer, TLS-källor och behandlingsvillkor som miljön tillåter. |
| AI-anslutning och attest | Produktadministratör och attestansvarig i Admin Center | Vilken adress och vilka policynycklar anslutningen använder samt vad leverantören är godkänd för. |
| Stabil körprofil | Produktadministratör i Admin Center | Vilken verifierad anslutningsmodell och vilka driftbudgetar som används för en bestämd anropstyp. |
<!-- markdownlint-enable MD013 -->

Kopplingen ser ut så här:

```text
Admin Center: egress-policynyckel ──> EGRESS-objektets nyckel
Admin Center: TLS-policynyckel    ──> TLS-objektets nyckel
Fast anropstyp                    ──> DATA-objektets fasta nyckel
Godkänd attest                   ──> jämförs med anropstypens datapolicy
```

Egress- och TLS-nycklar är namn som driften väljer. De måste matcha
Admin Center tecken för tecken och får vara högst 100 tecken där. Använd
gärna ett stabilt namn med gemener, siffror och understreck, exempelvis
`openrouter_api`. Det är en namnrekommendation, inte ett extra JSON-krav.
Datapolicyns tre nycklar är däremot fasta och får inte byta namn.

## Grundbegrepp

### AI-anslutning

En administrerad koppling till en AI-leverantör eller agentmiljö. Den
innehåller bland annat en anslutningsadress och referenser till en egress- och
TLS-policy.

### Origin

Den del av en URL som består av protokoll, värdnamn och eventuell port. För
`https://openrouter.ai/api/v1` är origin `https://openrouter.ai`.

En origin innehåller inte sökväg, frågesträng, fragment eller
användaruppgifter.

### Egress

Utgående nätverkstrafik från applikationen. Egress-policyn är
applikationens tillåtelselista. Den öppnar inte brandväggen eller proxyn;
nätverkskontrollen måste konfigureras separat från samma granskade underlag.

### TLS och Web PKI

TLS skyddar anslutningen och verifierar serverns identitet. `public_web_pki`
betyder att servercertifikatet ska kunna verifieras med den vanliga publika
CA-kedjan som Node.js-miljön litar på.

### Privat sidecar

En separat AI-tjänst på en privat, loopback-, link-local- eller intern adress.
Den betraktas fortfarande som en extern behandlingspart och behöver samma
attest och policygranskning som en publik tjänst.

### Attest

Den godkända uppsättningen uppgifter i Admin Center om bland annat
informationsklass, personuppgifter, behandlingsregioner, underbiträden,
träning och maximal lagringstid. Datapolicyn ersätter inte attesten; den
kontrollerar att attesten uppfyller driftsättningens krav.

### Anropstyp

Applikationen har exakt tre fasta anropstyper:

<!-- markdownlint-disable MD013 -->
| Fast JSON-nyckel | Visat användningsområde |
| --- | --- |
| `generate_without_images` | Kravgenerering utan bilder |
| `generate_with_images` | Kravgenerering med bilder |
| `repair_invalid_import_json` | Reparation av ogiltig import-JSON |
<!-- markdownlint-enable MD013 -->

Definiera en datapolicy för varje anropstyp som ska kunna aktiveras. En saknad
nyckel ger aktiveringshindret `Driftsättningen saknar en datapolicy för
anropstypen.` Okända extra nycklar används inte.

## Var konfigurationen ska ligga

För lokal utveckling innehåller `.env.development` kompletta policyer för den
förifyllda OpenRouter-anslutningen och syntetiska demodata. Alla tre anropstyper
använder demoattestens informationsklass `internal` och regionvärde
`EU/EES (demouppgift)`, utan personuppgifter, träning eller lagring. Regionvärdet
är demodata och intygar inte leverantörens faktiska behandlingsregion.
Attest, leverantörshemlighet och modellverifiering hanteras fortfarande i
Admin Center. Egna policyvärden läggs i den ignorerade filen
`.env.development.local`. Starta om utvecklingsservern efter varje ändring.

För den dokumenterade RHEL-driftsättningen ligger värdena i
`/etc/kravhantering/app.env`. Alla appnoder ska få samma granskade värden och
startas om enligt driftsättningens ordinarie ändringsrutin.

Skriv varje variabel på en enda rad. JSON använder dubbla citattecken. Lägg
inte in kommentarer inuti JSON-värdet.

## Egress-policy

### Egressvariabelns funktion

`AI_CONNECTION_EGRESS_POLICIES_JSON` är ett JSON-objekt där varje
toppnivånyckel är en egress-policynyckel som kan anges i Admin Center.

Strukturen för en policy är:

```json
{
  "POLICY_KEY": {
    "allowedOrigins": ["https://provider.example"],
    "privateSidecarOrigins": [],
    "privateSidecarAddresses": []
  }
}
```

`privateSidecarAddresses` är valfritt när policyn inte har någon privat
sidecar.

<!-- markdownlint-disable MD013 -->
| Fält | Obligatoriskt | Betydelse |
| --- | --- | --- |
| Toppnivånyckeln | Ja | Stabilt namn som ska vara exakt samma som `Egress-policy` i Admin Center. Välj exempelvis `openrouter_api` eller `approved_provider_api`. |
| `allowedOrigins` | Ja | Publika, exakt tillåtna origins. Varje värdnamn måste vid kontrolltillfället enbart lösa till publika IP-adresser. |
| `privateSidecarOrigins` | Ja | Exakta origins som avsiktligt får lösa till privata eller interna adresser. Använd en tom lista när ingen privat sidecar finns. |
| `privateSidecarAddresses` | Endast för privat sidecar | Exakta IPv4- och IPv6-adresser som sidecarens DNS-svar får innehålla. Samtliga upplösta adresser måste finnas i listan. |
<!-- markdownlint-enable MD013 -->

### Publik leverantör

För en anslutningsadress som `https://openrouter.ai/api/v1` är den tillåtna
origin som ska stå i egress-policyn `https://openrouter.ai`.

Läsbart JSON:

```json
{
  "openrouter_api": {
    "allowedOrigins": ["https://openrouter.ai"],
    "privateSidecarOrigins": []
  }
}
```

Env-rad:

<!-- markdownlint-disable MD013 -->
```env
AI_CONNECTION_EGRESS_POLICIES_JSON={"openrouter_api":{"allowedOrigins":["https://openrouter.ai"],"privateSidecarOrigins":[]}}
```
<!-- markdownlint-enable MD013 -->

Ange sedan `openrouter_api` i fältet `Egress-policy` i Admin Center.

Exemplet visar format och koppling, inte ett organisatoriskt godkännande av
leverantören. Brandvägg eller proxy ska begränsas från samma granskade
destinationslista.

### Privat sidecar i egress-policyn

En privat sidecar måste ha både en exakt origin och en exakt adresslista.
Exempel:

```json
{
  "internal_ai_sidecar": {
    "allowedOrigins": [],
    "privateSidecarOrigins": ["https://ai-sidecar.example.org:8443"],
    "privateSidecarAddresses": ["10.20.30.40", "10.20.30.41"]
  }
}
```

Om DNS returnerar en enda adress som inte finns i
`privateSidecarAddresses` blockeras anslutningen. Lägg inte till hela subnät
eller jokertecken; fältet innehåller exakta adresser.

### Regler som verkställs

- Produktionsadressen ska använda `https` eller `wss`.
- Användaruppgifter, frågesträng och fragment är förbjudna.
- Origin jämförs exakt efter URL-normalisering.
- Vanliga publika origins får endast lösa till publika adresser.
- En privat destination måste finnas i både sidecarens originlista och
  adresslista.
- DNS kontrolleras på nytt före transportanrop.
- Omdirigeringar tillåts inte.
- Ett adapteranrop får inte lämna den verifierade anslutningsadressens origin
  eller sökväg.

Adressvalideringen accepterar `wss`, men den inbyggda pinnade
administrationstransporten utför HTTPS-anrop. En driftsättning som verkligen
behöver WebSocket måste därför ha en uttryckligen verifierad adapter- och
transportimplementation; anta inte att ett sparat `wss`-värde räcker.

Den tekniska auktoriteten för dessa regler är
[AI-anslutningens tillitsgräns](../../lib/ai/connection-trust.ts) och
[ADR 0052](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

## TLS-policy

### TLS-variabelns funktion

`AI_CONNECTION_TLS_POLICIES_JSON` kopplar en TLS-policynyckel till en
tillitskälla. Toppnivånyckeln ska matcha fältet `TLS-policy` i Admin Center.

Strukturen är:

```json
{
  "POLICY_KEY": "public_web_pki"
}
```

### Publik Web PKI

Den inbyggda runtime-kompositionen stöder `public_web_pki`:

```env
AI_CONNECTION_TLS_POLICIES_JSON={"public_web_pki":"public_web_pki"}
```

I detta exempel anger du `public_web_pki` i fältet `TLS-policy` i Admin Center.
Nyckeln till vänster är det namn som driften väljer. Värdet till höger
är den fasta tillitskällan.

### Privat CA

Typkontraktet känner till värdet `deployment_private_ca`, men det räcker inte
att skriva detta i miljövariabeln. Den inbyggda runtime-kompositionen avvisar
värdet eftersom CA-material och en deployment-ägd pinnad transport måste
kopplas in separat. Denna konfiguration är alltså inte en fungerande genväg:

```env
AI_CONNECTION_TLS_POLICIES_JSON={"internal_ca":"deployment_private_ca"}
```

Använd privat CA endast när den driftsatta runtime-kompositionen uttryckligen
har kompletterats med den godkända CA-kedjan och transporten. Det går inte att
ladda upp CA-material eller stänga av certifikatverifiering i Admin Center.

Den tekniska auktoriteten är
[inläsningen av driftsättningspolicyn](../../lib/ai/admin-external.ts) och
[TLS-kontraktet](../../lib/ai/connection-trust.ts).

## Datapolicy per anropstyp

### Datavariabelns funktion

`AI_CONNECTION_DATA_POLICIES_JSON` anger driftsättningens krav för var och en
av de tre fasta anropstyperna. Varje policy jämförs med den valda
AI-anslutningens aktiva och godkända attest.

Strukturen är:

```json
{
  "generate_without_images": {
    "allowedProcessingRegions": ["SE"],
    "informationClassOrder": ["public", "internal", "confidential"],
    "maximumInformationClass": "internal",
    "maximumRetentionDays": 0,
    "personalDataAllowed": false,
    "requireTrainingProhibited": true
  }
}
```

<!-- markdownlint-disable MD013 -->
| Fält | Typ | Hur värdet bestäms | Kontroll som applikationen gör |
| --- | --- | --- | --- |
| `allowedProcessingRegions` | Lista med strängar | Använd organisationens granskade regionnamn. | Varje region i attesten måste matcha ett listvärde exakt, inklusive stavning och skiftläge. |
| `informationClassOrder` | Ordnad lista med strängar | Lista organisationens klasser från lägst till högst skyddsbehov. | Både policyklass och attestklass måste finnas i listan. Attestens godkända tak måste ligga på samma eller en högre nivå än anropstypens krav. |
| `maximumInformationClass` | Sträng | Den högsta informationsklass som anropstypen kan innehålla enligt granskat beslut. | Värdet slås upp i `informationClassOrder` och jämförs med attestens klass. |
| `maximumRetentionDays` | Icke-negativt heltal | Högsta tillåtna lagringstid hos behandlingsparten. | Attestens lagringstid får inte vara högre. Nuvarande applikationsminimum kräver dessutom alltid `0`. |
| `personalDataAllowed` | Booleskt värde | Om anropstypen är godkänd och avsedd för en anslutning som behandlar personuppgifter. | Värdet måste vara identiskt med attestfältet: `true` kräver att attesten anger personuppgiftsbehandling och `false` kräver att attesten anger att personuppgifter inte behandlas. |
| `requireTrainingProhibited` | Booleskt värde | Om leverantörsträning ska vara förbjuden. | När värdet är `true` måste attesten förbjuda träning. Nuvarande applikationsminimum förbjuder alltid träning. |
<!-- markdownlint-enable MD013 -->

### Applikationens integritetsminimum

Nuvarande version har ett hårdare minimum som en miljöpolicy inte kan
försvaga:

- leverantörsträning ska vara förbjuden;
- maximal lagringstid ska vara noll dagar.

Sätt därför `requireTrainingProhibited` till `true` och
`maximumRetentionDays` till `0` för samtliga tre anropstyper. En attest som
tillåter träning eller lagring över noll blockeras även om miljöpolicyn
skulle ange svagare krav.

Detta minimum fastställs i
[ADR 0053](../adr/0053-integritetsminimum-for-ai-anrop.md) och verkställs i
[datapolicykontrollen](../../lib/ai/connection-trust.ts).

### Komplett exempel för alla tre anropstyper

Exemplet nedan antar följande granskade beslut:

- behandlingsregionen är `SE`;
- informationsklasserna är `public`, `internal` och `confidential`, i den
  ordningen;
- anropen innehåller högst klassen `internal`;
- personuppgifter ska inte behandlas;
- leverantörsträning är förbjuden;
- lagringstiden är noll dagar.

Läsbart JSON:

```json
{
  "generate_without_images": {
    "allowedProcessingRegions": ["SE"],
    "informationClassOrder": ["public", "internal", "confidential"],
    "maximumInformationClass": "internal",
    "maximumRetentionDays": 0,
    "personalDataAllowed": false,
    "requireTrainingProhibited": true
  },
  "generate_with_images": {
    "allowedProcessingRegions": ["SE"],
    "informationClassOrder": ["public", "internal", "confidential"],
    "maximumInformationClass": "internal",
    "maximumRetentionDays": 0,
    "personalDataAllowed": false,
    "requireTrainingProhibited": true
  },
  "repair_invalid_import_json": {
    "allowedProcessingRegions": ["SE"],
    "informationClassOrder": ["public", "internal", "confidential"],
    "maximumInformationClass": "internal",
    "maximumRetentionDays": 0,
    "personalDataAllowed": false,
    "requireTrainingProhibited": true
  }
}
```

Env-rad:

<!-- markdownlint-disable MD013 -->
```env
AI_CONNECTION_DATA_POLICIES_JSON={"generate_without_images":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true},"generate_with_images":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true},"repair_invalid_import_json":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true}}
```
<!-- markdownlint-enable MD013 -->

Kopiera inte beslutet blint. Byt värdena om den godkända attesten använder
andra regionnamn eller informationsklasser. Exakta strängar måste stämma
överens.

### Personuppgifter och bilder

> **Viktigt:** `personalDataAllowed` och attestfältet för
> personuppgiftsbehandling måste ha samma booleska värde. Kontrollen blockerar
> både en policy som tillåter personuppgifter när attesten säger nej och en
> policy som förbjuder personuppgifter när attesten säger ja. Den tekniska
> jämförelsen ersätter inte den faktiska användningsavgränsningen, information
> till användarna, dataskyddsbeslutet eller övriga kontroller.

Att en körprofil tar emot bilder betyder inte automatiskt att personuppgifter
är godkända. Om bilder kan innehålla identifierbara personer eller annan
personinformation ska dataskyddsansvarig bedöma behandlingen. Aktivera inte
profilen med en policy och attest som säger `false` om det faktiska
användningsfallet innehåller personuppgifter.

När `personalDataAllowed` är `true` kräver den tekniska kontrollen att
attesten också anger personuppgiftsbehandling. När värdet är `false` kräver
kontrollen att attesten anger att personuppgifter inte behandlas. Ett
`true`-värde är ingen generell fullmakt att skicka personuppgifter och ersätter
inte ändamål, informationsklass, region, underbiträden eller andra
skyddsåtgärder.

## Ett komplett samordnat exempel

Detta exempel visar hur alla tre variablerna och Admin Center kopplas samman
för en publik HTTPS-tjänst. Det är ett tekniskt exempel, inte ett godkännande
av leverantör, modell eller databehandling.

### Exakta rader i `.env.development.local` för exemplet

Filen kan innehålla andra lokala inställningar. För det samordnade exemplet
ovan är detta de tre exakta relevanta raderna:

<!-- markdownlint-disable MD013 -->
```env
AI_CONNECTION_EGRESS_POLICIES_JSON={"openrouter_api":{"allowedOrigins":["https://openrouter.ai"],"privateSidecarOrigins":[]}}
AI_CONNECTION_DATA_POLICIES_JSON={"generate_without_images":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true},"generate_with_images":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true},"repair_invalid_import_json":{"allowedProcessingRegions":["SE"],"informationClassOrder":["public","internal","confidential"],"maximumInformationClass":"internal","maximumRetentionDays":0,"personalDataAllowed":false,"requireTrainingProhibited":true}}
AI_CONNECTION_TLS_POLICIES_JSON={"public_web_pki":"public_web_pki"}
```
<!-- markdownlint-enable MD013 -->

### Motsvarande värden i Admin Center

<!-- markdownlint-disable MD013 -->
| Fält | Exempelvärde | Varför |
| --- | --- | --- |
| Anslutningsadress | `https://openrouter.ai/api/v1` | Adressen ligger under den tillåtna originen `https://openrouter.ai`. |
| Egress-policy | `openrouter_api` | Matchar toppnivånyckeln i `AI_CONNECTION_EGRESS_POLICIES_JSON`. |
| TLS-policy | `public_web_pki` | Matchar toppnivånyckeln i `AI_CONNECTION_TLS_POLICIES_JSON`. |
| Attestens region | `SE` | Finns exakt i `allowedProcessingRegions`. |
| Attestens informationsklass | `internal` eller en högre klass i samma ordningslista | Uppfyller anropstypernas klasskrav. |
| Attestens maximala lagringstid | `0` | Uppfyller applikationens integritetsminimum. |
| Attestens leverantörsträning | Nej | Uppfyller applikationens integritetsminimum. |
| Attestens personuppgiftsbehandling | Nej | Matchar `personalDataAllowed: false`; den tekniska kontrollen blockerar om attesten i stället anger Ja. Kontrollera även den faktiska användningen separat. |
<!-- markdownlint-enable MD013 -->

## Så tar du fram värdena

Använd detta som arbetsunderlag innan du redigerar miljöfilen.

<!-- markdownlint-disable MD013 -->
| Fråga | Beslutsägare | Resultat i konfigurationen |
| --- | --- | --- |
| Vilken exakt tjänst ska appen nå? | Tjänsteägare och produktadministratör | Anslutningsadress i Admin Center och origin i egress-policyn. |
| Är destinationen publik eller privat? | Nätverksansvarig | `allowedOrigins` eller kombinationen `privateSidecarOrigins` och `privateSidecarAddresses`. |
| Vilka IP-adresser får en privat sidecar ha? | Nätverksansvarig | Exakta värden i `privateSidecarAddresses` och motsvarande brandväggsregel. |
| Vilken certifikatkedja ska godkännas? | PKI- eller certifikatansvarig | TLS-policyn och eventuell separat runtime-komposition för privat CA. |
| Vilka anropstyper ska aktiveras? | Produktägare och produktadministratör | Vilka av de tre fasta datapolicynycklarna som måste finnas och vilka körprofiler som aktiveras. |
| Vilken informationsklass kan varje anrop innehålla? | Informationssäkerhetsansvarig | `informationClassOrder` och `maximumInformationClass`. |
| Var får behandlingen ske? | Dataskydds- och informationssäkerhetsansvarig | `allowedProcessingRegions` och exakt motsvarande attestvärden. |
| Får personuppgifter behandlas? | Dataskyddsansvarig och personuppgiftsansvarig | `personalDataAllowed`, attesten och avgränsningen av faktisk användning. |
| Är träning och lagring förbjuden? | Avtals-, dataskydds- och informationssäkerhetsansvarig | `requireTrainingProhibited: true`, `maximumRetentionDays: 0` och stödjande leverantörsbevis. |
<!-- markdownlint-enable MD013 -->

Dokumentera beslutsreferenserna i den ordinarie styrningen och i anslutningens
attest. Lägg inte beslutsmotiveringar eller hemligheter i JSON-kartorna.

## Redigera och kontrollera JSON

### Arbeta läsbart och minifiera sist

Skriv och granska först varje värde som vanlig indenterad JSON i en tillfällig
fil som inte innehåller hemligheter. Validera och minifiera sedan med `jq`:

```bash
jq -e . ai-data-policies.json
jq -c . ai-data-policies.json
```

Den första kommandoraden kontrollerar JSON-syntaxen. Den andra skriver ett
minifierat objekt som kan placeras efter `=` i miljöfilen. Gör samma sak för
egress- och TLS-objekten.

### Kontrollera ett redan infört env-värde

För lokal utveckling kan du kontrollera JSON-syntaxen utan att läsa andra
miljövariabler:

```bash
sed -n 's/^AI_CONNECTION_EGRESS_POLICIES_JSON=//p' \
  .env.development.local | jq -e .
sed -n 's/^AI_CONNECTION_DATA_POLICIES_JSON=//p' \
  .env.development.local | jq -e .
sed -n 's/^AI_CONNECTION_TLS_POLICIES_JSON=//p' \
  .env.development.local | jq -e .
```

Byt filnamnet till `/etc/kravhantering/app.env` vid produktionsdrift.

Detta kontrollerar bara att värdet är giltig JSON. Applikationen kontrollerar
i nuläget att varje rotvärde är ett JSON-objekt, men den gör inte en
fullständig schemavalidering av alla underfält vid uppstart. Följ därför
fälttabellerna och genomför den funktionella verifieringen nedan.

## Funktionell verifiering

Genomför verifieringen i en säker test- eller stagingmiljö innan produktion.

1. Håll `AI_REQUIREMENT_GENERATION_DISABLED=1`.
2. Säkerställ att samma miljövariabler finns på varje appnod.
3. Starta om appnoderna och kontrollera att app-runtime startar utan
   konfigurationsfel.
4. Öppna `Administrationscenter > Inställningar > AI`.
5. Registrera eller redigera AI-anslutningen med exakt anslutningsadress,
   egress-policynyckel och TLS-policynyckel.
6. Registrera den fullständiga attesten och kontrollera att den är godkänd och
   aktuell.
7. Registrera leverantörshemligheten genom Admin Center. Lägg den aldrig i
   någon av de tre JSON-variablerna.
8. Kör den sammanhållna modellverifieringen och spara exakt avsedd
   modellrevision.
9. Aktivera anslutningen.
10. Välj revisionen direkt på varje avsedd stabil körprofil.
11. Kontrollera att profilens enda huvudstatus blir `Aktiv`, inte `Blockerad`,
    `Pausad` eller `Ej konfigurerad`.
12. Kontrollera brandväggs- eller proxylogg utan att logga prompt, bild,
    modellsvar eller leverantörshemlighet.
13. Genomför driftsättningens ordinarie bevis- och releasegrind innan den
    globala AI-spärren släpps.

En godkänd JSON-syntax är inte ett godkänt säkerhetsbeslut. Det funktionella
provet ersätter inte heller avtals-, dataskydds-, nätverks- eller
PKI-granskningen.

## Vanliga fel och vad de betyder

### Tillitspolicyn blockerar verifiering av leverantörshemligheten

Vid `Verifiera och aktivera ny hemlighet` kan följande fel visas:

```text
The AI connection trust policy blocked the request.
```

En möjlig orsak är att `AI_CONNECTION_EGRESS_POLICIES_JSON` eller
`AI_CONNECTION_TLS_POLICIES_JSON` saknas, är tom eller innehåller `{}`.
Då saknas de policyer som anslutningen hänvisar till i Admin Center.
Kontrollen kan stoppa anropet innan leverantören får pröva hemligheten;
meddelandet betyder därför inte att API-nyckeln är felaktig.

Kontrollera följande i ordning:

1. Kontrollera att appens miljö innehåller båda policyobjekten och att de har
   samma nycklar som anslutningen. OpenRouter-demoanslutningen använder
   `openrouter_api` för egress och `public_web_pki` för TLS.
2. Vid lokal utveckling finns dessa värden i `.env.development`. Kontrollera
   att `.env.development.local`, `.env.local` eller processens miljövariabler
   inte ersätter dem med tomma värden, `{}` eller andra policynycklar.
3. Starta om appen efter ändringen och försök verifiera hemligheten igen.
   I en miljö med flera appnoder måste alla noder läsa samma konfiguration.
4. Om policyerna finns, kontrollera anslutningens adress, autentisering och
   DNS-svar enligt [External Trust Boundary](./ai-connections.md#external-trust-boundary).
   Samma meddelande används även för en otillåten adress eller autentisering,
   en saknad TLS-policy och DNS-svar som inte tillåts av egress-policyn.

`AI_CONNECTION_DATA_POLICIES_JSON` behövs också för att aktivera körprofiler.
Den kontrolleras inte när just leverantörshemligheten verifieras. En saknad
datapolicy förklarar därför inte detta fel i det steget.

### HTTP 404 vid modellverifiering i OpenRouter

Om anslutning och autentisering är verifierade men grundläggande modellåtkomst
ger `upstream_unavailable_http_404`, har modellanropet fått HTTP 404.
Gränssnittets text om nätverksfel är en generell felkategori och fastställer
inte orsaken. OpenRouter kan ge 404 när ingen tillåten leverantör kan hantera
den valda modellen med anropets krav. Se
[OpenRouters felbeskrivning](https://openrouter.ai/docs/guides/features/router-metadata#error-responses).

Kontrollera exakt modell-id och att anslutningsadressen är
`https://openrouter.ai/api/v1`. Kontrollera sedan att modellen har tillgängliga
leverantörer som uppfyller nollagring och stöder de begärda parametrarna, samt
att kontots inställningar tillåter dessa leverantörer. En katalogpost bevisar
inte att den kombinationen är tillgänglig.

Adaptern använder `max_completion_tokens` för tokengränsen i både verifiering
och ordinarie körning. Det äldre `max_tokens` kan utesluta leverantörer som
bara annonserar den aktuella parametern när strikt parameterstöd krävs.
Uppdatera appen och verifiera igen om den använder den äldre parametern.
Kraven på resonemang, nollagring och förbjuden datainsamling gäller även vid
verifiering. Senare förmågor och körprofiler förblir oprövade tills den
grundläggande modellåtkomsten fungerar.

### Övriga fel

Om AI-analys verifieras men resonemangsaktivitet inte kan avgöras kommer
resultaten från olika prov. Ett enkelt prov som bara begär ett färdigt
JSON-objekt kan ge noll resonemangstoken även med hög resonemangsnivå.
Resonemangsproven och körprofilernas kombinerade prov innehåller därför en
fast räkneuppgift. Uppdatera appen om den använder de enklare proven och kör
verifieringen igen med samma modell.

Modellen måste lämna sitt beräknade resultat i JSON-fältet `answer`. Appen
kontrollerar resultatet lokalt utan att skicka facit till leverantören.
Ett korrekt resultat ersätter inte kravet på observerade resonemangsbevis.

Koderna `reasoning_activity_not_observed` och
`reasoning_control_not_observed` betyder att provet gav giltig JSON men saknade
de resonemangsbevis som behövs. Utfallet är oavgjort och blockerar användbara
modellrevisioner. Det betyder inte att JSON-svaret var ogiltigt, och synlig
AI-analys från ett annat prov ersätter inte de saknade bevisen.

<!-- markdownlint-disable MD013 -->
| Meddelande eller symptom | Trolig orsak | Kontrollera |
| --- | --- | --- |
| `Driftsättningen saknar en datapolicy för anropstypen.` | Den fasta anropstypens nyckel saknas i `AI_CONNECTION_DATA_POLICIES_JSON`, eller appnoden har inte startats om med det nya värdet. | Kontrollera exakt nyckel, rätt miljöfil, samtliga appnoder och omstart. |
| `Den attesterade datapolicyn uppfyller inte anropstypens krav.` | Policyn finns, men attesten är ofullständig eller avviker i informationsklass, personuppgifter, lagring, träning eller region. | Jämför varje attestfält med policyn. Regioner och klassnamn matchas exakt. |
| `Driftsättningens egress- eller TLS-policy blockerar målet.` | Egress- eller TLS-nyckeln saknas, originen är inte tillåten, DNS ger en otillåten adress eller TLS-policyn kan inte användas. | Kontrollera Admin Center-nycklarna, origin utan sökväg, samtliga DNS-svar, sidecaradresser och TLS-källa. |
| Anslutningen fungerar på en nod men inte på en annan | Appnoderna har olika miljövärden, DNS-svar, CA-tillit eller nätverksregler. | Jämför den driftsatta konfigurationen och nätverksvägen på samtliga noder utan att skriva ut hemligheter. |
| App-runtime startar inte efter TLS-ändring | `deployment_private_ca` har angetts utan en anpassad deployment-ägd transport. | Återgå inte till avstängd certifikatkontroll. Komplettera runtime-kompositionen och CA-distributionen enligt det godkända PKI-beslutet. |
| JSON kan inte läsas | Saknat dubbelt citattecken, extra komma, radbrytning eller ett rotvärde som inte är ett objekt. | Validera exakt värde med `jq -e .` och minifiera på nytt. |
<!-- markdownlint-enable MD013 -->

## Ändra en befintlig policy

Behandla en policyändring som en driftsättnings- och säkerhetsändring:

1. Dokumentera vilket beslut som ändras och vem som har godkänt det.
2. Bedöm om anslutningens attest fortfarande är korrekt.
3. Håll eller aktivera den globala AI-spärren under ändringen.
4. Uppdatera samtliga appnoder atomiskt eller inom ett kontrollerat
   underhållsfönster.
5. Starta om app-runtime så att variablerna läses in på nytt.
6. Verifiera nya modellrevisioner, välj dem på avsedda stabila körprofiler och
   kontrollera profilernas nya konfigurationsversioner.
7. Kontrollera att driftsättningsbevis och larm är godkända innan AI-spärren
   släpps.

Gör inte en policy vidare enbart för att få en aktivering att lyckas. Ett
blockerat utfall betyder att konfigurationen eller det underliggande beslutet
ska utredas.

## Säkerhetsregler

- Lägg aldrig leverantörsnycklar, OAuth-hemligheter, klientcertifikat eller
  privata CA-nycklar i dessa JSON-variabler.
- Använd inte jokertecken för origins eller privata adresser.
- Stäng aldrig av TLS-verifiering för att kringgå ett certifikatfel.
- Tillåt inte privata adresser genom `allowedOrigins`; använd den uttryckliga
  sidecar-policyn och exakta adresser.
- Behandla olika miljöer som separata tillitsgränser. Kopiera inte en
  produktionspolicy till utveckling eller tvärtom utan ny granskning.
- Logga inte endpoint, prompt, bild, modellsvar, leverantörshemlighet eller
  CA-material i felsökningsartefakter.
- Låt nätverkets egressregel och applikationens egress-policy bygga på samma
  granskade destinationslista.

## Checklista före överlämning

- [ ] Varje egress-policynyckel har en utsedd ägare och ett granskat
      destinationsunderlag.
- [ ] Varje publik origin är exakt och saknar sökväg, frågesträng och
      fragment.
- [ ] Varje privat sidecar har exakta origins och samtliga tillåtna
      IP-adresser.
- [ ] Brandvägg eller proxy använder samma destinationsunderlag.
- [ ] Varje TLS-policynyckel matchar Admin Center och har en godkänd
      tillitskedja.
- [ ] Privat CA används endast med en deployment-ägd runtime-transport.
- [ ] Varje avsedd anropstyp har en datapolicy med granskat beslut.
- [ ] Informationsklassernas ordning är dokumenterad från lägst till högst.
- [ ] Regionnamn och klassnamn matchar attesten exakt.
- [ ] Träning är förbjuden och lagringstiden är noll.
- [ ] Personuppgiftsinställningen motsvarar det faktiska användningsfallet.
- [ ] JSON-syntaxen är validerad och varje variabel ligger på en rad.
- [ ] Samtliga appnoder har samma granskade konfiguration och har startats om.
- [ ] Anslutning, modellrevision och varje avsedd stabil körprofil är
      verifierad och konfigurerad.
- [ ] Den globala AI-spärren släpps endast efter godkänd driftsättningsgrind.

## Teknisk auktoritet och vidare läsning

Den här guiden förklarar den nuvarande implementationen. Följande primära
källor är auktoritativa om kontraktet ändras:

- [AI-anslutningens tillitsgräns och policytyper](../../lib/ai/connection-trust.ts)
- [Inläsning av miljövariabler och TLS-komposition](../../lib/ai/admin-external.ts)
- [Fasta anropstyper](../../lib/ai/run-contracts.ts)
- [ADR 0051: AI-integrationslager med körprofiler och adaptrar](../adr/0051-ai-integrationslager-med-korprofiler-och-adaptrar.md)
- [ADR 0052: Tillitsgräns och krypterade AI-leverantörshemligheter](../adr/0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md)
- [ADR 0053: Integritetsminimum för AI-anrop](../adr/0053-integritetsminimum-for-ai-anrop.md)
- [AI Connections Operations](./ai-connections.md)
