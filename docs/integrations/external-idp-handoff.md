# External IdP Handoff

Use this guide when a production or pre-production deployment needs an
external OIDC-compatible identity provider. It is vendor-neutral by design:
fill in the provider name, environment names, host names and local catalog
attribute names for the site.

The application IdP contract is described in
[oidc-identity-provider-integration.md](./oidc-identity-provider-integration.md).
The production deployment steps that consume these values are described in
[rhel10-production-deploy.md](../operations/rhel10-production-deploy.md).

## Table Of Contents

- [English](#english)
  - [English Checklist](#english-checklist)
  - [English Request Text](#english-request-text)
- [Svenska](#svenska)
  - [Svensk Checklista](#svensk-checklista)
  - [Svensk Ärendetext](#svensk-ärendetext)

## English

### English Checklist

Collect or decide these values with the IdP administrators before the first
cutover to an environment with the external IdP.

- **Environment split**: confirm whether each environment gets a separate
  tenant, realm or client registration.
- **Issuer and discovery**: record the issuer URL and the matching OIDC
  discovery URL ending in `/.well-known/openid-configuration`.
- **Web client**: register a confidential OIDC web client, normally
  `kravhantering-app`, with Authorization Code, PKCE `S256`, and token-endpoint
  authentication `client_secret_post`. Record its `client_id` and
  `client_secret`; allow the requested scopes (default `openid profile email`).
- **Redirect URIs**: register
  `https://<app-host>/api/auth/callback` for every environment.
- **Post-logout URIs**: register `https://<app-host>/` for every environment
  if the provider requires pre-registration.
- **Required ID-token claims**: confirm `sub`, `given_name`, `family_name`,
  and `employeeHsaId` as non-empty strings; verify the HSA-id format below.
- **Display claims**: confirm optional `name`, `preferred_username`, `email`
  and `email_verified` claims when available.
- **Roles claim**: emit the canonical application roles `Reviewer`, `Admin`
  and `PrivacyOfficer` through the configured roles claim, normally `roles`.
- **Role shape**: use a JSON array of exact strings, for example
  `"roles": ["Reviewer"]`.
- **Initial app admin**: provision at least one real application user with a
  valid `employeeHsaId`, both required name claims, and the `Admin` role.
  Assign additional launch roles only as approved by the site.
- **MFA and assurance**: record MFA requirements and whether the provider emits
  `acr` or `amr` claims.
- **Token lifetimes**: record ID-token and access-token lifetimes plus the
  clock skew the provider recommends.
- **Logout support**: confirm whether the discovery document advertises an
  `end_session_endpoint` and what parameters are required.
- **Network and trust**: confirm app-to-IdP TLS access from the hosting
  environment and whether an internal CA certificate is required.
- **Sample tokens**: request redacted or test-user ID tokens and access tokens
  from a non-production environment after the claim mapping is complete.
- **Optional MCP access**: only when service-token clients are approved,
  configure a separate confidential client, normally `kravhantering-mcp`, for
  `client_credentials`.

### English Request Text

Subject: OIDC setup for Kravhantering

Hello,

We are preparing a Kravhantering deployment that will authenticate users
through your OIDC-compatible identity provider. The application uses OIDC
Authorization Code with PKCE for browser sign-in. It may also use OAuth 2.0
Client Credentials for optional MCP service-token access if that integration is
approved for the environment.

Please confirm or provide the following information.

1. **Environment and issuer**

   Can you provide a separate tenant, realm or client registration for each
   environment we will deploy? Please provide the issuer URL and OIDC discovery
   URL for each environment.

2. **Browser web client**

   Please register a confidential web client, normally `kravhantering-app`,
   for Authorization Code with PKCE `S256` and token-endpoint authentication
   `client_secret_post`. Allow the configured scopes (default
   `openid profile email`). Provide the `client_id`, `client_secret`, and any
   provider-specific setup notes.

3. **Redirect and logout URLs**

   Please register these URLs for each environment:

   - `https://<app-host>/api/auth/callback`
   - `https://<app-host>/`

   Confirm the lead time and process for changing those URLs if the public
   application hostname changes.

4. **Required identity claims**

   The ID token must contain these claims:

   - `sub`
   - `given_name`
   - `family_name`
   - `employeeHsaId`

   `employeeHsaId` is the person-stable identity key the application uses for
   assignment-based permissions. Please confirm the source catalog attribute
   and that the value is stable for the same person over time. All four claims
   must be non-empty strings. The HSA-id must match
   `^[A-Z]{2}\d{10}-[A-Za-z0-9]{1,18}$`: two uppercase country-code letters,
   ten organisation-number digits, a hyphen, and 1–18 alphanumeric characters
   (maximum 31 characters overall). Whitespace is not accepted.

5. **Display claims**

   Please emit these claims when available:

   - `name`
   - `preferred_username`
   - `email`
   - `email_verified`

   If your catalog uses different source attributes, please state the mapping.

6. **Application roles**

   The application understands these global role values:

   - `Reviewer`
   - `Admin`
   - `PrivacyOfficer`

   Please emit them through the configured roles claim, normally `roles`, as a
   JSON array of exact strings. Unknown values and non-array role claims are
   ignored by the application.
   Authoring permissions are not IdP roles; they are assigned inside the
   application and matched by `employeeHsaId`.

7. **Initial application administrator**

   Please provision at least one real application user for launch. The user
   must have a valid `employeeHsaId`, `given_name`, `family_name`, and the
   `Admin` role. Assign `Reviewer` or `PrivacyOfficer` only when those
   additional duties are approved. This is separate from any IdP platform
   administrator account.

8. **MFA and assurance**

   Which MFA methods and assurance levels are required for this application?
   Enforce those requirements at the IdP: the application does not enforce
   `acr` or `amr` assurance levels. Record any emitted assurance claims.

9. **Token lifetime and clock skew**

   What lifetimes will the ID tokens and access tokens use? What clock skew
   tolerance do you recommend for token validation?

10. **Logout**

    Does the discovery document advertise an `end_session_endpoint`? If so,
    which parameters are required for RP-initiated logout and must
    post-logout URLs be pre-registered?

11. **Network and certificates**

    Confirm that the application runtime can reach the IdP over TLS from the
    hosting environment. Tell us whether the app needs an internal CA
    certificate to validate the IdP certificate chain.

12. **Sample tokens**

    After the claim mapping is complete, please provide redacted or test-user
    examples of an ID token and access token from a non-production
    environment so we can confirm the agreed claims and token format.

13. **Optional MCP service-token client**

    If MCP service-token access is approved, please configure a separate
    confidential client, normally `kravhantering-mcp`, with
    `grant_type=client_credentials`. The access token must be a signed JWT
    that the application can validate through the provider `jwks_uri`. It must
    use protected-header `typ: at+jwt`; match the configured issuer, audience,
    and top-level `client_id` (also `azp` when present); include numeric `exp`
    and `iat`, non-empty `sub`, and real-format `employeeHsaId`; and have a
    current age and declared
    lifetime no greater than `AUTH_MCP_TOKEN_MAX_AGE_SECONDS` (for example,
    `300` seconds). Agree the required scopes with the application operator
    (`AUTH_MCP_REQUIRED_SCOPES`, normally `kravhantering:mcp`) and emit them in
    the standard top-level space-separated `scope` claim. Emit unique
    canonical roles as a JSON array in the agreed MCP role claim
    (default `roles`).
    Please confirm that the identity-platform or IdP administration owner will
    issue, rotate and revoke this client's credentials, and that each
    consuming MCP integration owner will store and update the client secret in
    its approved secret store.

Thank you.

## Svenska

### Svensk Checklista

Samla in eller besluta dessa värden tillsammans med IdP-administratörerna före
första driftsättning mot en extern IdP.

- **Miljöuppdelning**: bekräfta om varje miljö får en separat tenant, realm
  eller klientregistrering.
- **Issuer och discovery**: dokumentera issuer-URL och motsvarande OIDC
  discovery-URL som slutar med `/.well-known/openid-configuration`.
- **Webbklient**: registrera en konfidentiell OIDC-webbklient, normalt
  `kravhantering-app`, med Authorization Code, PKCE `S256` och
  token-endpoint-autentisering `client_secret_post`. Dokumentera `client_id`
  och `client_secret`; tillåt begärda scopes (standard `openid profile email`).
- **Redirect-URI:er**: registrera
  `https://<app-host>/api/auth/callback` för varje miljö.
- **Post-logout-URI:er**: registrera `https://<app-host>/` för varje miljö om
  leverantören kräver registrering i förväg.
- **Obligatoriska ID-token-claims**: bekräfta `sub`, `given_name`,
  `family_name` och `employeeHsaId` som icke-tomma strängar; kontrollera
  HSA-id-formatet nedan.
- **Claims för visning**: bekräfta valfria claims som `name`,
  `preferred_username`, `email` och `email_verified` när de finns.
- **`roles`-claim**: emittera de kanoniska applikationsrollerna `Reviewer`,
  `Admin` och `PrivacyOfficer` i konfigurerat claim, normalt `roles`.
- **Rollformat**: använd en JSON-array av exakta strängar, till exempel
  `"roles": ["Reviewer"]`.
- **Första applikationsadministratör**: skapa minst en riktig
  applikationsanvändare med giltigt `employeeHsaId`, båda obligatoriska
  namnclaims och rollen `Admin`. Tilldela ytterligare startroller endast
  efter förvaltningens godkännande.
- **MFA och tillitsnivå**: dokumentera MFA-krav och om leverantören emitterar
  `acr` eller `amr`-claims.
- **Livslängder för token**: dokumentera livslängd för ID-token och access-token
  samt rekommenderad tillåten klockskillnad.
- **Logout**: bekräfta om discovery-dokumentet annonserar
  `end_session_endpoint` och vilka parametrar som krävs.
- **Nätverk och tillit**: bekräfta TLS-åtkomst från driftmiljön till IdP och om
  intern CA krävs.
- **Exempel på token**: begär avidentifierade exempel på token eller token för
  testanvändare från en icke-produktionsmiljö när mappningen av claims är klar.
- **Valfri MCP-åtkomst**: endast när service-token-klienter är godkända,
  konfigurera en separat konfidentiell klient, normalt `kravhantering-mcp`,
  för `client_credentials`.

### Svensk Ärendetext

Ämne: OIDC-konfiguration för Kravhantering

Hej!

Vi förbereder en driftsättning av Kravhantering som ska autentisera användare
via er OIDC-kompatibla identitetsleverantör. Applikationen använder OIDC
Authorization Code med PKCE för webbinloggning. Den kan även använda OAuth 2.0
Client Credentials för valfri MCP-åtkomst med service-token om den
integrationen godkänns för miljön.

Bekräfta eller lämna följande information.

1. **Miljö och issuer**

   Kan ni tillhandahålla separat tenant, realm eller klientregistrering per
   miljö som vi ska driftsätta? Skicka issuer-URL och OIDC discovery-URL för
   varje miljö.

2. **Webbklient**

   Registrera en konfidentiell webbklient, normalt `kravhantering-app`, för
   Authorization Code med PKCE `S256` och token-endpoint-autentisering
   `client_secret_post`. Tillåt konfigurerade scopes (standard
   `openid profile email`). Skicka `client_id`, `client_secret` och eventuella
   leverantörsspecifika inställningar.

3. **Redirect och logout**

   Registrera dessa URL:er för varje miljö:

   - `https://<app-host>/api/auth/callback`
   - `https://<app-host>/`

   Bekräfta ledtid och process för att ändra URL:erna om applikationens
   publika värdnamn ändras.

4. **Obligatoriska claims för identitet**

   ID-token måste innehålla dessa claims:

   - `sub`
   - `given_name`
   - `family_name`
   - `employeeHsaId`

   `employeeHsaId` är den personstabila identitetsnyckel som applikationen
   använder för tilldelningsstyrda behörigheter. Bekräfta källattribut i
   katalogen och att värdet är stabilt över tid för samma person. Alla fyra
   claims måste vara icke-tomma strängar. HSA-id måste matcha
   `^[A-Z]{2}\d{10}-[A-Za-z0-9]{1,18}$`: två versala landskodsbokstäver,
   tio siffror för organisationsnummer, ett bindestreck och 1–18 alfanumeriska
   tecken (högst 31 tecken totalt). Blanksteg accepteras inte.

5. **Claims för visning**

   Skicka gärna dessa claims när de finns:

   - `name`
   - `preferred_username`
   - `email`
   - `email_verified`

   Om er katalog använder andra källattribut vill vi veta mappningen.

6. **Applikationsroller**

   Applikationen förstår dessa globala rollvärden:

   - `Reviewer`
   - `Admin`
   - `PrivacyOfficer`

   Emittera dem i konfigurerat claim, normalt `roles`, som en JSON-array
   av exakta strängar. Okända värden och `roles`-claims som inte är
   JSON-arrayer ignoreras av applikationen. Författarbehörighet är inte en
   IdP-roll; den tilldelas i applikationen och matchas med `employeeHsaId`.

7. **Första applikationsadministratör**

   Skapa minst en riktig applikationsanvändare inför lansering. Användaren
   måste ha ett giltigt `employeeHsaId`, `given_name`, `family_name` och rollen
   `Admin`. Tilldela `Reviewer` eller `PrivacyOfficer` endast när de ytterligare
   uppgifterna är godkända. Detta är separat från IdP-plattformens
   administratörskonton.

8. **MFA och tillitsnivå**

   Vilka MFA-metoder och tillitsnivåer ska gälla för applikationen? Kraven måste
   upprätthållas hos IdP: applikationen kontrollerar inte tillitsnivåer i
   `acr` eller `amr`. Dokumentera eventuella claims för tillitsnivå.

9. **Livslängd för token och klockskillnad**

   Vilka livslängder används för ID-token och access-token? Hur stor tillåten
   klockskillnad rekommenderar ni vid tokenvalidering?

10. **Logout**

    Annonserar discovery-dokumentet ett `end_session_endpoint`? Vilka
    parametrar krävs i så fall för RP-initierad logout och måste
    post-logout-URL:er registreras i förväg?

11. **Nätverk och certifikat**

    Bekräfta att applikationens runtime kan nå IdP över TLS från driftmiljön.
    Ange om applikationen behöver ett internt CA-certifikat för att validera
    IdP:ns certifikatkedja.

12. **Exempel på token**

    När mappningen av claims är klar vill vi få avidentifierade eller
    testanvändarbaserade exempel på en ID-token och en access-token från en
    icke-produktionsmiljö för att bekräfta överenskomna claims och tokenformat.

13. **Valfri MCP-klient för service-token**

    Om MCP-åtkomst med service-token godkänns vill vi konfigurera en separat
    konfidentiell klient, normalt `kravhantering-mcp`, med
    `grant_type=client_credentials`. Access-token måste vara en signerad JWT
    som applikationen kan validera via leverantörens `jwks_uri`. Den måste
    använda det skyddade huvudet `typ: at+jwt`, matcha konfigurerad issuer,
    audience och claimen `client_id` på toppnivå (även `azp` om den finns),
    innehålla numeriska `exp` och `iat`, icke-tomt `sub` och verkligt
    `employeeHsaId` samt ha en aktuell ålder
    och deklarerad livslängd som inte överstiger
    `AUTH_MCP_TOKEN_MAX_AGE_SECONDS` (exempelvis `300` sekunder). Kom överens
    med driftansvarig om obligatoriska scopes (`AUTH_MCP_REQUIRED_SCOPES`,
    normalt `kravhantering:mcp`) och emittera dem i den vanliga
    blankstegsseparerade claimen `scope` på toppnivå. Emittera unika kanoniska
    roller som en JSON-array i överenskommen MCP-rollclaim
    (standard `roles`).
    Bekräfta att ägaren för identitetsplattformen eller IdP-administrationen
    utfärdar, roterar och spärrar klientens credentials, och att varje
    konsumerande MCP-integrationsägare lagrar och uppdaterar klienthemligheten
    i godkänd hemlighetshantering.

Tack på förhand!
