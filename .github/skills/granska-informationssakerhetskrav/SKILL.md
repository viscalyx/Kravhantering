---
name: granska-informationssakerhetskrav
description: >-
  Analysera en kodbas mot informationssäkerhetskrav från ett underlag som CSV,
  TSV, semikolonseparerad kravlista eller inklistrat kravmaterial. Använd när
  AI ska bedöma om varje informationssäkerhetskrav är uppfyllt, delvis
  uppfyllt, ej uppfyllt eller inte går att bedöma utifrån kod, tester,
  dokumentation och konfiguration, samt skriva en markdownrapport med krav-id,
  kravtext, bedömning, hur kravet uppfylls, evidens, brister och åtgärder.
---

# Granska Informationssakerhetskrav

Granska informationssäkerhetskrav mot faktisk kodbas och skriv en
evidensbaserad markdownrapport.

## Arbetsgång

1. Identifiera kravunderlaget från användarens prompt.
2. Om användaren inte har angett kravunderlag, stoppa och fråga efter filväg
   eller inklistrat innehåll. Påbörja inte kodbasanalysen innan underlaget är
   specificerat.
3. Normalisera kravraderna med scriptet när underlaget är en fil:

```bash
python3 .github/skills/granska-informationssakerhetskrav/scripts/extract_requirements.py path/to/kravunderlag.csv --format markdown
```

4. För inklistrat kravmaterial, strukturera kravraderna direkt utan scriptet.
5. Läs alla kravrader. Bevara källans `Id`, kravrubrik, beskrivning och
   källrad när de finns.
6. Inventera kodbasen innan du bedömer kraven. Läs relevanta delar av
   `README.md`, `docs/`, `app/`, `components/`, `hooks/`, `lib/`,
   `lib/typeorm/`, `typeorm/`, `scripts/`, tester, CI-konfiguration,
   autentisering, behörighet, loggning, audit, export/import,
   backup/restore, rapporter, integrationer och driftkonfiguration.
7. Använd `rg` med sökord som härleds från varje kravs innebörd, inte från en
   fast ordlista. Kombinera svenska och engelska termer, böjningar, tekniska
   begrepp, domänord från kravtexten och namn på sannolika implementationer,
   till exempel roller, loggning, backup, retention, kryptering,
   leverantörsstyrning eller incidenthantering när de är relevanta.
8. Bedöm varje krav separat. Välj kravets basbedömning med statusvärdena:
   `Uppfyllt`, `Delvis uppfyllt`, `Ej uppfyllt` eller `Kan ej bedömas`.
9. Låt `Bedömning`, `Hur kravet uppfylls`, `Evidens` och `Brister` spegla
   kravets basbedömning. Vid senare körningar får basbedömningen bara ändras
   när kravet, avgränsningen eller underlaget för bedömningen har förändrats,
   inte för att en tidigare föreslagen åtgärd har genomförts.
10. Kräv konkret evidens för `Uppfyllt`. Hänvisa till filer, moduler,
   funktioner, tester, dokument eller konfigurationer med radnummer när det
   går.
11. Markera organisatoriska, avtalsmässiga eller processrelaterade krav som
   `Kan ej bedömas` om kodbasen saknar underlag. Markera dem som
   `Delvis uppfyllt` om tekniskt stöd finns men policy, rutin, ansvar,
   revision eller avtal saknas.
12. Beskriv bristen utan att överdriva. Skilj mellan avsaknad av kod,
   avsaknad av dokumentation, oklar ansvarsfördelning, otillräckliga tester
   och krav som ligger utanför kodbasens verifierbara yta.
13. Föreslå en konkret åtgärd för varje krav som inte är `Uppfyllt`.
    Åtgärden ska vara ägbar och verifierbar, till exempel kodändring,
    testfall, dokumenterad rutin, konfigurationsändring, loggning,
    behörighetskontroll, revision eller leverantörsavtal.
14. Om rapportfilen redan finns, verifiera befintliga kravrader:
    - om kravet fortfarande finns i källan och är relevant för avgränsningen
    - om kravet ska avföras; behåll raden och ange `Avförd: ... Evidens: ...`
      i `Åtgärd`
    - om nya kravrader ska läggas till
    - om kvarstående eller nya åtgärder krävs
    - om en åtgärd är implementerad; ange `Genomfört: ... Evidens: ...` och
      eventuellt `Kvarstår: ...` i `Åtgärd`
    - om implementerad åtgärd har verifierad effekt på bedömning, brister
      eller båda

## Tolkningsregler

- Tolka `leverantör`, `leverantören` och `leverantörens` som den organisation
  och systemleverans som aktuell kodbas representerar, om användaren inte
  uttryckligen definierar leverantörsrollen på annat sätt.
- Bedöm krav på leverantören mot kodbasen, repo-dokumentation, CI,
  driftkonfiguration, tester och processunderlag som finns i repo.
- Behåll `underleverantör`, `beställare` och andra externa parter som separata
  roller när kravtexten skiljer dem från leverantören.
- Redovisa antagandet om leverantörsrollen i rapportens avgränsning.

## Bedömningsregler

- Skriv inte att ett krav är uppfyllt enbart för att en närliggande term finns
  i kodbasen.
- Ange `Ej uppfyllt` när kravet är relevant för systemet men evidens saknas
  eller implementationen motsäger kravet.
- Ange `Kan ej bedömas` när kravet främst gäller organisation, avtal,
  leverantörsstyrning, fysisk säkerhet eller personalrutiner och inget
  verifierbart underlag finns i repo.
- Ange `Delvis uppfyllt` när delar är implementerade men täckning, process,
  roll, test, dokumentation eller uppföljning saknas.
- Ange osäkerhet kort och explicit. Föreslå kompletterande underlag när det
  behövs.

## Verifierade åtgärder

- Räkna en åtgärd som implementerad bara när aktuellt underlag visar det.
- Godkänd evidens är kod, tester, konfiguration, dokumentation, migreringar,
  drift- eller förvaltningsunderlag, eller explicit användarangiven evidens.
- Räkna inte förslag, planer, TODO-kommentarer, issue-rubriker eller antaganden
  som evidens.
- Fyll `Bedömning efter verifierade åtgärder` bara när evidens visar att en
  implementerad åtgärd påverkar kravets bedömning.
- Fyll `Brister efter verifierade åtgärder` bara när evidens visar vilka
  brister som kvarstår eller att inga brister kvarstår efter en implementerad
  åtgärd.
- Använd `-` i `Brister efter verifierade åtgärder` bara när evidens visar att
  inga brister kvarstår.
- Lämna efter-kolumner tomma när verifierad evidens saknas. Sätt inte `-`,
  `Ej verifierat`, `Oförändrad` eller antagna värden.
- Bedöm efter-kolumnerna oberoende av varandra.

## Rapport

Skriv rapporten till den fil användaren anger. Om ingen fil anges, använd:

```text
docs/informationssakerhetskrav-analys.md
```

Börja med en kort avgränsning: kravkälla, analyserade kodområden och viktiga
antaganden. Lägg sedan huvudresultatet i en markdown-tabell.

För rapporter under `docs/`, om tabellraderna blir långa, omge tabellen med:

```markdown
<!-- markdownlint-disable MD013 -->
...
<!-- markdownlint-enable MD013 -->
```

Använd exakt dessa kolumner om användaren inte begär annat:

<!-- markdownlint-disable MD013 -->
| Kolumn | Innehåll |
| --- | --- |
| `Id` | Krav-id från källan, annars källrad. |
| `Informationssäkerhetskrav` | Kravrubrik eller kort kravtext från källan. |
| `Kravtext` | Beskrivning eller full kravformulering från källan. |
| `Bedömning` | `Uppfyllt`, `Delvis uppfyllt`, `Ej uppfyllt` eller `Kan ej bedömas`. |
| `Hur kravet uppfylls` | Konkreta kontroller, processer, koddelar eller dokument som uppfyller kravet; skriv `Ej visat i underlaget` om det saknas. |
| `Motivering` | Kort bedömning kopplad till faktisk kodbas eller saknat underlag. |
| `Evidens` | Filer, rader, tester, dokument, routes, tabeller eller konfigurationer. |
| `Brister` | Det som saknas för kravuppfyllnad, eller `-` om uppfyllt. |
| `Åtgärd` | Konkret kvarstående åtgärd, genomförd åtgärd med evidens, eller `-` om uppfyllt. |
| `Bedömning efter verifierade åtgärder` | Ny bedömning efter verifierat genomförd åtgärd, annars tomt. |
| `Brister efter verifierade åtgärder` | Kvarstående brister efter verifierat genomförd åtgärd, `-` om inga brister kvarstår, annars tomt. |
| `Osäkerhet` | Antaganden eller kompletterande underlag som behövs. |
<!-- markdownlint-enable MD013 -->

## Kvalitetskrav

- Ta med alla kravrader från källan. Om du avgränsar, ange exakt vilka rader
  som ingår och varför.
- Sortera rapporten i samma ordning som källan.
- Beskriv hur kravet uppfylls även vid `Delvis uppfyllt`; ange både den del
  som finns och den del som saknas.
- Gör evidensen spårbar. Använd relativa sökvägar och radnummer när möjligt.
- Låt varje åtgärd vara kontrollerbar i efterhand.
- Undvik generiska säkerhetsråd som inte kopplas till kravet.
- Sammanfatta gärna antal krav per bedömning före eller efter tabellen.
