# Granska prototyp D, E.1, E.2, E.3 och paketens syfte

<!-- markdownlint-configure-file {"MD060": {"style": "compact"}} -->

Prototypen finns i samma separata worktree och körs på port 3001.
Den vanliga utvecklingsappen på port 3000 påverkas inte.

- [Öppna D: lika breda urvalsrutor](http://localhost:3001/sv/requirements/new?variant=D)
- [Öppna E.1: välj i lista](http://localhost:3001/sv/requirements/new?variant=E.1)
- [Öppna E.2: välj i tabell](http://localhost:3001/sv/requirements/new?variant=E.2)
- [Öppna E.3: kompakt väljare](http://localhost:3001/sv/requirements/new?variant=E.3)

Logga in med utvecklingskontot om det behövs. Använd väljaren längst ned för
att växla mellan Nuläge, A, B, C, D, E.1, E.2 och E.3. Via **Ändringar och checklista**
visas beskrivningen av vald variant och formulärets aktuella tillstånd.

Starta prototypen om den inte redan körs:

```sh
cd /mnt/krav-azure-dev-data/.worktrees/1349-form-prototype
npm run prototype:1349
```

Vid fjärrutveckling behöver port 3001 och den befintliga Keycloak-porten 8080
vara vidarebefordrade till localhost i webbläsaren.

## D: smalare inmatning, lika breda urvalsrutor

D ger mindre bredd till formulärets vänstra del. Kravpaket och normreferenser
får lika breda rutor och mer plats än i Nuläge. Skrivfältens höjd behålls.
Avslutningen samlar sparmål och Spara/Avbryt på en rad när bredden räcker.

Vid 1920 × 1080 med infälld navigation är skrivkolumnen cirka 402 pixlar
bred och urvalsrutorna 390 pixlar vardera. Jämför med Nulägets skrivkolumn
på 662 pixlar och urvalsrutor på 260 pixlar.

1. Växla mellan Nuläge och D med samma data och skärmstorlek.
2. Jämför bredden på kravtext, klassificeringsfält och urvalsrutor.
3. Läs paketens syfte och de långa normreferensnamnen.
4. Klicka **Läs in lång text** och prova att redigera. Bedöm om den smalare
   skrivytan passar arbetet; detta är avsiktligt ett alternativ att utvärdera.
5. Upprepa vid 1440 × 900, med utfälld navigation och mörkt tema.

## Paketens syfte i samtliga varianter

Paketets syfte visas direkt under namnet, utan en upprepad rubrik.
Texten är mindre än paketnamnet: 12 respektive 14 pixlar.
I Nuläge–D visas det i formulärets paketlista; i E.1/E.2 visas det i dialogen.
Det behövs ingen hovring för att läsa syftet innan man väljer.

Enligt önskemålet används vanliga kryssrutor, **utan särskild bekräftelse**.
Vägledningen säger att bara paket vars syfte omfattar kravet ska väljas.
Användaren gör bedömningen; prototypen utför ingen automatisk textmatchning.
Paket utan angivet syfte märks **Syfte saknas**. Prototypen inför ingen ny
spärr för sådana paket.

Kontrollera ett paket med kort syfte och ett med längre text. Syftet ska
vara läsbart, kopplat till rätt paket och åtkomligt även med tangentbord.
Notera att mer information per paket innebär färre synliga paket åt gången
och mer rullning i listan, särskilt i A:s smala paketkolumn.

Nuläge behåller den ursprungliga geometrin men får samma synliga syfte som
övriga varianter. De äldre skärmbilderna finns kvar i föregående commit.

## E.1 och E.2: välj först, visa sedan endast valda objekt

1. Klicka **Lägg till kravpaket**. En modal dialog visar paketnamn och syfte.
2. Markera två paket. Prova sökningen: den söker även i paketens syfte.
   Val som döljs av sökningen ska ligga kvar som markerade.
3. Klicka **Avbryt**. Formuläret ska fortfarande ha sitt tidigare urval.
4. Öppna dialogen igen, markera paketen och klicka **Välj**.
5. Formuläret visar nu endast de valda paketen som märken. Ta bort ett med
   märkets borttagningsknapp och kontrollera att det försvinner.
6. Klicka **Lägg till normreferens**. Markera flera normreferenser och tryck
   **Välj**. Även dessa ska visas som märken i formuläret.
7. Öppna båda dialogerna igen. Befintliga val ska vara förmarkerade.
8. Ändra ett urval och stäng med Escape eller stängningsknappen. Ändringen
   ska kastas och fokus återgå till knappen som öppnade dialogen.
9. Växla till D. Samma val ska visas i kryssrutorna. En tidigare modalsökning
   får inte filtrera bort paket i D:s lista.

Normreferensens ID har samma grå ton som i övriga varianter, i både ljust
och mörkt tema. Namnet behåller sin vanliga textfärg.

Dialogens markeringar är ett tillfälligt utkast; endast **Välj** för över dem
till formuläret. Sökning och stängning ändrar inte det redan tillämpade
urvalet. Variantväljaren döljs medan en modal är öppen och dess kortkommandon
är avstängda, så att de inte stör dialogen.

E.1 och E.2 väljer befintliga normreferenser. Övriga varianters **Ny** simulerar
skapande i minnet; dialogerna inför inget nytt skapandeflöde i urvalsdialogen.

## E.2: tabeller i båda dialogerna

E.1 behåller listorna. E.2 använder en tabell i respektive dialog:

- Normreferenser: kryssruta, **Referens-ID**, **Namn**.
- Kravpaket: kryssruta, **Kravpaket**, **Syfte**.

De två textkolumnerna är vänsterjusterade. Referens-ID har samma grå ton
som tidigare, och paketens syfte visas med mindre text utan upprepad rubrik.
Urval, sökning, Välj och Avbryt fungerar på samma sätt i båda varianter.
I E.2 visar normreferensens märke endast referens-ID. Hovra över märket
för att läsa namnet i en tooltip. Kravpaketets märke visar paketnamnet,
med syfte och avgränsning i en tooltip.
Kolumnrubrikerna ligger kvar överst när tabellens innehåll rullas.
Vägledningen om paketens syfte visas under dialogtiteln, före sökfältet,
och ligger också kvar när tabellen rullas.
Knapparna i E.2 heter **Välj kravpaket** och **Välj normreferens**.
Dialogen har två grupper: **Redan valda** och
**Ej valda**. Grupperna bestäms när dialogen öppnas. En ny
markering ligger kvar i den nedre gruppen. Ett avmarkerat tidigare val
ligger kvar i den övre gruppen och kan markeras igen. Raderna flyttas inte
när kryssrutorna ändras.

Sökning filtrerar båda grupperna utan att ändra deras innehåll eller val.
Grupperna rullas tillsammans under de fasta kolumnrubrikerna. Om inget
var valt när dialogen öppnades visas bara den nedre gruppen.
**Välj** tillämpar urvalet. Nästa öppning grupperar efter det nya urvalet.
**Avbryt**, Escape och stängningsknappen kasserar ändringarna som tidigare.

Den gamla länken med `?variant=E` öppnar E.1.

1. Öppna båda dialogerna i E.2 och kontrollera kolumnerna.
2. Klicka på ett paketnamn eller en normreferens för att markera raden.
3. Sök, markera fler objekt och tryck **Välj**. Kontrollera märkena.
4. Växla till E.1 och öppna dialogen. Samma objekt ska vara markerade i listan.
5. Prova **Avbryt**, Escape och återöppning med båda varianterna.
6. Granska tabellerna i ljust och mörkt tema samt vid 320 pixlars bredd.
7. Rulla ned i båda tabellerna. Rubrikerna ska ligga kvar, med täckande
   bakgrund så att raderna inte syns genom dem.
8. Välj paket och normreferenser. Kontrollera märkenas text och hovra över
   dem i ungefär en sekund för att läsa respektive tooltip.
9. Öppna dialogen med ett tidigare val. Avmarkera det och markera ett annat
   objekt längre ned. Båda ska behålla sina platser tills dialogen stängs.
10. Sök efter ett objekt i vardera gruppen. Rensa sökningen och kontrollera
    att markeringarna finns kvar. Prova först Avbryt och sedan Välj.
11. Öppna igen efter Välj. Det nya urvalet ska visas överst. Avmarkera allt,
    tryck Välj och öppna igen; den övre gruppen ska nu vara dold.

- [Kravpaket med fasta grupper](screenshots/E2-packages-groups.png)
- [Normreferenser med fasta grupper](screenshots/E2-norms-groups.png)
- [Grupper vid 320 pixlar i mörkt tema](screenshots/E2-packages-groups-320-dark.png)
- [Kontroll av grupper och val](group-inspection.json)
- [E.2:s paketdialog](screenshots/E2-packages-modal.png)
- [E.2:s normreferensdialog](screenshots/E2-norms-modal.png)
- [E.2:s paketdialog i mörkt tema](screenshots/E2-packages-dark.png)
- [E.2:s normreferenser i mörkt tema](screenshots/E2-norms-dark.png)
- [E.2:s dialog vid 320 pixlar](screenshots/E2-modal-320.png)
- [Rullad paketlista med fasta rubriker](screenshots/E2-packages-sticky.png)
- [Rullade normreferenser med fasta rubriker](screenshots/E2-norms-sticky.png)
- [Normreferensens märke med tooltip](screenshots/E2-norm-badge-tooltip.png)
- [Kravpaketets märke med tooltip](screenshots/E2-package-badge-tooltip.png)
- [Kontroll av märken och tooltips](badge-tooltip-inspection.json)
- [Kontroll av fasta rubriker](sticky-header-inspection.json)
- [Kontroller för E.2](table-modal-inspection.json)

## E.3: kompakt väljare på rubrikraden

E.3 använder samma dialoger och grupper som E.2. Skillnaden är hur man
öppnar dialogerna: en liten pennikon med texten **Välj** ligger till höger
på samma rad som rubriken. Hjälpknappen finns kvar bredvid rubriken.

Ingen siffra visas på ikonen. Den separata knappraden och raden med antal
är borttagna; valda objekt visas som märken under rubriken.

Vid 1440 × 900 minskar varje tom urvalsyta från 190 till 84 pixlars höjd.
Med två paket respektive en normreferens minskar höjden från 178 till 96
pixlar per yta. Detta är urvalsytornas höjd; skrivfälten behåller sin höjd.

1. Jämför E.2 och E.3 med samma val. Kontrollera höjden på urvalsytorna.
2. Klicka **Välj** på rubrikraden och markera flera objekt. Formulärets
   märken ska uppdateras först efter **Välj** i dialogen. Avbryt behåller dem.
3. Ta bort ett valt märke i formuläret. Det ska försvinna. Pennikonen ska
   alltid visas utan en siffra, även när flera objekt är valda.
4. Använd Tab och Enter för att öppna dialogen. Efter stängning ska fokus
   återgå till samma knapp. Kontrollera även den separata hjälpknappen.
5. Upprepa vid 320 pixlars bredd och i mörkt tema. Ikon och text ska
   rymmas på rubrikraden.

- [E.2 med tomma urvalsytor](screenshots/E2-compact-comparison-empty.png)
- [E.3 med tomma urvalsytor](screenshots/E3-compact-comparison-empty.png)
- [E.3 med val](screenshots/E3-compact-1440-light.png)
- [E.3 i mörkt tema](screenshots/E3-compact-1440-dark.png)
- [E.3 vid 320 pixlar](screenshots/E3-compact-320-light.png)
- [Kontroller och höjdmätningar](E3-compact-inspection.json)
- [Dialogernas gruppkontroller](E3-group-inspection.json)
- [Kontroll av tooltips](E3-tooltip-inspection.json)

Om en redan öppen utvecklingssida visar `MISSING_MESSAGE` för E.3 efter
uppdateringen, ladda om hela sidan för att läsa in de nya översättningarna.

## Ändringslista och kontrollpunkter

<!-- markdownlint-disable MD013 -->
| Ändring | Kontroll |
| :--- | :--- |
| D med smalare inmatningsfält | Jämför med Nuläge; fälthöjden är oförändrad. |
| D med lika breda paket- och normrutor | Mät eller jämför rutornas bredd vid båda desktopstorlekarna. |
| Synligt syfte i alla varianter | Läs texten utan hovring; paketnamn och syfte ska höra ihop. |
| Vanliga paketkryssrutor | Välj och avmarkera direkt; ingen extra bekräftelseruta ska visas. |
| Tydligt saknat syfte | Paket utan syftestext ska märkas, inte få en påhittad beskrivning. |
| E med två separata modaler | Paketknappen visar paket; normknappen visar normreferenser. |
| Sökbara urvalslistor | Sök på namn, norm-ID eller paketsyfte; dolda markeringar bevaras. |
| Välj tillämpar utkastet | Märkena uppdateras först när Välj trycks. |
| Avbryt, Escape och stäng kasserar utkastet | Befintligt urval och formulärtext ska vara oförändrade. |
| Valda objekt som märken | Kontrollera fullständiga namn, radbrytning och borttagning. |
| Återöppning med tidigare val | Tidigare tillämpade val är markerade. |
| Fokus och modalens tangentbord | Tab stannar i dialogen; Escape stänger och återställer fokus. |
| Väljaren omfattar D och E | Piltangenter och listan växlar variant utanför inmatningsfält. |
| Svensk och engelsk text | Byt `/sv/` mot `/en/` och granska D, E och dialogerna. |
| Inga databasskrivningar | Urval, Spara och Ny stannar i minnet; omladdning rensar dem. |
<!-- markdownlint-enable MD013 -->

## Underlag

- [D vid 1920 pixlar](screenshots/D-1920-collapsed-light.png)
- [D vid 1440 pixlar, mörkt tema](screenshots/D-1440-expanded-dark.png)
- [E med valda objekt](screenshots/E-selected.png)
- [E:s paketdialog](screenshots/E-packages-modal.png)
- [E:s normdialog](screenshots/E-norms-modal.png)
- [E:s dialog vid 320 pixlar](screenshots/E-modal-320.png)
- [Resultat från dialogkontrollerna](modal-inspection.json)
- [Samtliga jämförelsemätningar](measurements.json)
- [Tidigare och gemensamma kontrollpunkter](README.md)

Detta är fortfarande en prototyp i en separat gren. Ingen slutlig layout är
vald, och verklig sparning eller produktionsvalidering ingår inte.
