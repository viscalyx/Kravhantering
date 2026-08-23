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

Registret är den enda transportpolicyn; något äldre läge, partiellt register
eller någon fallback-flagga finns inte. Proxy och wrappers tillämpar
registerpolicyn på alla svarsvägar, och route-lokala cachedeklarationer är inte
en alternativ policykälla.
