# HSA-personuppslag som REST-gräns mot integrationsplattform

Status: Antagen 2026-06-14.

Kravhantering behåller en stabil appnära gräns för HSA-personuppslag:
`POST /hsa/person-records/lookup` med REST/JSON och ett kontrakt som
Kravhantering äger. Applikationen konfigureras fortsatt med
`HSA_PERSON_LOOKUP_URL`; SOAP `GetHsaPerson`, HSAWS mTLS och transformationen
från REST till SOAP ska ligga bakom integrationsplattformens gräns.

När `HSA_PERSON_LOOKUP_URL` är satt kräver appen strikt mTLS med en komplett
uppsättning av CA, klientcertifikat, klientnyckel och exakt serveridentitet.
Det finns
ingen anonym, klartext- eller enbart OAuth-baserad transport. OAuth2 client
credentials är valfritt och endast additivt till mTLS. OAuth2 kan använda
en explicit token-URL eller OIDC discovery via issuer-URL. Hemligheter,
privata nycklar, SITHS-certifikat och verkliga HSA-uppgifter ska aldrig
checkas in eller ingå i releaseartefakter.

Destinationskontrollen följer produktionsstackens befintliga ansvarsfördelning.
Värdens brandvägg, en godkänd utgående proxy och uppströms ACL:er ansvarar för
tillåtna IP-adresser, CIDR-intervall, DNS-vägar och nätverksdestinationer.
Applikationen ska inte duplicera den policyn med egna IP- eller CIDR-listor
eller DNS-pinning. Applikationen ansvarar i stället för det HTTP- och
OAuth-nära skydd som nätverkslagret inte kan uttrycka: HTTPS krävs i
produktion, omdirigeringar följs inte, discovery-utfärdaren måste motsvara den
konfigurerade utfärdaren och en upptäckt token-endpoint måste ha samma origin.
En token-endpoint på en annan origin måste konfigureras explicit. Klient- och
bearer-hemligheter får skickas först efter dessa kontroller, och discovery-,
token- och uppslagssvar ska ha godkänd JSON-innehållstyp och fasta
bytegränser.

Projektet äger en `hsa-person-lookup-adapter`-container för test, demo och
miljöer som vill använda Kong framför HSA. Adaptern exponerar REST-kontraktet
och anropar uppströms SOAP `GetHsaPerson` med mTLS. Den HSA-katalogmock som
projektet levererar exponerar bara SOAP och kör realistisk mTLS- och
behörighetskontroll: betrott klientcertifikat, `subject.serialNumber` som
HSA-id för det anropande systemet, aktivt anropande system samt behörigheterna
`hsaws2` och `GetHsaPerson`.

Releaseartefakten innehåller OpenAPI-kontraktet och en statiskt genererad
Swagger UI för REST-gränsen. Produktionsstackens `container-stack.lock.json`
beskriver fortsatt endast obligatoriska produktionstjänster. Kong och
adaptern låses separat i `container-hsa-integration-support.lock.json`.
HSA-katalogmocken är fortsatt test- och demo-stöd.

Kong-topologin som projektet stödjer publicerar bara
`/hsa/person-records/lookup` och dirigerar den till adaptern. Katalogmocken
exponerar SOAP endast mot adaptern; Kong exponerar ingen SOAP-sökväg och mocken
har ingen REST-fasad. Release-smoke använder en separat CI-only
Quadlet-overlay med samma adapter- och mTLS-väg. `single-node-demo` är endast
ett val för frånkopplad transport av stödavbildningarna, inte en
runtime-topologi. Repository-ägda testmiljöer använder tre separata
test-PKI-domäner och rollspecifika skrivskyddade runtime-buntar.
Produktionsoperatörer tillhandahåller själva motsvarande absoluta monterade
sökvägar; projektet utfärdar inga produktionscertifikat och orkestrerar inte
extern Kong eller HSA-plattform.

REST-kontraktet använder stabila felkoder. Framgång ger `200` med `hsaId`,
`givenName`, `middleName`, `surname`, `email` och
`hasProtectedPersonalData`. Tomt SOAP `userInformations` ger
`404 { code: "not_found" }`; konflikt mellan normaliserade SOAP-poster ger
`409 { code: "conflict" }`; valideringsfel ger
`400 { code: "validation" }`;
certifikatidentitet eller additiv OAuth kan ge `401` eller `403`; SOAP-fel och
otillgänglighet ger `503 { code: "service_unavailable" }`; timeout ger
`504 { code: "timeout" }`. Kravhanterings användarflöden skiljer fortsatt bara
ut saknad HSA-id och konflikt; andra uppslagsfel visas som otillgänglig tjänst.

Kravhantering transporterar och lagrar även
`hasProtectedPersonalData`, mappad från HSA `hsaProtectedPerson`, på
Kravansvarsperson. För att göra ansvar och behörighet tydliga för de
anställda som har ett ansvar i applikationen behöver Kravhantering visa namn
och den unika identitet som arbetsgivaren har delat ut, och som
identitetsintygsutfärdaren intygar, på de ställen där uppgifterna behövs även
om personen har skyddade personuppgifter. Skyddsflaggan ska därför inte ensam
leda till generell maskering av namn eller HSA-id i obligatoriska arbetsflöden.

Särskild hantering av HSA-personpost med skyddade personuppgifter utgår i
stället från ändamål, vy, behörighet och regional riskbedömning. Uppgifterna
visas bara där de behövs för ansvar, spårbarhet, uppdrag eller
behörighetsprövning. Export och loggning minimerar personfält och hjälptext
förklarar att skyddsflaggan kräver behovsstyrd hantering men inte blockerar en
kravansvarstilldelning.

Verifieringsanropet är läsande och lagrar inte HSA-svaret. Det returnerar i
stället kortlivat, signerat bevis bundet till aktör, målidentitet, ändamål och
omfattning. Slutlig tilldelning verifierar beviset och sparar personpost och
ansvar i samma transaktion. Begränsningsnycklar och utfallsloggar använder
icke-reversibla fingeravtryck, inte rått mål-HSA-id eller personuppgifter.
Utfallet loggas som `success`, `not_found`, `conflict`, `throttled` eller
`provider_failure`.
