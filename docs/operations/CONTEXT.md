# Driftsättning och leverans

Detta sammanhang beskriver verksamhetsspråket för hur Kravhantering paketeras,
driftsätts, uppgraderas, verifieras och överlämnas till drift.

## Språk

Primärt ordlistespråk: `sv`

### Azure-utvecklingsmiljöns livscykel

**Livscykelresultat för Azure-utvecklingsmiljö**:
Ett typat terminalt utfall som anger vad ett start- eller stoppkommando
uppnådde eller begärde för en bestämd Azure-utvecklingsmiljö. Det är skilt
från förloppsmeddelanden och lokala diagnostiska loggposter.

- `en`: Azure development-environment lifecycle result

_Avoid_: Operationsutdata, förloppsmeddelande, livscykelloggpost.

**Livscykelloggpost för Azure-utvecklingsmiljö**:
Ett hemlighetsfritt lokalt diagnosunderlag om ett avslutat start- eller
stoppförsök. Posten är inte auktoritativ för miljöns tillstånd och avgör inte
dess livscykelresultat.

- `en`: Azure development-environment lifecycle log record

_Avoid_: Livscykelresultat, Azure-aktivitetslogg, auktoritativ tillståndspost.

### AI-drift

**AI-driftsättningsbevis**:
Ett maskinverifierbart och innehållsfritt underlag som visar att en bestämd
miljö och dess avsedda AI-anropsvägar uppfyller villkoren för att den globala
AI-spärren ska få släppas.

- `en`: AI deployment evidence

_Avoid_: AI-hälsa, readiness, fritextintyg, staging-liveprov.

**Staging-liveprov för AI**:
Ett uttryckligen aktiverat, syntetiskt prov av avsedda AI-anropsvägar i en
identifierad stagingmiljö medan den globala AI-spärren är aktiv.

- `en`: AI staging live test

_Avoid_: Produktionslikt prov, produktionsprov, manuellt leverantörsanrop.

### Driftsättningsmodeller, leverans och verifiering

**Verifiering av driftsättning enligt guide**:
En manuellt initierad och avgränsad kontroll där en publicerad release
driftsätts enligt en dokumenterad guide och uttryckligen angivna värd- och
guidekontrakt verifieras. Resultatet gäller endast den provade releasen,
topologin och miljön och utgör inte RHEL-certifiering, RHEL-kvalificering eller
någon utfästelse om support från Red Hat.

- `en`: Guide-based deployment verification

_Avoid_: Röktest av driftsättningsguide, guideverifiering, RHEL-certifiering,
RHEL-kvalificering.

**Driftsättningsverifiering**:
Accepterad kortform för verifiering av driftsättning enligt guide när
sammanhanget tydligt visar att en dokumenterad guide följs.

- `en`: Deployment verification

_Avoid_: Driftsättningsverifiering när sammanhanget inte visar att en
dokumenterad guide följs.

**Driftsättningsverifieringsoperatör**:
Den person som är tilldelad en administratörsskapad resursgrupp för
driftsättningsverifiering, manuellt startar dess körningar och godtar ansvaret
för kostnader från kvarhållna resurser.

- `en`: Deployment-verification operator

_Avoid_: Initierare av en körning, Git-författare, resursgruppsägare.

**Verifieringsindata för driftsättning**:
En körspecifik och oföränderlig överlämning av ett reproducerat
driftsättningsarkiv och dess kontrollerade ursprung till verifiering av
driftsättning enligt guide.

- `en`: Deployment verification input

_Avoid_: Föränderlig lokal sökväg, publicerad release när ursprunget är
lokalt.

**Körbegäran för driftsättningsverifiering**:
En versionerad och hemlighetsfri post som fryser operatörens validerade val av
ursprung, genererade driftsättningsunderlag, typade bindningar och källa till
förväntat resultat innan en driftsättningsverifiering påbörjas.

- `en`: Deployment-verification run request

_Avoid_: Verifieringsindata för driftsättning, kommandoradsargument,
verifieringsresultat.

**Evidenspaket för driftsättningsverifiering**:
En versionsbunden och integritetsskyddad samling av de hemlighetsfria underlag
som ligger till grund för en driftsättningsverifierings slutliga status.
Paketet förseglas när statusen fastställs och ändras inte av senare diagnostik.

- `en`: Deployment-verification evidence bundle

_Avoid_: Verifieringsindata för driftsättning, föränderlig loggkatalog,
hemlighetsarkiv.

**Diagnostisk efterinsamling för driftsättningsverifiering**:
En skrivskyddat tillagd insamling av diagnostiska underlag efter att en
driftsättningsverifiering har fått sin slutliga status. Insamlingen binds till
det förseglade evidenspaketet men kan inte ändra dess status.

- `en`: Deployment-verification post-run diagnostic capture

_Avoid_: Omkörning, ändring av evidenspaket, reparation till godkänt resultat.

**Källa till förväntat resultat**:
Ett versionerat och självständigt författat kontrakt som anger vilket
observerbart resultat en driftsättningskontroll förväntar sig. Det härleds
inte från driftsättningsmodellen eller dess genererade eftervillkor.

- `en`: Source of expected results

_Avoid_: Orakel, genererat eftervillkor, kvalificeringskriterium.

**Betrodd exekveringsmodul för driftsättningsverifiering**:
En separat granskad modul som ensam innehar privilegierade
autentiseringsuppgifter och godkänner avgränsade exekveringsbegäranden mot
frysta verifieringsindata.

- `en`: Trusted deployment-verification execution module

_Avoid_: Broker, godtycklig fjärrexekverare, driftsättningsverifiering när hela
arbetsflödet avses.

**Gästförberedelse för driftsättningsverifiering**:
En betrodd och körbunden förberedelse av en Rocky Linux-gäst med de värd- och
stödruntimeförutsättningar som driftsättningsverifieringen äger utanför
genererade guidekontraktssteg.

- `en`: Deployment-verification guest preparation

_Avoid_: Gästbootstrap, värdprovisionering, databasbootstrap,
Keycloak-bootstrap.

**Driftsättningsmodell**:
Den auktoritativa och versionerade beskrivningen av stödda
driftsättningsförlopp, topologier, villkor och verifierbara eftervillkor.
Genererade driftsättningsunderlag härleds från modellen och är aldrig
självständiga kommandokällor.

- `en`: Deployment model

_Avoid_: Driftsättningsguide när den auktoritativa modellen avses,
verifieringsplan.

**Kandidat till driftsättningsmodell**:
En icke-auktoritativ men strukturellt komplett modell som granskas mot
förväntade resultat före en auktoritetsväxling för driftsättning. Den får
inte användas som releaseindata.

- `en`: Deployment model candidate

_Avoid_: Driftsättningsmodell när auktoriteten saknas, partiell modell,
releasemodell.

**Driftsättningssammansättare**:
En deterministisk byggtidsmodul som validerar en driftsättningsmodell och
antingen framställer en komplett genererad driftsättningssamling eller
diagnostik. Den utför inte driftsättningsarbete.

- `en`: Deployment Composer

_Avoid_: Driftsättningsbyggare, driftsättningsgenerator,
driftsättningsorkestrerare.

**Driftsättningsförfattare**:
En människa eller AI-agent som föreslår en ändring i driftsättningsmodellen,
ett prosafragment eller ett återgivningskontrakt för
driftsättningsoperationer. Båda typerna av aktör har samma författarroll;
godkännande är en separat roll.

- `en`: Deployment author

_Avoid_: AI-författare eller mänsklig författare när aktörstypen inte ändrar
författarskapet.

**Driftsättningsmodellås**:
Ett innehållsadresserat manifest som identifierar en sluten ögonblicksbild av
exakta byteföljder för modellkällor, prosafragment och scheman samt föregående
identitetsliggare.

- `en`: Deployment model lock

_Avoid_: Källpekare, driftsättningsmodellögonblicksbild när manifestet avses.

**Byggindatalås för driftsättningssammansättaren**:
Ett innehållsadresserat manifest som identifierar de exakta käll-,
konfigurations-, beroende- och verktygskedjeindata som bygger ett paket med
driftsättningssammansättaren.

- `en`: Deployment Composer build-input lock

_Avoid_: Bygglås för Deployment Composer, bygglås för
driftsättningsbyggaren.

**Indatalås för driftsättningssammansättning**:
Ett innehållsadresserat manifest som binder ett driftsättningsmodellås och ett
byggindatalås för driftsättningssammansättaren till de releasefakta som används
vid en bestämd sammansättning.

- `en`: Deployment composition input lock

_Avoid_: Driftsättningsmodellås, releaseplan.

**Sammansättningsrapport för driftsättning**:
Ett kvitto på en lyckad driftsättningssammansättning som identifierar dess
exakta indata, kontrakt och genererade resultat utan att ge behörighet att
utföra eller publicera dem.

- `en`: Deployment composition report

_Avoid_: Verifieringsresultat, publiceringsgodkännande, kommandokälla.

**Förhandsgranskningsfakta för driftsättning**:
En versionerad och hemlighetsfri uppsättning representativa releasefakta som
används för lokal granskning och ändringsgranskning. Den ger inte behörighet
att framställa eller publicera en release.

- `en`: Deployment preview facts

_Avoid_: Autentiserade releasefakta, publiceringsunderlag, testhemligheter.

**Byggindatalås för driftsättningsarkiv**:
Ett innehållsadresserat manifest som identifierar alla exakta indata utanför
driftsättningssammansättaren och binder dem till den genererade
driftsättningssamlingen och paketeringskontraktet för ett komplett arkiv.

- `en`: Deployment archive build-input lock

_Avoid_: Arkivmanifest för driftsättning, indatalås för
driftsättningssammansättning.

**Driftsättningsarkivpaketerare**:
En deterministisk byggtidsmodul som framställer ett kanoniskt
driftsättningsarkiv från verifierade och låsta arkivindata. Den sätter inte
samman driftsättningsmodellen och utför inte driftsättningsarbete.

- `en`: Deployment archive packager

_Avoid_: Driftsättningssammansättare, driftsättningsbyggare,
driftsättningsverifierare.

**Arkivmanifest för driftsättning**:
Ett innehållsadresserat manifest som identifierar varje annat innehåll i ett
autentiserat driftsättningsarkiv och dess roll, så att det extraherade arkivet
kan kontrolleras som en helhet.

- `en`: Deployment archive manifest

_Avoid_: Manifest för genererat driftsättningsunderlag,
driftsättningssamling.

**Genererat driftsättningsunderlag**:
En deterministiskt framtagen och sammanhållen uppsättning av en guide, en
maskinläsbar körplan, ett manifest och en källkarta för exakt ett
driftsättningsförlopp och driftsättningsscenario. Vid en releaseövergång
identifierar underlaget även exakt käll- och målrelease; det härleds från
driftsättningsmodellen utan att ersätta den som auktoritativ källa.

- `en`: Generated deployment set

_Avoid_: Driftsättningsprojektion, enskild genererad guide,
driftsättningsmodell.

**Genererad driftsättningssamling**:
Den atomiskt framställda samlingen av samtliga genererade
driftsättningsunderlag som en release kräver. Samlingen är antingen komplett
eller saknas; ett urval av underlagen är inte en genererad
driftsättningssamling.

- `en`: Generated deployment collection

_Avoid_: Releasearkiv, enskilt genererat driftsättningsunderlag.

**Auktoritetsväxling för driftsättning**:
Den enda ändring där driftsättningsmodellen och dess genererade
driftsättningssamling ersätter de handskrivna anslutna guiderna som
auktoritativ kommandokälla. Växlingen lämnar ingen blandad auktoritet.

- `en`: Deployment authority switch

_Avoid_: Stegvis auktoritetsbyte, parallella auktoritativa guider.

**Auktoritetspost för driftsättning**:
En versionerad releasepolicy som aktiverar ett exakt godtaget
driftsättningsmodellås med tillhörande kontrakt och identitetsliggare från en
angiven release. Posten ligger utanför modellen, som inte kan ge sig själv
auktoritet.

- `en`: Deployment authority record

_Avoid_: Modellstatus, publiceringsflagga i driftsättningsmodellen,
releaseanteckning.

**Godtagandepost för driftsättningsmodell**:
En oföränderlig post som binder obligatorisk verifierings- och
återgångsevidens till exakta modell-, kontrakts- och godkännandeidentiteter
inför en auktoritetsväxling. Posten ger inte själv driftsättningsauktoritet.

- `en`: Deployment model acceptance record

_Avoid_: Auktoritetspost för driftsättning, verifieringsresultat,
kvalificeringsresultat.

**Driftsättningsförlopp**:
En stabilt identifierad och uttryckligen ordnad sammansättning av
guidekontraktssteg för ett livscykelfall, exempelvis förstagångsinstallation
eller uppgradering under planerat driftstopp.

- `en`: Deployment journey

_Avoid_: Driftsättningsscenario, driftsättningsguide.

**Driftsättningsscenario**:
Ett konkret urval av driftsättningsförlopp, topologi, anslutningssätt,
beroendeprofiler och eventuell releaseövergång som avgör vilka delar av en
driftsättningsmodell som ska ingå i ett genererat driftsättningsunderlag och
verifieras.

- `en`: Deployment scenario

_Avoid_: Topologi när hela urvalet avses, verifieringsmiljö.

**Releaseövergång**:
En uttryckligen stödd relation mellan en autentiserad källrelease och en
autentiserad målrelease inom samma topologi och identitetsprofil för enkelnod.

- `en`: Release transition

_Avoid_: Versionsintervall, implicit migrationskedja, byte av topologi eller
identitetsprofil.

**Källreleaselås för driftsättning**:
Ett innehållsadresserat manifest som identifierar det exakta autentiserade
källreleasearkiv och de driftsättnings- och avbildsidentiteter som en
releaseövergång kräver för förkontroll och återgång.

- `en`: Deployment source-release lock

_Avoid_: Källreleasebevis, enbart källreleasetagg.

**Återgångskontrollpunkt**:
Ett verifierat tillstånd under en releaseövergång som avgör vilken
återgångsväg som gäller om övergången inte kan slutföras.

- `en`: Rollback checkpoint

_Avoid_: Misslyckat steg, stegnummer, obekräftat tillstånd.

**Beständig mutationsgräns**:
Den tidigaste punkt i en releaseövergång där målreleasen kan göra beständigt
tillstånd inkompatibelt med källreleasen.

- `en`: Persistent-mutation boundary

_Avoid_: Databasmigreringsstart när en tidigare beständig verkan kan passera
gränsen.

**Konfigurationsdisposition**:
En uttrycklig klassning av om en berörd konfigurationsmängd ska behållas,
införas, ersättas, omformas eller tas ur bruk under en releaseövergång.

- `en`: Configuration disposition

_Avoid_: Implicit konfigurationsbevarande, konfigurationsändring utan klassning.

**Källreleasebevis**:
Ett underlag som visar att en installerad driftsättning motsvarar den exakta
källrelease, topologi, identitetsprofil, databasversion och konfiguration som en
releaseövergång kräver.

- `en`: Source-release evidence

_Avoid_: Operatörsangivet versionsnummer, enbart databasversion.

**Återställningsmängd**:
En namngiven samling av källreleaseartefakter, konfiguration, beständigt
tillstånd och nyckelmaterial som måste bevaras, provas och vid behov
återställas tillsammans under en releaseövergång.

- `en`: Recovery set

_Avoid_: Säkerhetskopia när flera samordnade tillgångar avses, fristående
återställningspunkt.

**Vilolägeskontrakt för releaseövergång**:
Den uttryckliga beskrivningen av vilka ingångar och tillståndsskapande
arbetsbelastningar som måste vara blockerade eller avslutade innan en
releaseövergång får ändra beständigt tillstånd.

- `en`: Release-transition quiescence contract

_Avoid_: Trafikdränering när även bakgrundsarbete eller andra ingångar avses.

**Oåterkallelig driftsättningsverkan**:
En beständig verkan under en releaseövergång som ingen angiven
återställningsmängd kan återställa fullständigt.

- `en`: Irreversible deployment effect

_Avoid_: Återställningsbar verkan, fullständig återgång.

**Återgångsväg**:
En uttryckligen ordnad sammansättning av guidekontraktssteg som från en
återgångskontrollpunkt återupprättar källreleasens angivna tillstånd och
alla erforderliga eftervillkor. Den kan inte fullständigt återställa en
oåterkallelig driftsättningsverkan, som därför inte får hindra detta tillstånd.

- `en`: Rollback route

_Avoid_: Omvänd uppgraderingsordning, automatisk nedmigrering.

**Driftöverlämning för releaseövergång**:
Det bekräftade slutet på en releaseövergång där målreleasen har godtagits och
normal skrivande trafik har återupptagits.

- `en`: Release-transition operational handoff

_Avoid_: Enbart trafiköppning, återgångskontrollpunkt.

**Scenarioegenskap**:
Ett typat och auktoritativt faktum som ingår i ett driftsättningsscenario och
som används för begränsade val när ett genererat driftsättningsunderlag sätts
samman, exempelvis driftsättningsförlopp, topologi eller miljöklass.

- `en`: Scenario property

_Avoid_: Fritt villkor, redundant egenskap som kan härledas från andra
scenarioegenskaper.

**Härledd scenariokapabilitet**:
En Composer-ägd egenskap som härleds entydigt från ett driftsättningsscenarios
auktoritativa fakta, exempelvis databasens anslutningssätt eller scenariots
uppsättning av tjänster, avbilder, enheter och nätverk.

- `en`: Derived scenario capability

_Avoid_: Självständigt författad scenarioegenskap, operatörsval.

**Identitetsprofil för enkelnod**:
En avgränsad profil för enkelnodstopologin som anger om
identitetsleverantören är extern eller medlevererad och om den medlevererade
lösningen är härdad.

- `en`: Single-node identity profile

_Avoid_: Identitetsläge, Keycloak-profil.

**Driftsättningsmiljöklass**:
En obligatorisk klassificering av ett driftsättningsscenario som produktion,
utveckling eller test och som styr vilka miljöavgränsade uppgifter modellen
får referera till.

- `en`: Deployment environment class

_Avoid_: Driftsättningsscenario när endast miljöns säkerhetsklass avses,
miljötyp utan driftsättningssammanhang.

**Semantisk driftsättningsoperation**:
En typad, stabilt identifierad operation ur den slutna vokabulären för
genererade driftsättningsunderlag. Den beskriver avsedd driftsättningsverkan
utan att bädda in exekverbara kommandon eller styrlogik.

- `en`: Semantic deployment operation

_Avoid_: Godtyckligt kommando, skriptsteg, guidekontraktssteg.

**Återgivningskontrakt för driftsättningsoperation**:
Ett oföränderligt och versionsbundet kontrakt som återger en semantisk
driftsättningsoperation som exakta kommandon och sammanhängande genererade
representationer. Det väljer inte operationens tillämplighet eller ordning.

- `en`: Deployment operation renderer contract

_Avoid_: Kommandomall, prosafragment, godtyckligt skript.

**Operationsutdata**:
Ett typat värde som en semantisk driftsättningsoperation producerar under
exekvering och som en senare operation kan använda genom en uttrycklig bindning.
Värdet är skilt från den evidens som visar hur det togs fram.

- `en`: Operation output

_Avoid_: Evidens när värdet ska återanvändas, fritt skriptvärde,
modellförfattad variabel.

**Offentlig testautentiseringsuppgift**:
En avsiktligt offentlig autentiseringsuppgift som är avgränsad till
utvecklings- och testmiljöer och som aldrig får användas i produktion. Värdet
kan dokumenteras eller versionshanteras eftersom det inte är en hemlighet.

- `en`: Public test credential

_Avoid_: Välkänd hemlighet, produktionshemlighet, standardlösenord.

**Guidekontraktssteg**:
En stabilt identifierad exekveringsenhet som en driftsättningsmodell
återger som ett kommandoblock i guiden och en motsvarande del i den
maskinläsbara körplanen inom samma genererade driftsättningsunderlag. Identitet,
körkontext, tillämplighet och eftervillkor ska vara samstämmiga mellan
underlagets genererade material.

- `en`: Guide contract step

_Avoid_: Verifieringssteg, PowerShell-steg, godtyckligt radintervall.

**Topologispecifik verifieringsmiljö**:
En avgränsad miljö för verifiering av driftsättning enligt guide som
representerar exakt en vald driftsättningstopologi från en ren
förstagångsinstallation. Den har egen topologilokal identitet, konfiguration,
tillstånd och evidens även när externa tjänsteplattformar delas med andra
verifieringsmiljöer.

- `en`: Topology-specific verification environment

_Avoid_: Topologikörning när miljön avses, topologi när den avgränsade miljön
avses.

**Beroendebindningspost för driftsättningsverifiering**:
En versionerad och hemlighetsfri post som binder en topologispecifik
verifieringsmiljö till dess förberedda externa beroenden och till de publika
referenser som ett genererat driftsättningsunderlag får använda.

- `en`: Deployment-verification dependency binding record

_Avoid_: Hemlighetsfil, körbegäran för driftsättningsverifiering,
genererat driftsättningsunderlag.

**Delat beroendeplan för driftsättningsverifiering**:
En gemensam plattform av externa stödtjänster som betjänar flera
topologispecifika verifieringsmiljöer i samma driftsättningsverifiering.
Tjänsteplattformen kan delas, men varje verifieringsmiljö behåller egna
logiska data, identiteter och hemligheter.

- `en`: Shared deployment-verification dependency plane

_Avoid_: Delad verifieringsmiljö när beroendeplanet avses, gemensam databas,
gemensam identitet.

**Publikt tjänstenamn för driftsättningsverifiering**:
Ett körspecifikt DNS-namn som identifierar samma verifieringstjänst för
webbläsare, kontrollklienter och interna klienter även när namnet ger olika
adresser beroende på var klienten finns.

- `en`: Deployment-verification public service name

_Avoid_: Publik IP-adress när tjänsteidentiteten avses, internt alias.

**Privat tjänstenamn för driftsättningsverifiering**:
Ett körspecifikt DNS-namn för en verifieringstjänst som endast ska kunna nås
från det avgränsade beroende- eller administrationsnätet.

- `en`: Deployment-verification private service name

_Avoid_: Publikt tjänstenamn, värdnamn utan åtkomstomfång.

**Kör-PKI för driftsättningsverifiering**:
En körspecifik samling av skilda tillitsdomäner och certifikatmaterial som
endast ger de deltagande verifieringstjänsterna sina fastställda identiteter
och behörigheter.

- `en`: Deployment-verification run PKI

_Avoid_: Gemensam test-CA, universell kör-CA, produktions-PKI.

**TLS-termineringspunkt för driftsättningsverifiering**:
Den publika ingång som avslutar TLS för en topologispecifik verifieringsmiljö
med `app-node-http` och vidarebefordrar HTTP endast till miljöns privata
lyssnare.

- `en`: Deployment-verification TLS edge

_Avoid_: Application Gateway när rollen avses, lastbalanserare när den exakta
rollen inte framgår.

**Frånkopplad produktionsmiljö**:
En produktionsmiljö som har intern nätverksanslutning men saknar internetåtkomst
till releasekällor, containerregister eller andra externa artefaktkällor.

- `en`: Disconnected production environment

_Avoid_: Offline miljö, air-gapped miljö när bara extern åtkomst saknas.
