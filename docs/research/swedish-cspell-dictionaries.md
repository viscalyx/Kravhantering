# Svenska basordlistor för cSpell

<!-- markdownlint-disable-next-line MD013 -->
<!-- cSpell:words Andersson böjningsfritext datacitering faksimil faksimiler filkälla fullformslista Göran homografnummer huvudordsfil huvudordslista huvudordsutdrag Karp Kollationen kontrollsummeval kravrelaterade LGPL licensfil Låsfilen nedladdningsfil opphäva opphävdes orddatan ordkällan redistribuerar repokorpusen SAOL saldom Språkbanken uppslagsorden wooorm äpplebanan -->

## Kort svar

Det finns ingen färdig SAOL-baserad ordlista i cSpells officiella
ordlistekatalog. Den enda officiella svenska cSpell-ordlistan är
`@cspell/dict-sv`, som projektet redan använder. Den bygger på en
LibreOffice-/Hunspell-ordlista, inte på SAOL. Det framgår av paketets
[byggkonfiguration], [källredovisning] och [paketmetadata].

Det finns däremot officiella SAOL-data som juridiskt kan ligga till grund för
en egen cSpell-ordlista:

- Språkbanken tillhandahåller uppslagsorden i SAOL 14 som nedladdningsbar
  JSONL under CC BY 4.0. Datamängden har 126 900 poster och är skapad av
  Svenska Akademien. [Språkbankens metadata för SAOL 14]
- Språkbanken visar SAOL 15, den aktuella upplagan från 2026, som en datamängd
  med 128 295 poster och licensen CC BY 4.0. Resursen saknar dock offentlig
  nedladdning och Karps konfiguration markerar den som
  `limitedAccess: true`. [Språkbankens metadata för SAOL 15]
  [Karps konfiguration]

Den praktiska slutsatsen är därför:

1. Behåll `@cspell/dict-sv` som färdig svensk basordlista.
2. Betrakta en genererad SAOL-ordlista som en egen, versionsbunden artefakt,
   inte som ett paket som redan går att installera.
3. Använd inte SALDO:s alla ordformer eller global
   `allowCompoundWords: true` utan en särskild utvärdering av falska negativa
   resultat. De ger större täckning men är betydligt mer tillåtande.
4. Förvänta inte att en generell ordlista ensam tömmer projektets `words`.
   Mätningen nedan visar att SAOL 14:s huvudord bara ersätter två ytterligare
   poster och SALDO:s fullformslista 17 ytterligare poster.

## Projektets nuläge

Projektets [cSpell-konfiguration] anger språken `en,sv`, importerar
`@cspell/dict-sv/cspell-ext.json`, har `allowCompoundWords: false` och
innehåller 1 268 poster i `words`. Det finns 1 265 exakt unika poster och
1 237 unika poster när skiftläge ignoreras. Det innebär att minst tre exakta
dubbletter och ytterligare skiftlägesvarianter kan städas utan en ny ordlista.

`package.json` anger `@cspell/dict-sv` `^2.3.2` och cSpell `^10.0.1`.
Låsfilen låser versionerna 2.3.2 respektive 10.0.1 i den undersökta
revisionen. [Projektets paketmanifest]

## Metod och avgränsning

Undersökningen använder endast källägarnas egna resurser:

- cSpells dokumentation, ordlistekatalog och källkod,
- Svenska Akademiens `svenska.se`,
- Språkbanken Text vid Göteborgs universitet,
- licenstexterna som ordlisteprojekten själva distribuerar.

Täckningsmätningen utgår från samtliga 1 268 poster i projektets `words` och
kontrollerar varje post i en egen textfil. En post räknas som täckt endast när
cSpell accepterar hela posten utan projektets `words`. Baslinjen använder
projektets språkval, cSpells standardordlistor och `@cspell/dict-sv` 2.3.2.

Två experimentella ordlistor läggs sedan till var för sig och tillsammans:

- alla `normaliserat_ord` från den officiella JSONL-filen för SAOL 14,
- alla `writtenForm` från Språkbankens fasta nedladdning av SALDO:s morfologi.

Mätningen jämför ordlistornas förmåga att ersätta dagens undantag. Den mäter
inte täckningen av hela kodbasens svenska korpus och är inte ett juridiskt
utlåtande. En senare kandidatprövning behöver även mutationstester med avsiktliga
felstavningar.

## Kandidatöversikt

<!-- markdownlint-disable MD013 -->

| Kandidat | Proveniens | Licens | Färdig cSpell-integration | Former och sammansättningar | Bedömning |
| --- | --- | --- | --- | --- | --- |
| `@cspell/dict-sv` 2.3.2 | LibreOffice/Hunspell, Göran Anderssons svenska rättstavningsordlista | Paket: GPL-3.0-or-later; inbäddad orddata: LGPL-3.0 | Ja, npm-paket och `cspell-ext.json` | Hunspell-böjningar och visst sammansättningsstöd kompileras till trie | Behåll som baslinje; den är redan installerad men är inte SAOL |
| SAOL 15 (2026) | Svenska Akademien, bearbetad och distribuerad av Språkbanken | CC-BY-4.0 enligt Språkbanken | Nej | Karp beskriver normaliserat ord, grundform, ordklass och relaterat ord | Bästa normativa källan, men offentlig export saknas och resursen kräver åtkomst |
| SAOL 14 (2015) | Svenska Akademien, bearbetad och distribuerad av Språkbanken | CC-BY-4.0 | Nej; egen generering krävs | Huvudord samt fritext med böjningsändelser och vissa böjda former | Juridiskt och tekniskt möjlig, men ett huvudordsutdrag ger mycket liten reduktion |
| SALDO:s morfologi | Språkbanken, modernt deskriptivt språklexikon | CC-BY-4.0 | Nej; egen generering krävs | Omfattande explicita ordformer; separat sammansättningsanalysator finns | Högre täckning men för tillåtande som normativ stavningsordlista |

<!-- markdownlint-enable MD013 -->

## Nuvarande `@cspell/dict-sv`

### Proveniens

Paketets byggmål tar fyra källor: en tom fil för tillägg, Hunspell-paketet
`dictionary-sv`, en kopia av `ooo-swedish-dict-2-42` och en äldre
OpenOffice-ordlista. [Byggkonfigurationen]

`dictionary-sv` anger att materialet genereras från LibreOffice-tillägget
"Swedish spelling dictionary — den stora svenska ordlistan" och att
stavningsfel ska rapporteras till den källan. [Hunspell-paketets redovisning]
Den inbäddade licensnotisen anger Göran Andersson som underhållare, copyright
2003–2019 och LGPL version 3. [Ordlistans licensnotis]

Det finns inget SAOL-material i den redovisade byggkedjan. Namnet "den stora
svenska ordlistan" ska alltså inte läsas som Svenska Akademiens ordlista.

### Licens och underhåll

Det publicerade cSpell-paketet deklarerar `GPL-3.0-or-later`; den underliggande
Hunspell-orddatan deklarerar LGPL-3.0. [Paketmetadata]
Den som bara installerar npm-paketet får med dess licensfil. Den som kopierar,
modifierar eller redistribuerar den kompilerade ordlistan behöver bedöma och
uppfylla båda lagrens licensvillkor, inklusive bevarande av tillämpliga
notiser.

Paketversion 2.3.2 är publicerad den 19 juli 2025. Ändringsloggen visar att den
senaste namngivna uppdateringen av ordlistekällorna är version 2.2.0 från den
6 november 2023; senare versioner avser paketering, dokumentation och
beteendeförändringar i cSpell. [Ändringsloggen] Detta är stabilt underhåll, men
inte belägg för att
det svenska ordförrådet följer SAOL 15 eller löpande svensk språkutveckling.

### Integration, böjningar och risk

Paketet är direkt integrerbart genom den import som projektet redan har.
Paketets språkregel aktiverar ordlistan `sv` för lokalerna `sv` och `sv_SE`
och alla filtyper. [Paketets cSpell-konfiguration]

Byggkedjan läser Hunspell-källor och producerar en cSpell-trie. Ändringsloggen
anger uttryckligen att paketet byggs om med Hunspell-stöd för sammansättningar.
[Ändringsloggen] Det ger böjnings- och sammansättningskunskap som en ren
huvudordsfil saknar, men det täcker inte svenskans alla produktiva
sammansättningar. Projektets många kravrelaterade sammansättningar illustrerar
den gränsen.

Bygget använder `generateNonStrict: true`, och paketkonfigurationen använder
`ignoreForbiddenWords: true`. [Byggkonfigurationen]
[Paketets cSpell-konfiguration] De valen gör ordlistan praktisk men innebär att
den inte bör behandlas som en strikt normkontroll.

## SAOL 15 och SAOL 14

### Normativ kvalitet

Svenska Akademien beskriver SAOL 15 från 2026 som den aktuella upplagan,
omfattande cirka 127 600 uppslagsord. SAOL har ett mer normativt perspektiv än
de andra ordböckerna på webbplatsen och betraktas som den inofficiella normen
för stavning och böjning av modern svenska. [Svenska Akademiens beskrivning]

Det gör SAOL till den språkligt bästa källan för projektets konservativa mål:
att acceptera normalsvenska ord utan att göra kontrollen onödigt deskriptiv.

### Vad som faktiskt får återanvändas

Material får inte hämtas genom att skrapa `svenska.se`. Webbplatsens villkor
anger att allt material är upphovsrättsligt skyddat och inte får användas i
annan form eller på annan plats utan Svenska Akademiens skriftliga tillstånd.
[Villkoren för svenska.se]

Språkbanken tillhandahåller samtidigt särskilt publicerade datamängder med
egna licensangivelser:

- SAOL 14:s JSONL-fil kan laddas ned under CC BY 4.0.
  [Språkbankens metadata för SAOL 14]
- SAOL 15 är tillgänglig i Karp under CC BY 4.0 enligt resursens metadata,
  men saknar nedladdningsfil. [Språkbankens metadata för SAOL 15]

CC BY 4.0 tillåter kopiering, redistribution och bearbetning, även
kommersiellt, under villkor om korrekt erkännande, licenslänk och uppgift om
ändringar. [Creative Commons licenssammanfattning] En genererad ordlista måste
därför bära datacitering, licens och information om omvandlingen.

### SAOL 15 är ännu inte en genomförbar filkälla

Karps offentliga `/config` beskriver resursen `saol15-ord` med 128 295 poster
och `entryWord` i fältet `normaliserat_ord`, men anger även
`limitedAccess: true`. [Karps konfiguration] Ett anonymt API-anrop mot resursen
nekas. [Karps åtkomstkontroll] Resursens metadata visar endast Karp-åtkomst,
inte en nedladdningsfil.

Licensen ser alltså möjlig ut, men projektet saknar ännu en offentligt
reproducerbar indatafil. Innan SAOL 15 väljs behöver projektet få tillgång till
en auktoriserad export eller en officiell nedladdning och bekräfta vilken
attribution som ska följa den.

### SAOL 14 kan genereras men är inte cSpell-färdig

SAOL 14-filen innehåller 126 900 poster. Fälten omfattar normaliserat huvudord,
ordklass, homografnummer, relaterat ord, källa och fritext med
böjningsändelser eller vissa böjda former. [Språkbankens metadata för SAOL 14]
Utdraget ger 122 324 unika `normaliserat_ord` vid exakt jämförelse.

cSpell kan läsa en egen textfil med ett ord per rad genom
`dictionaryDefinitions`, eller en kompilerad trie kan byggas för effektiv
distribution. [cSpells dokumentation om egna ordlistor]
SAOL 14 behöver därför en reproducerbar omvandling från JSONL, ett bestämt
versions- eller kontrollsummeval och en attribution. En enkel omvandling av
`normaliserat_ord` ger bara huvudord. Att tolka fältet `text` till säkra
böjningsformer är ett separat språk- och testproblem.

## SALDO som alternativ eller komplement

Språkbanken beskriver SALDO som ett omfattande lexikon för modernt svenskt
skriftspråk, byggt för språkteknik. Det är uttryckligen maximalt deskriptivt,
inte normativt. Resursen innehåller semantik, fullständig information om
ordklass och böjningsmönster samt en datormorfologisk beskrivning.
[Språkbankens metadata för SALDO]

Den fasta SALDO-resursen har 131 020 lexikonposter. Den separata morfologifilen
har 128 036 poster och explicita ordformer. Båda distribueras under CC BY 4.0,
men de publicerade nedladdningarna är daterade den 19 september 2017.
[Språkbankens metadata för SALDO] Utdraget ur morfologifilen ger 1 033 122
unika rader med `writtenForm` vid exakt jämförelse, eller 1 028 785 när
skiftläge ignoreras.

SALDO:s breda täckning är samtidigt dess risk. Datamängden innehåller bland
annat formerna `opphäva` och `opphävdes`, medan SAOL 14-underlaget innehåller
`upphäva` men inte dessa stavningar. Att importera alla fullformer gör cSpell
deskriptivt tolerant mot former som projektet sannolikt vill rapportera.

SALDO erbjuder också en separat sammansättningsanalysator, men den är en
webbtjänst och inte en cSpell-ordlista. [Språkbankens metadata för SALDO]
Att översätta dess morfologiska modell till cSpells selektiva `+`- och
`*`-markeringar kräver en egen generator och en särskild riskprövning.
[cSpells syntax för egna ordlistor]

## Uppmätt täckning av projektets undantag

<!-- markdownlint-disable MD013 -->

| Konfiguration utan projektets `words` | Accepterade av 1 268 | Ytterligare jämfört med baslinjen | Kvar som ej accepterade |
| --- | ---: | ---: | ---: |
| Befintliga standardordlistor och `@cspell/dict-sv` | 94 | 0 | 1 174 |
| Baslinjen plus SAOL 14:s huvudord | 96 | 2 | 1 172 |
| Baslinjen plus SALDO:s alla explicita ordformer | 111 | 17 | 1 157 |
| Baslinjen plus både SAOL 14 och SALDO | 112 | 18 | 1 156 |
| Baslinjen med global `allowCompoundWords: true` | 924 | 830 | 344 |

<!-- markdownlint-enable MD013 -->

Resultatet visar tre saker:

1. 94 nuvarande poster är redan redundanta mot den installerade baslinjen och
   kan granskas för borttagning utan en ny språkordlista.
2. En SAOL-huvudordslista minskar inte projektlistan i närheten av vad dess
   storlek antyder. Projektets kvarvarande ord är främst tekniska namn,
   identifierare, böjda domänord och produktiva sammansättningar.
3. SALDO ger större men fortfarande liten ytterligare reduktion och köper den
   med en tydlig risk för falska negativa resultat.

Global sammansättningsacceptans ger den stora numeriska effekten, men är inte
förenlig med den konservativa inriktningen. I ett enkelt kontrollprov
accepterar `allowCompoundWords: true` den konstruerade formen `äpplebanan`,
som baslinjen rapporterar. cSpell dokumenterar att inställningen tillåter
sammansatta ord; dess egen ordlistesyntax erbjuder mer selektiva markörer för
sammansättningar. [cSpells konfigurationsegenskaper]
[cSpells syntax för egna ordlistor]

## Rekommenderad riktning

### Basordlista

Behåll `@cspell/dict-sv` 2.3.2 tills en utvärderad ersättare finns. Det är den
enda färdiga svenska ordlistan i cSpells officiella katalog, och projektet har
redan rätt integration. [cSpells officiella ordlistekatalog]

Lägg inte till hela SALDO:s morfologi som generell stavningsnorm. Använd SALDO
som analysunderlag för enskilda ord eller för att hitta böjningskandidater, inte
som automatisk acceptanslista.

### SAOL-spår

Prioritera SAOL 15 framför att bygga en långlivad lösning på SAOL 14, men först
efter att en auktoriserad, reproducerbar export blir tillgänglig. Om den
åtkomsten inte går att få och normativ SAOL-täckning fortfarande har ett eget
värde kan SAOL 14:s CC-BY-data användas för en avgränsad prototyp.

Prototypen bör börja med huvudord och inte försöka tolka all böjningsfritext.
Den ska jämföras mot hela repokorpusen och en kuraterad uppsättning avsiktliga
felstavningar innan projektet väljer att bära den genererade artefakten.

### Städning och framtida kontroll

Oavsett ordlisteval bör migreringen först:

1. ta bort exakta dubbletter och skiftlägesdubbletter,
2. ompröva de 94 poster som baslinjen redan accepterar,
3. klassificera resten i normala svenska ord, domänsammansättningar,
   produktnamn, personnamn, tekniska identifierare och verkliga stavfel,
4. använda en ny generell ordlista endast för ord som dess dokumenterade källa
   faktiskt motiverar,
5. behålla `allowCompoundWords: false` om inte mutationstester visar att en
   smalare sammansättningsmodell är säker.

Det finns alltså en laglig väg till SAOL-baserad cSpell-data, men ingen färdig
installation. Den empiriska nyttan för dagens centrala lista är dessutom liten
utan en lösning för svenska böjningar och produktiva domänsammansättningar.

[byggkonfiguration]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/cspell-tools.config.yaml
[källredovisning]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/src/README.md
[paketmetadata]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/package.json
[Hunspell-paketets redovisning]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/src/hunspell/readme.md
[ordlistans licensnotis]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/src/hunspell/license
[ändringsloggen]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/CHANGELOG.md
[paketets cSpell-konfiguration]: https://github.com/streetsidesoftware/cspell-dicts/blob/627831379fe16dbfcfbf05fe747f05320b86e615/dictionaries/sv/cspell-ext.json
[Språkbankens metadata för SAOL 14]: https://spraakbanken.gu.se/resurser/saol14-faksimil
[Språkbankens metadata för SAOL 15]: https://spraakbanken.gu.se/resurser/saol15-ord
[Karps konfiguration]: https://spraakbanken4.it.gu.se/karps/v1/config
[Karps åtkomstkontroll]: https://spraakbanken4.it.gu.se/karps/v1/search?resources=saol15-ord&q=equals%7Cnormaliserat_ord%7Ckravbibliotek&size=1
[Svenska Akademiens beskrivning]: https://svenska.se/om/om-ordbockerna/
[villkoren för svenska.se]: https://svenska.se/om/om-webbplatsen/
[Creative Commons licenssammanfattning]: https://creativecommons.org/licenses/by/4.0/
[Språkbankens metadata för SALDO]: https://spraakbanken.gu.se/resurser/saldo
[cSpells dokumentation om egna ordlistor]: https://cspell.org/docs/dictionaries/custom-dictionaries
[cSpells syntax för egna ordlistor]: https://cspell.org/docs/dictionaries/custom-dictionaries#words-list-syntax
[cSpells konfigurationsegenskaper]: https://cspell.org/docs/Configuration/properties
[cSpells officiella ordlistekatalog]: https://github.com/streetsidesoftware/cspell-dicts
[cSpell-konfiguration]: ../../cspell.jsonc
[Projektets paketmanifest]: ../../package.json
