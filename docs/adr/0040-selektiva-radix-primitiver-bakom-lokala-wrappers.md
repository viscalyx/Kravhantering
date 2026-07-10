# Selektiva Radix-primitiver bakom lokala wrappers

Status: Antagen 2026-07-10.

Kravhantering använder selektiva Radix-primitiver för beteendet i menyer,
popover-ytor, dialoger och utfällbara kontroller. Radix används endast bakom
lokala `App*`-wrappers i `components/primitives/`. Produktkomponenter får inte
importera `@radix-ui/*` direkt.

De lokala primitiverna ansvarar för återkommande interaktionsmekanik som
tangentbordsnavigering, fokus, stängning, portaler, kollisionshantering och
ARIA-relationer. Produktkomponenterna fortsätter att ansvara för översättningar,
verksamhetsflöden, tillstånd, Tailwind-styling, ikoner, täthet, mörkt läge,
reducerad rörelse och synlig layout.

Radix Themes ingår inte i produktens designsystem. Kravhantering behåller sitt
lokala Tailwind-baserade visuella språk. En eventuell framtida visuell
designförändring kräver ett separat beslut och ska inte motiveras enbart av att
Radix används för beteende.

Det första verifierade menyprovet ersätter den manuella detaljmeny-hook som
hanterar meny-ID:n, fokusförflyttning, piltangenter, Home, End, Escape,
utanförklick och fokusåtergång. Samma lokala `AppMenu` används därefter för
kravdetaljens rapport- och delningsmenyer samt kravtabellens kommandomenyer.

Produktionsberoendena omfattar fyra beteendepaket: Collapsible, Dialog,
Dropdown Menu och Popover. Jämfört med grenen utan Radix tillför de 41 poster i
`package-lock.json`, varav 29 är Radix-paket och 12 är stödberoenden. Installerad
storlek under `node_modules/@radix-ui` är cirka 2,1 MB; detta är inte samma sak
som klientens komprimerade bundle-storlek. Radix Themes och dess globala CSS är
inte med i produktionsresultatet.

Ett isolerat produktionsbygge av `main` och detta beslut, med samma Next.js-
version och installerade verktyg, visar den praktiska klientkostnaden. De unika
JavaScript-filer som sidornas klientmanifest listar ökade för
kravbiblioteket från 2 465 579 till 2 556 681 byte okomprimerat och från 607 537
till 638 283 byte gzip-komprimerat. Detaljsidan ökade från 1 497 753 till
1 587 925 byte okomprimerat och från 360 861 till 391 508 byte
gzip-komprimerat. Skillnaden är alltså cirka 91 kB okomprimerat eller 31 kB
gzip per ingång; den delade koden laddas inte dubbelt vid navigering mellan
sidorna. Hela katalogen med statiska JavaScript-filer ökade från 8 128 till
8 432 KiB i allokerad diskstorlek.

Biome-regeln `noRestrictedImports` stoppar direkta Radix-importer utanför
wrapper-katalogen. Tester verifierar användarsynliga roller, namn, åtgärder,
tangentbordsförflyttning och fokusåtergång i stället för Radix-genererad DOM.
