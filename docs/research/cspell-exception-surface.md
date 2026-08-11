# Projektets cSpell-undantagsyta

<!-- cSpell:words coreutils privkey readlink resolv -->
<!-- cSpell:words globuttrycket kodidentifierare -->
<!-- cSpell:words ordöverriden paketlåsfilen -->

## Sammanfattning

Projektets undantagsyta är större och mer blandad än antalet poster i
`cspell.jsonc` först antyder:

- Den centrala listan innehåller 1 268 poster, men bara 1 237 unika poster när
  skiftläge ignoreras. Tre poster är exakta dubbletter och 28 grupper är
  skiftlägesvarianter. Konfigurationen anger samtidigt
  `caseSensitive: false`.
- 721 centrala poster förekommer som fristående lexikala token i filer som
  `spell:check` faktiskt kontrollerar. Ytterligare 173 förekommer bara utanför
  kontrollytan. 374 förekommer inte i någon annan spårad fil än
  `cspell.jsonc` och är därför tydliga granskningskandidater, inte automatiskt
  säkra borttagningar.
- Projektet innehåller 101 verkliga lokala direktivrader i 54 filer samt ett
  dokumenterat direktivexempel. Direktiven `ignore` och `words` innehåller 245
  poster, motsvarande 174 unika poster när skiftläge ignoreras.
- Den faktiska kontrollen når 89 lokala direktivrader och 200 lokala poster i
  44 filer. Tolv verkliga direktivrader i tio filer ligger utanför kontrollen
  på grund av dold katalog eller filtyp.
- Minst 124 av de 200 lokala posterna på kontrollytan är redan accepterade av
  den befintliga basen eller förekommer i den centrala listan. De är en konkret
  första städyta, men varje borttagning behöver verifieras i sin riktiga fil.

Undantagsytan bör därför klassificeras efter ordets roll och användning före en
migrering. En generell svensk ordlista kan minska gruppen normalsvenska ord,
men den ersätter inte projektets domänord, egennamn, fixtures och tekniska
identifierare.

## Omfattning och källor

Inventeringen använder commit
[`fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab`](https://github.com/viscalyx/Kravhantering/tree/fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab)
som bas. Primärkällorna är följande:

- [cSpell-konfigurationen](https://github.com/viscalyx/Kravhantering/blob/fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab/cspell.jsonc)
  definierar språk, svensk import, centrala ord, undantag, filtyper och
  skiftlägesregler.
- [paketskripten och beroendena](https://github.com/viscalyx/Kravhantering/blob/fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab/package.json)
  definierar kontrollens glob och paketintervall.
- [paketlåsfilen](https://github.com/viscalyx/Kravhantering/blob/fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab/package-lock.json)
  låser `cspell` till 10.0.1 och `@cspell/dict-sv` till 2.3.2.
- Den installerade svenskordlistans
  [paketkälla](https://github.com/streetsidesoftware/cspell-dicts/tree/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv)
  beskriver den som en förbyggd cSpell-ordlista, konfigurerad för alla filtyper
  med svensk locale och licensierad under GPL-3.0-or-later.
- [projektets agentinstruktion](https://github.com/viscalyx/Kravhantering/blob/fd91fba0edf9bf3410bdf8a171b3bb4ad05a82ab/AGENTS.md#spelling)
  anger när ett rapporterat ord ska rättas eller läggas till.

Ingen ändring av ordlistor eller direktiv ingår i inventeringen.

## Metod

Analysen gör följande:

1. Läser `cspell.jsonc` som JSON och räknar centrala poster exakt samt efter
   svensk skiftlägesnormalisering.
2. Hämtar samtliga spårade filer med `git ls-files -z` och söker
   direktivliknande rader skiftlägesokänsligt. Kommentarslut och kommatecken
   tas bort innan poster i `ignore` och `words` räknas.
3. Kör samma glob som `spell:check` med cSpells JSON-rapportör. Eftersom
   arbetskopian ligger under den ignorerade katalogen `.worktrees` sätts
   Git-ignore-roten uttryckligen till arbetskopians rot. Det ändrar inte
   huvudkopians normala urval, men förhindrar att hela forskningskopian
   felaktigt filtreras bort.
4. Jämför de rapporterade filerna med direktivinventeringen för att skilja
   verklig kontrollyta från spårat innehåll utanför kontrollen.
5. Delar spårat UTF-8-innehåll i token med Unicode-bokstäver, siffror,
   understreck och bindestreck. Jämförelsen normaliserar till NFC och ignorerar
   skiftläge. `cspell.jsonc` räknas inte som användning av sina egna ord.
6. Provar centrala och lokala poster en per rad mot `en,sv`, den installerade
   svenska ordlistan och cSpells standardordlistor, utan projektets centrala
   ord eller lokala direktiv.

Metoden är reproducerbar men inte en fullständig emulering av cSpells interna
ordsegmentering. Särskilt camel case, sammansatta ord, ordlistor som är
specifika för filtypen, genererade eller ej spårade filer och framtida
användning kan göra en post nödvändig trots att den saknar en exakt token i
dagens spårade innehåll.

## Konfiguration och kontrollkedja

Konfigurationen använder `language: "en,sv"` och importerar
`@cspell/dict-sv/cspell-ext.json`. Samma språk gäller hela projektet; det finns
ingen separat språkinställning per katalog eller fil. Den enda ordöverriden
som är specifik för en fil lägger till fem poster för
`tests/guide/generate-guide.spec.ts`.

`spell:check` ingår i `npm run check` och anropar:

```text
cspell "**/*.{ts,tsx,js,jsx,md,json}" --no-progress
```

Konfigurationens `enableFiletypes` nämner även JSONC, YAML och text, men
skriptets glob når inte dessa filändelser. Globuttrycket når inte heller dolda
kataloger utan flaggan `--dot`. `package.json` matchar globuttrycket men stängs
av av en override; `package-lock.json` finns i `ignorePaths`.

### Faktiskt kontrollerade filer

| Filtyp | Påbörjade | Kontrollerade | Orsak till hopp |
| --- | ---: | ---: | --- |
| TypeScript (`.ts`) | 818 | 818 | - |
| React TypeScript (`.tsx`) | 324 | 324 | - |
| Markdown (`.md`) | 120 | 120 | - |
| JSON (`.json`) | 26 | 23 | Tre `package.json`-filer stängs av |
| JavaScript (`.js`) | 6 | 6 | - |
| JSX (`.jsx`) | 0 | 0 | Inga spårade filer |
| Totalt | 1 294 | 1 291 | Tre filer hoppas över |

Detta innebär bland annat att direktiv i `.mjs`, Dockerfile, Nginx-filer,
mallar och dolda `.devcontainer`- eller `.github`-kataloger inte påverkar
den nuvarande CI-kontrollen.

## Den centrala listan

### Storlek och redundans

| Mått | Antal |
| --- | ---: |
| Poster i `words` | 1 268 |
| Unika exakta poster | 1 265 |
| Unika poster utan hänsyn till skiftläge | 1 237 |
| Exakta dubblettposter | 3 |
| Grupper med skiftlägesvarianter | 28 |
| Poster i override för en specifik fil | 5 |
| Poster i `flagWords` | 0 |
| Poster i `ignoreRegExpList` | 0 |

De exakta dubbletterna är `specresp`, `kravfrågor` och `unvalidated`.

Skiftlägesgrupperna omfattar bland annat `Framåtmarkörer`, `mocken`,
`RetentionFresh`, `RetentionLinked`, `RetentionOrphan`, `råresultat`,
`cutover`, `appavbildningen`, `Appcontainern`, `Kravområdesägare`,
`Kravområdesmedförfattare`, `Kravtillämpning`, `Kravtillämpningen`,
`Kravunderlagsansvarigs`, `Kravunderlagsmedförfattare`, `Kravunderlagskod`,
`Kravunderlagslokalt`, `Kravversionsstatus`, `normbibliotek`, `Driftscenario`,
`Genomföranderapport`, `Katastrofåterställning`,
`Kapacitetsobserverbarhet`, `Molndrift`, `modalen`, `Sidinnehållet`,
`röktestflödet` och `runnern`. Eftersom kontrollen inte är skiftlägeskänslig
behövs bara en variant per grupp.

### Användningssignal

| Exakt lexikal förekomst utanför `cspell.jsonc` | Antal poster |
| --- | ---: |
| I faktisk `spell:check`-yta | 721 |
| Bara i andra spårade filer | 173 |
| Ingen annan spårad förekomst | 374 |
| Totalt | 1 268 |

Gruppen utan annan förekomst innehåller exempelvis `dialogfaser`,
`kodbaserad`, `claimet`, `karlpersson`, `mariaj`, `saraholm`,
`kravpaketslistan`, `appcontainrar`, `refaktorisering`, `annalindq`,
`kodbasanalysen`, `skillinstruktion` och `wayfinder`. Gruppen som bara
förekommer utanför kontrollen innehåller bland annat `rubygems`, `skopeo`,
`nodev`, `nosuid`, `versionering`, `observerbarhet` och `backendprompt`.

Ett fristående bastest accepterar 94 av de 1 268 centrala posterna redan utan
projektets `words`. Det är en säker signal om överlapp med dagens bas i den
testformen, men inte ett löfte om att alla 94 kan tas bort samtidigt utan ett
fullständigt korpustest.

## Lokala direktiv

### Omfattning

| Direktivtyp | Textuella träffar | Verkliga direktiv |
| --- | ---: | ---: |
| `ignore` | 43 | 43 |
| `words` | 46 | 46 |
| `disable` | 3 | 3 |
| `enable` | 3 | 3 |
| `disable-next-line` | 7 | 6 |
| Totalt | 102 | 101 |

Den extra textuella träffen är ett backtick-omslutet exempel i
`.github/instructions/markdown.instructions.md`, inte ett aktivt direktiv.

De 102 textuella träffarna finns i 55 filer. Filtypsfördelningen är 69 rader i
Markdown, 19 i `.ts`, fyra i `.json`, fyra i `.template`, två i `.mjs`, en i
`.tsx`, en i `.js`, en i `.conf` och en i en Dockerfile utan filändelse.

### Poster och överlapp

| Mått | Hela projektet | Faktisk kontrollyta |
| --- | ---: | ---: |
| `ignore`/`words`-poster | 245 | 200 |
| Unika poster utan hänsyn till skiftläge | 174 | 151 |
| Poster som basen accepterar i fristående test | 64 | 59 |
| Poster som redan finns centralt | 86 | 76 |
| Poster som uppfyller minst ett av villkoren | 138 | 124 |

De 245 lokala posterna innehåller många upprepningar. Exempel är `readlink`
sju gånger, `fullchain`, `privkey` och `resolv` sex gånger vardera,
`linneab`, `coreutils` och `retentionorphan` fyra gånger vardera samt
`traceparent`, `jsonl` och `Sigstore` tre gånger vardera. Skiftlägesvarianter
finns för `RetentionFresh`, `RetentionLinked`, `RetentionOrphan` och
`traceparent`.

Tolv verkliga direktivrader med 45 poster ligger utanför kontrollen. De finns i
dolda `.devcontainer`-filer, Nginx-konfiguration och mallar samt två `.mjs`-
filer. De kan vara användbara för redigerarstöd eller framtida bredare glob,
men de påverkar inte dagens `spell:check`.

## Klassificering för en framtida migrering

Varje kvarvarande undantag bör få exakt en primär kategori. Följande kategorier
är tillräckligt konkreta för både central och lokal städning:

1. **Normalsvenska ord och böjningar**: vanliga ord, produktiva sammansättningar
   och böjningsformer som en betrodd svensk basordlista bör bära. Exempel är
   `begäranden`, `förtrodda`, `godkännare`, `versionering` och
   `prestandaeffektivitet`.
2. **Domänord**: kravhanteringens etablerade verksamhetsbegrepp och deras
   sammansättningar, helst förankrade i `CONTEXT.md`. Exempel är
   `kravbibliotek`, `kravversion`, `kravurvalsfråga`, `behovsreferens` och
   `kravområdesmedförfattare`.
3. **Projektord och fixtures**: interna namn, testidentiteter och syntetiska
   markörer som inte bör läcka till en generell ordlista. Exempel är
   `manualarea`, `manualpkg`, `retentionorphan`, `linneab` och `pkglead`.
4. **Egennamn och produktnamn**: personer, organisationer, produkter och
   varumärken. Exempel är `Bergström`, `Viscalyx`, `Keycloak`, `Omnissa` och
   `Sigstore`.
5. **Tekniska token**: API-termer, kommandon, filformat, protokoll,
   miljövariabler, SQL-ord och identifierare. Exempel är `SYSUTCDATETIME`,
   `traceparent`, `jsonl`, `readlink`, `fullchain` och `subjectAltName`.
6. **Språkvariant eller främmande språk**: avsiktliga engelska varianter och
   andra språk som behöver uttrycklig motivering. Exempel är `behaviour`,
   `recognisable`, `parameterised` och `équipe`.
7. **Rättnings- eller borttagningskandidat**: felstavningar, ersatta termer,
   historiska arbetsord och poster utan verifierbar användning. Exempel att
   granska är `unexcepted`, `datat`, `kravomraden`, `adminbehorighet` och de 374
   poster som saknar annan spårad förekomst.

En automatisk språkfördelning mellan svenska och engelska är inte tillförlitlig
för denna lista. Svenska sammansättningar, egennamn, akronymer och
kodidentifierare överlappar språken, och konfigurationen tillämpar båda språken
på alla filer. Klassificeringen ovan ger därför bättre beslutsunderlag än en
heuristisk språkprocent.

## Konsekvenser för migreringsbeslutet

1. Börja med strukturell redundans: tre exakta dubbletter, 28
   skiftlägesgrupper och lokala poster som redan finns centralt.
2. Prova varje kandidatordlista mot samma 1 291 filer och jämför både vilka
   befintliga undantag den ersätter och vilka avsiktliga felstavningar den
   accepterar.
3. Granska de 374 posterna utan spårad användning separat. De ska inte räknas
   som ordlistetäckning och bör kräva en aktuell källa för att finnas kvar.
4. Städa lokala direktiv en fil i taget efter vald basordlista. Börja med de 124
   posterna på kontrollytan som redan överlappar basen eller central lista.
5. Besluta om kontrollens glob ska omfatta `.mjs`, JSONC, YAML, Dockerfile,
   Nginx och dolda projektfiler. Att bara ta bort deras nuvarande direktiv utan
   detta beslut förändrar inte CI-skyddet.
6. Behåll en central projektordlista för domänord, projektord, egennamn och
   tekniska token som den valda basen inte bör äga.

Den befintliga agentinstruktionen skiljer rättstavade termer från
felstavningar, men den gäller uttryckligen Markdown och anger inte prioritet
mellan basordlista, central projektordlista och lokalt direktiv. Den säger inte
heller hur oanvända poster ska tas bort. Inventeringen visar därför ett
konkret, men begränsat, instruktionsglapp som migreringsspecifikationen bör
utvärdera.

## Osäkerheter

- Analysen av förekomster använder dagens spårade filer och läser inte
  Git-historik, genererade artefakter, ej spårade filer eller planerad framtida
  kod.
- En exakt lexikal förekomst är en användningssignal, inte bevis på att cSpell
  behöver posten. Omvänt kan cSpells uppdelning av camel case och
  identifierare göra en post relevant utan exakt ordmatchning.
- Bastestet använder fristående text. En filtypsspecifik cSpell-ordlista kan
  acceptera fler lokala tekniska token i deras riktiga filer.
- Direktivräkningen bygger på syntaxmatchning. cSpells parser kan ignorera ett
  direktiv i inline-kod, en sträng eller exkluderad textregion. Det
  dokumenterade Markdown-exemplet separeras uttryckligen av detta skäl.
- Kategorierna är ett granskningsschema. De 1 268 posterna får ingen
  automatisk kategori eftersom det skulle ge falsk precision, särskilt för
  svenska sammansättningar och projektspecifika identifierare.
