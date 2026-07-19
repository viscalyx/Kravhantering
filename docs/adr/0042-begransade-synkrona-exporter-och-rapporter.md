# Begränsade synkrona exporter och rapporter

Status: Antagen 2026-07-18.

Kravbibliotekets CSV-export och stora kravliste-PDF använder separata,
databaslagrade och Admin-styrda budgetar för antal krav, filstorlek,
genereringstid och samtidighet. PDF-budgeten omfattar även JavaScript-minne
per renderer. Resultat som överskrider en budget avvisas före filleverans;
partiella filer levereras aldrig.

Varje operation skapar en privat diskbaserad mellanlagringsfil på den
`app-runtime`-instans som hanterar HTTP-anropet. Instansen är den operativa
betydelsen av en applikationsnod. Generering och nedladdning sker i samma
anrop, så flera noder kräver varken delad lagring eller sticky sessions.
`KRAVHANTERING_EXPORT_TEMP_DIR` väljer en explicit nodlokal katalog och
Node.js temporära katalog används när variabeln saknas eller är blank. En
explicit katalog måste finnas, vara privat och ge den icke-privilegierade
operativsystemsanvändare som kör Node.js-processen läs-, skriv- och
sökbehörighet.

Samtidighetsplatser och logiska diskreservationer är processlokala. Avbrott,
timeout och fel terminerar arbetet och städar mellanlagringen. Den stora
kravliste-PDF:en renderas i en heapbegränsad `worker_threads.Worker`.
Turbopack kompilerar TypeScript-ingången och dess beroenden som en del av
ordinarie Next.js-bygge och behåller worker-delarna i fristående runtime.
Produktions- och prodlike-gaten anropar den riktiga kravliste-PDF-rutten och
kräver ett giltigt `application/pdf`-svar.

Ingen bakgrundskö, objektlagring, separat create/status/download-begäran eller
automatisk återförsökning införs. Fler-nodsdrift ger nya anrop möjlighet att
generera om filen på en annan instans, medan operatören ger varje instans en
egen filnamnsrymd och dimensionerar eventuell gemensam fysisk disk för
instansernas sammanlagda maximala behov.

Beslutet kompletterar
[ADR 0020](./0020-kapacitetsobserverbarhet-via-plattformen.md) om
integritetssäker kapacitetsmätning och
[ADR 0036](./0036-servergenererad-pdf-som-rapportformat.md) om
servergenererad PDF. Det begränsar den kompletta CSV-/PDF-traversering som
beskrivs i
[ADR 0041](./0041-framatmarkorer-for-kravlistor.md) till den aktiva
operationens Admin-styrda postgräns.

Utrullning och återställning följer projektets hela release- och
databaskontrakt: inga blandade versionsnoder körs, och återställning efter
migrering återför både samtliga noder och SQL Server till återställningspunkten
före uppgraderingen.
