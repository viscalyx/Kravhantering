# AISVS som AI- och MCP-verifieringsöverlägg

<!-- cSpell:ignore AISVS -->

Status: Antagen 2026-07-02.

Kravhantering använder OWASP AISVS v1.0 som verifieringsöverlägg för
AI-assisterat författande och MCP-ytan. AISVS ersätter inte befintliga
applikationskontroller för autentisering, behörighet, loggning, SSDLC,
SAST, DAST eller beroendekontroll. Det kompletterar dem med AI- och
agentnära kontrollpunkter.

AI-anslutningar och anslutna agentmiljöer omfattas av AI-överlägget genom
AI-integrationslagrets gemensamma kontrakt. Adaptergränsen och tillitsgränsen
följer [ADR 0051](./0051-ai-integrationslager-med-korprofiler-och-adaptrar.md)
respektive
[ADR 0052](./0052-tillitsgrans-och-krypterade-ai-leverantorshemligheter.md).

Målnivån är AISVS nivå 1 samt utvalda nivå 2-kontroller där applikationen
redan har en faktisk riskyta: promptinjektion, utdatafiltrering,
säkerhetsloggning och MCP-transport. Nivå 3 och kontroller för modellträning,
finjustering, RAG, vektorindex och beständiga autonoma agentkedjor är inte
tillämpliga så länge Kravhantering inte har dessa funktioner. En agentmiljös
tillfälliga interna arbete under ett avgränsat AI-anrop ändrar inte denna
bedömning.

## MCP-kontrollmappning

Mappningen använder versionsbundna kontroll-id:n från AISVS v1.0. Den anger
implementerad status bara där applikationen har verifierbar evidens och gör
inte anspråk på att en närliggande kontroll är uppfylld.

<!-- markdownlint-disable MD013 -->
| AISVS-kontroll | Status | Evidens och avgränsning |
| --- | --- | --- |
| `v1.0-C10.2.1` | Implementerad | Varje anrop till en aktiverad `/api/mcp` verifierar sin Bearer-token före databas, transport, requirements service eller verktygsarbete. En avsiktligt inaktiverad yta svarar `404`. |
| `v1.0-C10.2.2` | Implementerad | Verifiering av token kontrollerar signatur, issuer, audience, expiration och alla konfigurerade scopes. Den kräver dessutom `at+jwt`, `sub`, `iat`, kort aktuell ålder, begränsad deklarerad livslängd och exakt `client_id`. |
| `v1.0-C10.2.3` | Implementerad | Åtkomsttoken används bara i den request-lokala verifieringsgränsen och sparas inte i session, databas, audit eller MCP-importvalidering. Endast verifierad aktörskontext förs vidare. |
| `v1.0-C10.2.4` | Inget anspråk | MCP använder ett gemensamt minsta scope, inte separata scopes för `tools/list` eller enskilda verktyg. |
| `v1.0-C10.2.5` | Delvis | Requirements service prövar behörighet vid verktygsanrop, men scope-till-verktyg och scope-till-argument är inte implementerat. |
| `v1.0-C10.3.3` | Inget anspråk | Självständig Host- och Origin-validering följs separat i issue `#388`. Bearer-token ersätter inte den transportkontrollen. |
<!-- markdownlint-enable MD013 -->
