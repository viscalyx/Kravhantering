# Extern OIDC och HSA-ID som identitet

Status: Antagen 2026-06-05.

Kravhantering använder en extern OIDC identity provider som källa för identitet.
Webbläsaranvändare autentiserar med Authorization Code + PKCE och får en
stateless krypterad `iron-session` cookie, medan MCP clients autentiserar med
Bearer JWTs som verifieras mot OIDC issuer.

I båda vägarna är `employeeHsaId` / HSA-ID applikationens varaktiga
identitetsnyckel för auktorisering, uppdrag, audit och dataskyddsflöden. Namn,
e-postadresser och visningsnamn är kontakt- eller visningsvärden vid
händelsetillfället, inte matchningsnycklar.

Applikationen underhåller inget lokalt lösenordslager, litar inte på inkommande
identity headers som `x-user-id` eller `x-user-roles` och kräver ingen
server-side session store eller sticky-session load balancing.

## Övervägda alternativ

- Lagra lokala användare och lösenord: avvisat eftersom identity lifecycle,
  authentication strength och account recovery hör hemma hos organisationens
  identity provider.
- Lita på reverse-proxy identity headers: avvisat eftersom klienter kan
  förfalska identitet om inte varje deployment edge är perfekt kontrollerad.
- Matcha dataskydds- och auktoriseringsflöden med namn eller e-post: avvisat
  eftersom namn och kontaktuppgifter kan ändras, kollidera eller anonymiseras.
- Använda en server-side session store: avvisat eftersom nuvarande
  session payload är liten nog för en krypterad cookie och stateless sessions
  håller multi-instance deployment enklare.
