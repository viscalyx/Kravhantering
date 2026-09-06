# Delade modellverifieringsförsök

Status: Antagen 2026-09-06.

Ett färdigt, sparbart modellverifieringsförsök ska vara beständigt och
tillgängligt för alla behöriga administratörer på samma AI-anslutning. En
annan administratör ska kunna granska resultatet och slutföra sparandet om
den första inte kan fortsätta. Beslutet ersätter aktörsbindningen i
[ADR 0056](./0056-sammanhallen-modellverifiering-och-stabila-korprofiler.md).
Aktuell behörighet prövas vid varje operation; utförda åtgärder tillskrivs
den agerande administratören i den befintliga åtgärdsloggen.

Försöket lagrar resultatet och en begränsad ögonblicksbild av de modellfält
som skickas till verifiering, inklusive namn, beskrivning och eventuell
befintlig modellreferens med samtidighetstoken. Endast färdiga, sparbara
försök erbjuds för fortsatt arbete. Detta inför inte overifierade modellutkast
eller fortsatt körning av avbrutna verifieringar. Promptar, bilder, råa
modell- eller leverantörssvar, endpoints, hemligheter och fria feltexter får
inte lagras i försöket, loggar eller telemetri.

Att stänga formuläret bevarar försöket. Uttrycklig kassering kräver en
separat bekräftelse och gäller för alla administratörer. Tekniska ändringar
i ett öppnat formulär kräver ny verifiering men raderar inte det delade
originalförsöket. Ändrad teknisk anslutningskonfiguration gör fortfarande
oförenliga resultat ogiltiga. Senare ändringar av namn och beskrivning är
lokala fram till sparande.

## Sparande och utgång

Reservation, modellrevisionens sparande och försökets förbrukning hör till
samma SQL Server-transaktion. Den operation som först får exklusiv åtkomst
avgör ordningen mellan sparande och kassering. Samtidiga sparförsök får ett
stabilt konfliktutfall. Ingen separat tidsstyrd lease behövs; återställning
av transaktionen släpper reservationen efter ett fel eller processavbrott.

SQL Servers UTC-tid avgör om en reservation får tas inom försökets
15-minutersperiod. Ett sparande som reserveras före utgång får slutföras
efter utgång. Öppning av formuläret förlänger inte perioden. Efter
återställning får ett nytt sparförsök bara starta om perioden fortfarande
gäller. Rensning får inte radera ett försök som används av en pågående
spartransaktion, även om perioden löper ut under arbetet.

Ett förbrukat försök får inte användas igen. Om ett lyckat sparandes svar
går förlorat ska gränssnittet uppmana administratören att ladda om
modellistan och kontrollera resultatet före ett nytt försök. Beslutet
inför inget beständigt kvitto för att spela upp ett tidigare lyckat svar.

## Kapacitet och rensning

Högst 512 ännu inte utgångna försök får finnas gemensamt för alla
applikationsinstanser. Varje försöks innehåll har uttryckliga storleksgränser.
Nya försök avvisas säkert vid full kapacitet; giltiga försök får inte kastas
ut för att ge plats. Utgångna försök hanteras av den gemensamma begränsade
rensningen enligt
[ADR 0058](./0058-releaseoberoende-rensning-av-transient-tillstand.md).

## Övervägda alternativ

- Personliga försök: hindrar en behörig administratör från att slutföra en
  annans verifierade arbete.
- Separat beständig lease och efterföljande förbrukning: kräver ytterligare
  återtagning och skydd mot gamla ägare samt lämnar en felgräns mellan sparad
  revision och förbrukat försök om operationerna inte samordnas atomiskt.
- Automatisk lagring av ofärdiga modellutkast: tillför en separat livscykel
  som inte behövs för att överlämna redan verifierat arbete.
