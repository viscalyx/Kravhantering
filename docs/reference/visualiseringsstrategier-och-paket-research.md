# Visualiseringsstrategier och paket

Research date: 2026-08-15

## Fråga och avgränsning

Den här anteckningen kartlägger aktuella alternativ för statistiköversikter i
Kravhantering. Den jämför egen semantisk HTML, CSS och SVG, D3, React-baserade
diagramlager och deklarativa visualiseringsgrammatiker. Den väljer inte paket;
det beslutet kräver de diagramtyper och interaktioner som
områdesgrillningarna senare fastställer.

Dokumenterade fakta skiljs nedan från bedömningar. En bedömning är en
arkitekturmässig slutsats som måste verifieras i Kravhantering med en avgränsad
spike.

## Sammanfattning

Det finns tre skilda ansvar som inte bör låsas till samma bibliotek:

1. en statistikmodell som är oberoende av återgivare, med värden, etiketter,
   serier, färgroller och behörighetsprövad drill-down;
2. en webbåtergivning för semantisk HTML och SVG med interaktion i små
   klientkomponenter; och
3. en separat PDF-återgivning med React-PDF:s egna grundelement.

Den uppdelningen följer Next.js rekommendation att hämta data i
serverkomponenter och använda klientkomponenter för tillstånd, händelser och
webbläsar-API:er. Allt som importeras under en `'use client'`-gräns blir del av
klientens struktur med moduler. Se Next.js
[Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

För enkla KPI-kort, rangordnade staplar och små statusfördelningar är egen
semantisk HTML, CSS och SVG en relevant referenslösning. D3 och visx ger
modulära byggblock när en egen visualisering behöver skalor, geometri eller
layout. Recharts, Nivo och Victory erbjuder färdigare React-diagram. Observable
Plot och Vega-Lite erbjuder högre deklarationsnivåer; Vega har samtidigt ett
särskilt CSP-villkor. Respektive källunderlag redovisas nedan.

Inget bibliotek ger i sig WCAG 2.2 AA. W3C kräver bland annat att färg inte är
den enda informationsbäraren och att meningsbärande grafiska objekt normalt har
3:1 kontrast. En strukturerad tabell eller annan textmotsvarighet kan dessutom
göra informationen tillgänglig utan att grafiken ensam behöver bära den. Se
W3C:s vägledning om
[färganvändning](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color),
[icke-textkontrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast),
[komplexa bilder](https://www.w3.org/WAI/tutorials/images/complex/) och
[datatabeller](https://www.w3.org/WAI/tutorials/tables/).

## Projektets bindande förutsättningar

Kravhantering använder React 19.2, Next.js 16.3, `next-intl`, `next-themes` och
React-PDF 4.5 enligt projektets [`package.json`](../../package.json).

Produktionspolicyn tillåter endast skript från samma origin med nonce och
tillåter inte `unsafe-eval`. Den tillåter stilattribut men inte externa
stilmallar, bilder, typsnitt eller anslutningar från andra origin. Se
[`buildCsp()`](../../proxy.ts).

Webbens rapportmodell är motoroberoende, medan PDF renderas på servern med
`@react-pdf/renderer`. Webbläsaren importerar inte React-PDF. Se projektets
[rapportarkitektur](../development/report-generation-developer-workflow.md) och
[PDF-återgivare](../../components/reports/pdf/PdfReportRenderer.tsx).

Komponenttester körs med Vitest och jsdom. Projektet tillhandahåller en enkel
global `ResizeObserver`-ersättning, medan tester som beror på verklig geometri
redan stubbar mått eller använder webbläsartester. Se
[`vitest.config.ts`](../../vitest.config.ts) och
[`vitest.setup.ts`](../../vitest.setup.ts).

## Aktuella kandidater

Versionsraderna visar publicerade versioner vid undersökningsdatumet. De visar
inte ensamma framtida underhåll eller kompatibilitet med Kravhanterings exakta
byggkedja.

<!-- markdownlint-disable MD013 -->
| Strategi | Aktuell källa | React 19-kontrakt | Abstraktionsnivå |
| --- | --- | --- | --- |
| Egen HTML/CSS/SVG | Webbstandarder | Inget tredjepartskrav | Ägs helt av produkten |
| D3 | [7.9.0](https://github.com/d3/d3/releases/tag/v7.9.0) | Ramverksoberoende | Lågnivåverktyg |
| visx | [4.0.0](https://github.com/airbnb/visx/releases/tag/v4.0.0) | React 18 eller 19 i [paketkontraktet](https://github.com/airbnb/visx/blob/v4.0.0/packages/visx-shape/package.json) | React-grundelement ovanpå D3 |
| Recharts | [3.10.1](https://github.com/recharts/recharts/releases/tag/v3.10.1) | React 16.8–19 i [paketkontraktet](https://github.com/recharts/recharts/blob/v3.10.1/package.json) | Färdiga React-diagram |
| Nivo | [0.99.0](https://github.com/plouc/nivo/releases/tag/v0.99.0) | React 16.14–19 i [paketet för stapeldiagram](https://github.com/plouc/nivo/blob/v0.99.0/packages/bar/package.json) | Diagramvisa React-paket |
| Victory | [37.3.6](https://github.com/FormidableLabs/victory/releases/tag/v37.3.6) | React `>=16.6` i [paketkontraktet](https://github.com/FormidableLabs/victory/blob/v37.3.6/packages/victory/package.json) | Färdiga React-diagram |
| Observable Plot | [0.6.17](https://github.com/observablehq/plot/releases/tag/v0.6.17) | Ramverksoberoende med dokumenterad React-integration | Grafikgrammatik ovanpå D3 |
| Vega-Lite och react-vega | [Vega-Lite 6.4.3](https://github.com/vega/vega-lite/releases/tag/v6.4.3) och [react-vega 8.0.0](https://github.com/vega/react-vega/releases/tag/v8.0.0) | React 17–19 i [adapterlagrets paketkontrakt](https://github.com/vega/react-vega/blob/v8.0.0/package.json) | JSON-grammatik och runtime |
<!-- markdownlint-enable MD013 -->

Att ett peer-intervall accepterar React 19 betyder inte att paketet garanterar
Next.js 16, React Server Components, projektets CSP eller responsiv rendering
utan hydration. Dessa egenskaper måste verifieras i en riktig Next.js-byggnad.
Next.js dokumenterar dessutom att klientkomponenter förhandsrenderas som
standard och att webbläsarberoende bibliotek kan behöva dynamisk import med
avstängd SSR. Se Next.js
[lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).

### Egen semantisk HTML, CSS och SVG

HTML-element ger inget nytt klientberoende och statisk JSX kan ligga kvar i en
serverkomponent. Interaktivitet kräver fortfarande en klientgräns enligt
Next.js komponentmodell. SVG:s tillgänglighetsträd kan styras med namn,
beskrivning och ARIA-egenskaper enligt W3C:s
[SVG Accessibility API Mappings](https://www.w3.org/TR/svg-aam-1.0/).

Bedömning: strategin är en stark baslinje för KPI-kort, exakta värdelistor,
enkla staplar och kompakta fördelningar. Den ger direkt kontroll över
`next-intl`, Tailwind-teman, serverrendering, semantik och testbara länkar.
Kostnaden stiger snabbt för axlar, kollision mellan etiketter, zoomning,
animering och mer avancerad geometri; den kostnaden måste jämföras med ett
paket i spiken.

### D3

D3 är en svit av ungefär 30 fristående moduler som använder webbstandarder som
SVG och Canvas. Moduler kan importeras var för sig. D3:s officiella
React-vägledning skiljer mellan beräkningsmoduler, som kan användas direkt i
deklarativ JSX, och DOM-manipulerande urval, axlar och övergångar, som bör
isoleras bakom `ref` och `useEffect`. Se
[What is D3?](https://d3js.org/what-is-d3) och
[Getting started: D3 in React](https://d3js.org/getting-started#d3-in-react).

D3 har egna locale-API:er för
[tal](https://d3js.org/d3-format#formatLocale) och
[tid](https://d3js.org/d3-time-format). De behöver samordnas med projektets
`next-intl`-formatering så att axlar, informationsrutor, tabeller och PDF visar
samma värden.

Bedömning: D3:s skalor, former och layoutalgoritmer är relevanta för egen SVG
och kan hållas frikopplade från DOM. D3 tillhandahåller däremot inte en
produktklar modell för diagramsemantik, tangentbord, tabellmotsvarighet eller
drill-down. Det är mest motiverat när grillningarna visar behov av specialgrafik
som högnivåpaketen inte uttrycker väl.

### visx

visx 4 beskriver sig som lågnivåkomponenter som kombinerar D3:s beräkningar
med Reacts DOM-uppdatering. Paket delas efter funktion, exempelvis form, skala
och grupp, och projektet uppmanar användaren att installera endast behövliga
delar. Se visx
[README](https://github.com/airbnb/visx/tree/v4.0.0#readme) och
[`@visx/shape`-kontraktet](https://github.com/airbnb/visx/blob/v4.0.0/packages/visx-shape/package.json).

Bedömning: visx undviker konkurrensen mellan D3:s imperativa DOM och React men
lämnar fortfarande diagram-API, responsivitet, semantik och tillgänglig
interaktion till projektet. Det är ett mellanläge för en liten diagramsvit som
ägs av produkten, inte ett färdigt statistikgränssnitt.

### Recharts

Recharts 3.10 deklarerar ESM, `sideEffects: false`, TypeScript-typer och ett
uttryckligt versionsintervall för React 19. Paketet har samtidigt flera runtime-
dependencies; den faktiska klientkostnaden måste därför mätas efter Next.js
tree-shaking. Se dess
[`package.json`](https://github.com/recharts/recharts/blob/v3.10.1/package.json).

Diagrammens `accessibilityLayer` är aktiverat som standard och avser
tangentbordsanvändare och användare med skärmläsare. Dokumentationen beskriver
också
diagramroller och en VoiceOver-begränsning där QuickNav behöver vara avstängt.
Se Recharts
[API](https://recharts.github.io/en-US/api/) och
[accessibility guide](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility).

Recharts responsiva diagram behöver definierad storlek, och paketet kan lyssna
på förändringar i behållaren. Standardanimationen respekterar
`prefers-reduced-motion` och stängs av vid SSR. Se
[chart size](https://recharts.github.io/en-US/guide/sizes/) och
[animations](https://recharts.github.io/en-US/guide/animations/).

Bedömning: Recharts kräver lite kod för vanliga stapel-, linje- och
stackade diagram och ett tillgänglighetsförsprång. Det inbyggda lagret ersätter
inte en rubrik, slutsats, exakta värden, tabellmotsvarighet eller projektets egna
tangentbordstester och tester med skärmläsare.

### Nivo

Nivo publicerar separata `@nivo/*`-paket per diagramfamilj. Stapeldiagrammet
drar samtidigt in gemensamma Nivo-moduler, React Spring, D3-skala, D3-form och
Lodash; paketindelning är därför inte samma sak som en liten route-chunk. Se
[`@nivo/bar`](https://github.com/plouc/nivo/blob/v0.99.0/packages/bar/package.json).

Nivo-projektets officiella FAQ anger att SVG- och HTML-implementationer kan
serverrenderas, medan Canvas inte kan det, och att responsiva komponenter
behöver en förälder med definierad höjd. Stapeldiagrammets API innehåller
möjlighet till fokus, roller samt ARIA-namn och beskrivningar på diagram- och
stapelnivå. Se Nivo-projektets [FAQ](https://nivo.rocks/faq/) och
[bar chart](https://nivo.rocks/bar/).

Nivo har ett uttryckligt temaobjekt för axlar, rutnät, teckenförklaring och
annotationer. Mönster finns som extra kodning utöver färg i SVG men stöds inte
av Canvas. Se
[theming](https://nivo.rocks/guides/theming/) och
[patterns](https://nivo.rocks/guides/patterns/).

Bedömning: Nivo erbjuder stor bredd och god temastyrning. SVG-varianterna är
mer relevanta än Canvas för den här produktens SSR- och
tillgänglighetsprofil. API:erna möjliggör tillgänglighet men dokumenterar inte
ett komplett tangentbordsmönster för varje diagramtyp; varje vald typ behöver
granskas.

### Victory

Victory 37.3.6 deklarerar ESM, `sideEffects: false`, TypeScript-typer och React
`>=16.6`, men anger inte React 19 som en separat testad gren. Se
[`package.json`](https://github.com/FormidableLabs/victory/blob/v37.3.6/packages/victory/package.json).

`VictoryContainer` renderar SVG med standardrollen `img` och har props för
`title`, `desc`, `aria-labelledby`, `aria-describedby` och `tabIndex`.
`VictoryAccessibleGroup` kan märka grupper och lägga till en SVG-beskrivning.
Se källkoden för:

- [`VictoryContainer`](https://github.com/FormidableLabs/victory/blob/e4514a6988c840a69ac2d6813fa19bcb3b790da0/packages/victory-core/src/victory-container/victory-container.tsx)
- [`VictoryAccessibleGroup`](https://github.com/FormidableLabs/victory/blob/3f2da66e320ee0512109fd460d863a16f25bca8f/packages/victory-core/src/victory-accessible-group/victory-accessible-group.tsx)

Bedömning: containersemantiken är användbar, men källan visar inte samma
färdiga datapunktsnavigering som Recharts dokumenterar. React 19 accepteras av
versionsintervallet, men Next.js 16, hydration och CSP behöver bevisas lokalt.

### Observable Plot

Observable Plot 0.6.17 är en grafikgrammatik ovanpå D3 för tabulära data.
Officiell dokumentation visar både serverrendering genom ett virtuellt
`Document` och klientrendering med `ref` och `useEffect`. Serverrendering
rekommenderas endast för enklare diagram med mindre datamängder eftersom SVG
som serialiseras annars blir stor. Se
[Getting started: Plot in React](https://observablehq.com/plot/getting-started#plot-in-react).

Plot genererar SVG och stöder ARIA-namn och beskrivningar på diagram-, axel-
och marknivå. Axel- och rutnätsfärger kan ärva `currentColor`. Se
[accessibility](https://observablehq.com/plot/features/accessibility) och
[plots](https://observablehq.com/plot/features/plots).

Plot erbjuder pekarinteraktioner men saknar i nuläget deklarativ zoomning,
panorering, animation och inkrementell uppdatering. Dokumentationen föreslår
att ett dynamiskt diagram ersätts helt vid ändring. Se
[interactions](https://observablehq.com/plot/features/interactions).

Bedömning: Plot kan vara ett kort uttryckssätt för många statistikdiagram,
men dess tabulära modell och hela D3-dependency behöver vägas mot de relativt
enkla produktdiagrammen och interaktiv drill-down.

### Vega-Lite och react-vega

Vega-Lite beskriver diagram med en JSON-grammatik som kompileras till Vega.
SVG-output får automatiska ARIA-beskrivningar för markeringar och guider när
`config.aria` är aktivt. Format, locale och tema styrs i konfigurationen. Se
Vega-Lite
[configuration](https://vega.github.io/vega-lite/docs/config.html) och Vega
[locale API](https://vega.github.io/vega/docs/api/locale/).

Vega kan skapa statisk SVG och PNG både på klient och server. `react-vega` är
en wrapper runt `vega-embed`; paketets React-komponent skapar och uppdaterar
vyn i en effekt. Se Vega
[View API](https://vega.github.io/vega/docs/api/view/) och react-vega
[`VegaEmbed`](https://github.com/vega/react-vega/blob/v8.0.0/src/VegaEmbed.tsx).

Vega-parsern använder som standard kodgenerering och `Function`-konstruktionen.
Det bryter en `script-src` utan `unsafe-eval`. Vega erbjuder den separata
`vega-interpreter`, som är CSP-kompatibel när AST-läge och tolken kopplas in,
men dokumenterar cirka tio procents genomsnittlig kostnad för initial parsing
och dataflöde samt potentiellt större kostnad vid interaktion. Se Vega
[Expression Interpreter](https://vega.github.io/vega/usage/interpreter/).

Bedömning: grammatiken är mest relevant om många diagramvarianter eller
konfigurerbara specifikationer blir ett verkligt produktbehov. CSP-tolken,
kompilatorn, runtime, embed-lagret och en separat serverrenderingsväg gör den
materiellt mer komplex för ett litet antal fasta diagram.

## Tvärgående konsekvenser

### Server Components och SSR

Statistikfrågor, behörighet, aggregering och lokaliserade rubriker bör
förberedas på servern och skickas som props som kan serialiseras till den
minsta interaktiva klientkomponenten. Det minskar klient-JavaScript enligt
Next.js
[komponentmodell](https://nextjs.org/docs/app/getting-started/server-and-client-components).

Bedömning: egen statisk SVG och D3:s rena beräkningsmoduler har den tydligaste
servervägen. Nivo dokumenterar SSR för SVG och HTML. Recharts, visx och Victory
kan producera React-SVG, men exakt förhandsrendering, responsiv första storlek
och hydration ska verifieras. Observable Plot behöver sin virtuella
`Document`-adapter för SSR. React-adaptern för Vega är effektbaserad; riktig
Vega-SSR är en separat rendering.

### Strikt CSP

Vega är den enda kandidaten i undersökningen med ett dokumenterat behov av
`unsafe-eval` i standardläget och en dokumenterad CSP-tolk som alternativ. De
övriga projekten ger ingen uttrycklig garanti för Kravhanterings exakta policy.
Bedömningen är därför inte att de automatiskt är kompatibla, utan att varje
kandidat måste provköras med den riktiga policyn i
[`proxy.ts`](../../proxy.ts).

Ingen visualisering ska hämta CDN-skript, externa typsnitt, bilder eller data i
webbläsaren. Projektets `script-src`, `font-src`, `img-src` och `connect-src`
tillåter inte sådana origin i produktion. Se
[`buildCsp()`](../../proxy.ts).

### Tillgänglighet och interaktion

Varje statistikblock bör oberoende av paket ha en lokaliserad rubrik, en kort
tolkning, exakta värden och en semantisk tabell eller motsvarande detaljvy.
Drill-down ska vara ett vanligt namngivet länk- eller knappelement; en SVG-yta
som endast reagerar på muspekare är inte tillräcklig. Detta är en bedömning
utifrån W3C:s vägledning om
[komplexa bilder](https://www.w3.org/WAI/tutorials/images/complex/),
[tangentbord](https://www.w3.org/WAI/WCAG22/Understanding/keyboard) och
[namn, roll och värde](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value).

Färgroller ska ha ljust och mörkt tema, och status eller serie ska också kunna
identifieras med text, form, mönster eller direkt etikett. Ett pakets tema-API
garanterar inte kontrast eller att färg inte används ensam. Se W3C:s
[färganvändning](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) och
[icke-textkontrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

### Mörkt läge och lokalisering

Nivo och Vega har uttryckliga temaobjekt. D3 och egen SVG kan använda CSS och
`currentColor`; Plot använder `currentColor` för flera standardelement.
Recharts och Victory tar färg och stil genom komponentegenskaper. Bedömningen är
att projektet oavsett kandidat måste äga ett litet diagramtema med semantiska
färgroller för ljust, mörkt och utskriftsläge. Se Nivo
[theming](https://nivo.rocks/guides/theming/), Vega-Lite
[configuration](https://vega.github.io/vega-lite/docs/config.html) och Plot
[plots](https://observablehq.com/plot/features/plots).

Synliga strängar och formaterade värden bör komma från `next-intl` och
skickas in till diagramlagret, så att samma etiketter kan användas i diagram,
tabell och PDF. `next-intl` stöder tal- och datumformat på både server och
klient. Se [`next-intl`](https://next-intl.dev/). D3 och Vega har dessutom egna
locale-API:er, vilka därför inte får ligga kvar på amerikanska standardvärden.
Se D3 [number locale](https://d3js.org/d3-format#formatLocale) och Vega
[locale API](https://vega.github.io/vega/docs/api/locale/).

### Paketstorlek och modularitet

Ingen generisk storlekssiffra är tillräcklig för beslutet. Next.js route-chunk
beror på exakt import, tree-shaking, klientgräns och gemensamma dependencies.
Next.js rekommenderar lazy loading för att skjuta upp klientkomponenter och
bibliotek som inte behövs vid första rendering. Se
[lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).

Källstrukturen visar följande relativa risker, inte uppmätta bytes:

- egen HTML/SVG ger ingen ny runtime-dependency;
- D3 och visx kan importeras som funktionsvisa delmoduler;
- Nivo delas per diagramtyp men varje diagram har flera gemensamma
  dependencies;
- Recharts och Victory markerar `sideEffects: false`, vilket möjliggör men inte
  garanterar effektiv tree-shaking;
- Plot har D3 som dependency; och
- Vega-Lite kräver kompilator, Vega-runtime och normalt embed- och React-lager.

Se D3:s [översikt över moduler](https://d3js.org/api), visx
[`README`](https://github.com/airbnb/visx/tree/v4.0.0#readme), Recharts
[`package.json`](https://github.com/recharts/recharts/blob/v3.10.1/package.json),
Nivo [`@nivo/bar`](https://github.com/plouc/nivo/blob/v0.99.0/packages/bar/package.json),
Victory
[`package.json`](https://github.com/FormidableLabs/victory/blob/v37.3.6/packages/victory/package.json),
Plot [`package.json`](https://github.com/observablehq/plot/blob/v0.6.17/package.json)
och react-vega
[`package.json`](https://github.com/vega/react-vega/blob/v8.0.0/package.json).

### Testbarhet

Statistikberäkningar, behörighetsfiltrering, formatering och diagrammodell bör
testas som rena funktioner. Komponenttester kan verifiera rubriker, roller,
tillgängliga namn, exakta värden, tabellmotsvarighet och länkmål. Verklig
geometri, responsivitet, tangentbordsflöden, mörkt läge och CSP behöver
webbläsartester eftersom projektets jsdom-miljö inte gör layout. Den
uppdelningen stämmer med projektets befintliga
[`vitest.config.ts`](../../vitest.config.ts) och geometristubbar i
[`vitest.setup.ts`](../../vitest.setup.ts).

Canvas har inget DOM-träd med en nod per datapunkt. Bedömningen är därför att
Canvas kräver fler visuella och interaktionsbaserade webbläsartester samt en
separat semantisk tabell. SVG är enklare att inspektera nära komponenten, men
dess geometri behöver fortfarande testas i webbläsare.

### Separat React-PDF-rendering

React-PDF använder egna `Svg`, `Path`, `Rect`, `Circle` och textelement samt
server-API:er för PDF. Vanliga React-DOM/SVG-element kan inte antas fungera
direkt; React-PDF:s egen beskrivning säger att befintliga React-SVG-element
måste transformeras. Se React-PDF:s
[komponent- och Node-API](https://v4.react-pdf.org/) och
[SVG-introduktion](https://react-pdf.org/blog/announcing-react-pdf-v2#svg-support).

Bedömning: webbkomponenten ska inte delas med PDF-återgivaren. Dela i stället
statistikmodellen och eventuellt rena geometriberäkningar. PDF-återgivaren ska
bygga en förenklad, utskriftsanpassad figur med React-PDF-grundelement och alltid
kunna falla tillbaka på exakt tabell. Det bevarar projektets befintliga
motoroberoende rapportmodell och servergräns. Se
[rapportarkitekturen](../development/report-generation-developer-workflow.md).

Vega kan själv exportera statisk SVG och PNG på servern, men det skapar en
separat exportpipeline snarare än direkt återanvändning i React-PDF. Se Vega
[View API](https://vega.github.io/vega/docs/api/view/).

## Beslutsrelevanta tradeoffs

Följande är hypoteser att ta med till det senare teknikbeslutet, inte ett
paketval:

- Egen HTML/CSS/SVG sätter minsta möjliga beroende- och klientkostnad för enkla
  diagram, men sätter också hela diagramkvaliteten på projektet.
- D3 eller visx blir relevant när specialgeometri eller en diagramdesign som
  ägs av produkten motiverar egen implementation.
- Recharts, Nivo och Victory bör jämföras på samma verkliga standarddiagram;
  deras olika tillgänglighets-, tema- och beroendeprofiler syns inte i en
  enkel lista över diagramtyper.
- Observable Plot bör jämföras om en kort grafikgrammatik för tabulära data är
  viktigare än React-native interaktion.
- Vega-Lite bör bara tas vidare om konfigurerbara specifikationer ger ett
  konkret återanvändningsvärde som motiverar CSP-tolk och separat SSR-väg.

## Bevis som krävs före paketbeslut

Efter områdesgrillningarna bör högst två paketstrategier och den egna
HTML/SVG-baslinjen byggas med samma representativa statistikmodell. Spiken ska
verifiera:

1. `next build` med React 19 och Next.js 16 utan hydration-varningar;
2. den riktiga produktions-CSP:n utan `unsafe-eval`;
3. servergenererad första HTML och beteende före och efter hydration;
4. tangentbord, tillgängliga namn, rubrik, slutsats och tabellmotsvarighet;
5. färgoberoende kodning och kontrast i ljust, mörkt och högkontrastläge;
6. svenska och engelska etiketter, långa texter, tal och datum;
7. stabila komponent- och Playwright-tester vid 320–1440 pixlar;
8. storleken på den tillkommande komprimerade koden för sidan i projektets
   byggnad;
   och
9. en separat React-PDF-återgivning från samma statistikmodell.

Mätningen ska använda de diagram som grillningarna faktiskt prioriterar. Ett
paketval före den punkten riskerar att optimera för bibliotekets galleri i
stället för Kravhanterings beslutsbehov.
