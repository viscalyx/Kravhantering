# Rullande utvecklingsberoenden och utvecklarautentisering

Status: Antagen 2026-07-31. Uppdaterad 2026-08-02.

Utvecklingsmiljöerna ska vara aktuella och snabba att använda utan löpande
manuell uppdatering av varje verktyg. Projektet accepterar därför att en
ombyggd utvecklingsmiljö kan skilja sig från en tidigare ombyggnad och
betraktar profilerna för utvecklingscontainrar och den personliga Azure-
utvecklingsmiljön som betrodda utvecklingsgränser.

Beslutet gäller endast profilerna för utvecklingscontainrar och den personliga
Azure-utvecklingsmiljön som hanteras av `scripts/azure-dev.ps1`.
Produktionsbyggen, releaseverifiering och produktionsdrift omfattas inte av
beroendepolicyn i detta beslut.

Konfigurationens syfte avgör om den omfattas, inte var ett kommando körs. Ett
produktionsbygge som startas inifrån en utvecklingscontainer är fortfarande ett
produktionsbygge och ligger utanför beslutets beroendepolicy.
En gemensam Dockerfile som avsiktligt bygger samma egenproducerade container
för utveckling och release hör på motsvarande sätt till releaseartefaktens
byggkontrakt även när en utvecklingsprofil startar bygget. Samma
identitet för basbilden ska då användas i båda sammanhangen.

## Beslut

Externt hämtade tjänstebilder och basbilder i utvecklingsspecifika
byggdefinitioner ska använda tydliga, namngivna taggar och får inte använda
`latest`. Taggen ska vara så smal och stabil som upstreams publiceringsmodell
praktiskt medger.
Kör- och byggreferenser som omfattas enbart av utvecklingspolicyn ska använda
taggen utan tillagd manifest-digest så att den valda versionen är direkt läsbar.
En Compose-tjänst som använder `build` för att bygga en lokal Dockerfile behöver
inte dessutom ange `image` eller ha ett kanoniskt image-lock. Den externt
hämtade basbild som anges med `FROM` i en utvecklingsspecifik Dockerfile
omfattas däremot av kraven.

När samma Dockerfile är den kanoniska byggdefinitionen för en egenproducerad
container som används både som utvecklingsstöd och som releaseartefakt ska dess
`FROM`-referenser behålla produktionens namngivna tagg och manifest-digest.
Utvecklingsprofilen ska bygga samma Dockerfile utan en avvikande
referens till basbilden. Tagg och digest ska uppdateras samordnat för
utvecklings- och releaseanvändningen. Detta gäller för närvarande
HSA-katalogmocken och HSA-personuppslagsadaptern.

Image-lock och releaseevidens får fortsatt registrera
digest och image-ID för verifiering; sådana identiteter är bevis och inte den
normala körreferensen. Dependency-drift-flödet ska fortsatt rapportera när
innehållet under en befintlig tagg får en ny digest. Det registrerade
image-locket uppdateras efter granskning men blockerar inte en vanlig
utvecklingsstart. Basbilden för utvecklingscontainern ska använda en exakt
semantisk versionstagg för den valda Ubuntu-versionen och ha ett separat
kanoniskt image-lock under `containers/`.

De externt hämtade tjänstereferenserna i profilerna för
utvecklingscontainrar och den personliga Azure-utvecklingsmiljön ska använda
samma namngivna taggar som respektive kanoniska image-lock under `containers/`.
Releaseunderlag genereras från dessa image-lock. Utvecklingskonfigurationen
återger endast den namngivna taggen. För Kong är det releaseunderlaget för test-
och HSA-integrationsstöd; Kong ingår därmed i en samordnad versionskanal utan
att behandlas som en normal produktionstjänst.

Verktyg och features som installeras i utvecklingsmiljöerna enligt denna
avgränsning får använda `latest`, en rullande huvudversionskanal eller upstreams
aktuella paketversion. Det omfattar exempelvis devcontainer-features, Codex CLI
och GitHub Copilot CLI, men inte beroenden som ingår i produktionsbyggen eller
releaseartefakter. Projektets schemalagda dependency-drift-flöde och Dependabot
hanterar verktyg och bilder som kräver samordnade uppdateringar. Projektbundna
npm- och .NET-beroenden fortsätter följa sina låsfiler och kompatibilitetskrav.
Förbud mot flytande npm-versioner gäller projektbundna beroenden, den kanoniska
npm-verktygsversionen och beroenden som ingår i produktionsbyggen eller
releaseartefakter. Fristående utvecklingsverktyg som installeras utanför
projektets låsfil, exempelvis GitHub Copilot CLI, får använda `@latest` eller
motsvarande rullande kanal när distributionskanalens integritetsbevis
verifieras enligt detta beslut.
När upstream publicerar en checksumma eller motsvarande integritetsbevis för en
rullande installationskälla ska den verifieras före körning. Avsaknad av ett
sådant bevis ska vara ett uttryckligt dokumenterat undantag. En installation
ska avbrytas när ett förväntat integritetsbevis saknas eller inte stämmer.

Integritetsbeviset ska följa distributionskanalens publiceringsmodell utan att
göra vanliga verktygsversioner statiska. GitHub-releaseartefakter verifieras
mot release-API:ts digest. APT:s signerade metadata och pakethashar, npm-
registrets SRI och OCI-manifestens innehållsdigests räknas som motsvarande
integritetsbevis inom den betrodda utvecklingsgränsen. En nedladdad APT-trust
root verifieras mot granskade primära nyckelfingeravtryck innan den installeras.
Nyckelrotation är en medveten säkerhetsändring, inte vanlig dependency drift.
Nätverkssvar får inte skickas direkt till ett shell när en verifierbar
distributionskanal finns.

Oh My Zsh, `zsh-autosuggestions`, `zsh-syntax-highlighting` och Powerlevel10k
ska fortsätta följa respektive aktuella huvudgren utan versions- eller
commit-pins i kodbasen. Vid en ny Azure-installation löses aktuell branch till
ett exakt Git-objekt som checkas ut och kontrolleras inom samma körning. Git-
objektets innehållsadress ger innehållsintegritet men inte ett fristående bevis
på utgivaridentitet. Upstream garanterar inte signerade rullande branch-heads;
detta är därför ett uttryckligt undantag. Undantaget omfattar även Oh My Zsh-
och plugin-kloner som utförs av devcontainer-features. Undantaget ska omprövas
om upstream inför en signerad rullande kanal, men får inte ersättas av statiska
tool-pins som kräver rutinmässigt versionsunderhåll.

När en ny Azure-VM skapas används Marketplace-beteckningen `latest` endast för
uppslagning. Uppslaget måste ge en aktiv exakt image-version, och den exakta
versionen skickas till Azure-driftsättningen. En befintlig VM behåller sin redan
valda exakta image-version.

Devcontainer-profilerna och Azure Remote SSH får automatiskt vidarebefordra
`GH_TOKEN` och `COPILOT_GITHUB_TOKEN` från arbetsstationen. Devcontainer-
profilerna får återanvända arbetsstationens Codex-autentisering. OpenRouter-
nycklar ska i stället läsas från applikationens lokala ignorerade `.env`-fil och
inte vidarebefordras till hela utvecklingsmiljön. SSH-agent-forwarding ska vara
aktiverad för den namngivna Azure-hostprofilen. Projektet inför inte separata
autentiseringssessioner eller nycklar för varje dagligt verktygsanrop. Den
personliga Azure-utvecklingsmiljön får ha en miljölokal Codex-session som skapas
vid en första inloggning; arbetsstationens Codex-autentisering ska inte kopieras
automatiskt till VM:n. Uppgifterna ska ligga i arbetsstationens säkra credential
store, ha minsta praktiska behörighet och rimlig giltighetstid och bara användas
i betrodda utvecklingsmiljöer.

Som ett avgränsat undantag får arbetsstationsöverföringen i
`scripts/azure-dev.ps1` valfritt inkludera `GH_TOKEN` och
`COPILOT_GITHUB_TOKEN` i ett svarspaket. Båda tokenvärdena ska vara uteslutna
som standard och kräva separata aktiva val. Paketet ska krypteras till
destinationsarbetsstationens SSH-nyckel. Efter extraktion får tokenvärdena
endast finnas tillfälligt som klartext i den privata extraktionskatalogen för
att läsas in processlokalt eller flyttas till ett befintligt säkert credential
store. På Windows ska extraktionsflödet ta bort ärvda åtkomstregler, ge endast
den aktuella användaren fullständig behörighet och avbryta om den skyddade ACL:n
inte kan verifieras. Användaren avgör när överföringen är färdig och ansvarar då
för att ta bort extraktionskatalogen och tokenfilerna med det tillhandahållna
städflödet. Undantaget gäller endast överföring mellan betrodda arbetsstationer;
det tillåter inte beständig tokenlagring i kodbasen, utvecklingsmiljön, SSH-
konfigurationen eller skalprofiler och tillåter inte att tokenvärden kopieras
till Azure-VM:n.

Förtroendet för utvecklingsmiljöerna ärver inte vidare till produktionsbyggen
eller publicerade releaseartefakter. De får inte ta emot eller innehålla
utvecklarens token, Codex-autentisering eller SSH-agent. Denna gräns
upprätthålls av release-arbetsflödet, dess build context och fokuserade
kontraktstester.

Kontraktstester för beslutet ska kontrollera policyinvarianter och relationer,
inte hårdkodade versionsvärden. De ska jämföra duplicerade utvecklingstaggar
med respektive kanoniska image-lock och gälla lika för människor och botar.
Dependabot och andra automatiska uppdateringsflöden ska kunna skapa pull
requests som går att slå samman utan manuella teständringar när de uppdaterar
de beroenden som de äger och bevarar kontrakten. En uppdateringskanal som äger
en lockbaserad tjänstebild måste uppdatera hela den samordnade referensmängden.
Tester och dependency-drift ska kräva att samtliga byggdefinitioner i den
samordnade Node-kanalen använder samma tagg och digest. En ändring ska omfatta
programmets containerbild och de HSA-bilder som används i både utveckling och
release.
Tester för rullande verktyg får inte lagra verktygsversioner eller Git-commit-
ID:n. Observerbara image- och installerartester ska kontrollera att verktygen
går att köra och att saknad eller felaktig integritetsevidens stoppar
installationen före exekvering.

## Konsekvenser

En upstream-tagg, feature eller installationskälla kan ändras mellan
ombyggnader. Det minskar reproducerbarheten och innebär en kvarstående
supply-chain-risk. Rullande shell-tillägg har dessutom den uttryckligen
accepterade risken att Git-objektet saknar fristående utgivarautentisering.
Basbilder i gemensamma utvecklings- och releasebyggen är däremot låsta till
releaseidentiteten tills den samordnade uppdateringskanalen uppdateras. Där
prioriteras utvecklings- och releaseparitet framför att samma tagg kan få nytt
innehåll mellan utvecklingsbyggen.
Processer inom den betrodda utvecklingsgränsen kan använda
vidarebefordrade credentials eller be SSH-agenten utföra operationer under en
aktiv anslutning. Riskacceptansen hanteras externt. Riskerna ska omprövas vid
incidenter, ändrad behörighetsomfattning eller förändrad gräns mellan utveckling
och produktion.
Den valfria arbetsstationsöverföringen innebär dessutom att valda GitHub-token
kan finnas tillfälligt i ett krypterat överföringspaket och som klartext i en
privat extraktionskatalog tills användaren bedömer att överföringen är färdig
och genomför den uttryckliga städningen.

Beslutet avvisar den oföränderliga utvecklingsmiljö och de separata
autentiseringssessioner som föreslås i
[issue 489](https://github.com/viscalyx/Kravhantering/issues/489).
