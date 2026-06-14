# HSA-personuppslag som REST-gräns mot integrationsplattform

Status: Antagen 2026-06-14.

Kravhantering behåller en stabil appnära gräns för HSA-personuppslag:
`POST /hsa/person-records/lookup` med REST/JSON och ett kontrakt som
Kravhantering äger. Applikationen konfigureras fortsatt med
`HSA_PERSON_LOOKUP_URL`; SOAP `GetHsaPerson`, HSAWS mTLS och transformationen
från REST till SOAP ska ligga bakom integrationsplattformens gräns.

För miljöer där Kong används mellan Kravhantering och den riktiga
HSA-katalogen kan appen komplettera `HSA_PERSON_LOOKUP_URL` med valfri
app-till-integrationsplattform-autentisering: ingen autentisering, mTLS,
OAuth2 client credentials eller mTLS och OAuth2 tillsammans. OAuth2 kan använda
en explicit token-URL eller OIDC discovery via issuer-URL. Hemligheter,
privata nycklar, SITHS-certifikat och verkliga HSA-uppgifter ska aldrig
checkas in eller ingå i releaseartefakter.

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
`/hsa/person-records/lookup` och dirigerar den till adaptern. Den tidigare
REST-fasaden i mocken och Kong-SOAP-sökvägen ska inte längre beskrivas som
nuvarande kontrakt. `single-node-demo` använder samma adapter- och mTLS-väg som
release-smoke. Lokala och pipeline-baserade testcertifikat kan genereras, men
operatörer kan montera egna självsignerade testcertifikat för demo.

REST-kontraktet använder stabila felkoder. Framgång ger `200` med `hsaId`,
`givenName`, `middleName`, `surname`, `email` och
`hasProtectedPersonalData`. Tomt SOAP `userInformations` ger `404
{ code: "not_found" }`; konflikt mellan normaliserade SOAP-poster ger `409
{ code: "conflict" }`; valideringsfel ger `400 { code: "validation" }`;
plattformens valfria autentisering kan ge `401` eller `403`; SOAP-fel och
otillgänglighet ger `503 { code: "service_unavailable" }`; timeout ger
`504 { code: "timeout" }`. Kravhanterings användarflöden skiljer fortsatt bara
ut saknad HSA-id och konflikt; andra uppslagsfel visas som otillgänglig tjänst.

Kravhantering transporterar och lagrar även
`hasProtectedPersonalData`, mappad från HSA `hsaProtectedPerson`, på
Kravansvarsperson. Detta beslut inför ingen särskild UI-maskering eller
policybehandling. Den verksamhets- och dataskyddspolicy som ska styra särskild
hantering av HSA-personpost med skyddade personuppgifter ska beslutas separat
i GitHub issue
[#326](https://github.com/viscalyx/Kravhantering/issues/326).
