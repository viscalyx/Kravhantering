# REST-registret som auktoritativ transportpolicy

Status: Antagen 2026-07-29.

Kravhantering registrerar atomärt varje explicit applikationsägd
REST-operation under `app/api` med autentisering, CSRF, känslighet,
cachebeteende och kontraktsomfattning. Registret är den gemensamma
transportpolicyn för proxy och godkända route-wrappers; begärans innehåll,
verksamhetsauktorisering, validering, databasarbete och åtgärdsdetaljer ligger
kvar i routes och tjänster. MCP ligger utanför registret eftersom dess
Bearer-autentisering, JSON-RPC-kontrakt och direkta mutationsexporter utgör en
separat transportgräns.

Next.js 16-proxyn körs på Node.js och `proxy.config.matcher` förblir en literal
för Next.js statiska analys. Registret förblir ändå en beroendefri lövmodul så
att transportpolicyn inte får en onödig koppling till ramverket eller andra
runtime-beroenden.

Registret använder kanoniska Next.js-mallar och explicita operationer eftersom
filbaserad routing och OpenAPI inte kan dela en körbar deklaration utan att
koppla produktionens proxy till filsystem eller YAML. Tester kontrollerar den
oundvikliga dupliceringen genom exakt likhet mellan route-exporter, register
och den avgränsade OpenAPI-mängden. Okända REST-operationer får en konservativ
policy med session, CSRF för mutationer och `no-store`, men skickas vidare till
Next.js så att okända URL:er fortfarande kan ge `404`.

Migreringen saknar äldre läge, partiellt register och fallback-flagga.
Atomär auktoritet undviker att två policykällor kan ge olika beslut under en
övergång. Route-lokala cachedeklarationer ersätts först när proxy och wrappers
tillämpar motsvarande registerpolicy på alla svarsvägar.
