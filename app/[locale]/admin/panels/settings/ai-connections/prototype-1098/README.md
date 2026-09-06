# Fristående prototyp för #1098

Fråga: går det att överblicka modellformuläret och verifieringen när alla
kontroller och körprofiler finns på plats redan från början?

Öppna `index.html` direkt i webbläsaren. Filen innehåller all HTML, CSS och
JavaScript och behöver varken installation, nätverk, inloggning eller databas.

För lokal server, kör från denna katalog:

```sh
python3 -m http.server 3108 --bind 0.0.0.0
```

Öppna sedan <http://localhost:3108>.

Tryck **Verifiera** i verifieringspanelens rubrikrad för ett simulerat
förlopp på cirka tolv sekunder. Knappen blir **Avbryt verifiering** under
körning och **Verifiera igen** efter resultat eller avbrott. Prova
även avbrott, nya tekniska modelluppgifter eller **Visa slutresultat**.
Resultatväljaren erbjuder full kompatibilitet, saknat bildstöd och oavgjort
resonemang. **Återställ** visar startläget igen. Temaknappen växlar mellan
ljust och mörkt tema. En smal webbläsare visar en kolumn.

Designen använder appens färgkoder, teckensnittsordning, fältstorlekar och
rundade ytor. En enda design demonstrerar det överenskomna förslaget.
Panelens slutliga utseende ska bedömas av användaren innan implementation.

Användaren väljer placeringen i verifieringspanelens rubrikrad. Panelens
inledning förklarar åtgärden; separat hjälptext under formuläret tas bort.
**Avbryt** och **Spara modellrevision** ligger tillsammans under formuläret.
**Verifiera** och **Verifiera igen** använder en play-ikon som signalerar
att åtgärden startar en körning. Bockikonen används för verifierade resultat.
**Avbryt verifiering** använder en Square-ikon som signalerar att körningen
stoppas och bildar ett start/stopp-par med play-ikonen.

Detta är engångskod på grenen `prototype/issue-1098-verification-panel`.
Alla resultat är simulerade och allt tillstånd finns enbart i minnet.
Prototypen är inte en Next.js-rutt och kopplar inte in Developer Mode.
Produktimplementationen behöver ordinarie komponenter, översättningar,
Developer Mode-markörer och tester enligt agentbriefen i #1098.
