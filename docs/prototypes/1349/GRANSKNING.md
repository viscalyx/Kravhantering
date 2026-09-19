# Granska prototyp D, E och paketens syfte

<!-- markdownlint-configure-file {"MD060": {"style": "compact"}} -->

Prototypen finns i samma separata worktree och körs på port 3001.
Den vanliga utvecklingsappen på port 3000 påverkas inte.

- [Öppna D: lika breda urvalsrutor](http://localhost:3001/sv/requirements/new?variant=D)
- [Öppna E: välj i dialog](http://localhost:3001/sv/requirements/new?variant=E)

Logga in med utvecklingskontot om det behövs. Använd väljaren längst ned för
att växla mellan Nuläge, A, B, C, D och E. Via **Ändringar och checklista**
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

**Syfte och avgränsning** visas direkt under varje paketnamn vid urvalet.
I Nuläge–D visas det i formulärets paketlista; i E visas det i dialogen.
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

## E: välj först, visa sedan endast valda objekt

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

Dialogens markeringar är ett tillfälligt utkast; endast **Välj** för över dem
till formuläret. Sökning och stängning ändrar inte det redan tillämpade
urvalet. Variantväljaren döljs medan en modal är öppen och dess kortkommandon
är avstängda, så att de inte stör dialogen.

E väljer befintliga normreferenser. Övriga varianters **Ny** simulerar
skapande i minnet; E inför inget nytt skapandeflöde i urvalsdialogen.

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
