# AISVS som AI- och MCP-verifieringsöverlägg

<!-- cSpell:ignore AISVS -->

Status: Antagen 2026-07-02.

Kravhantering använder OWASP AISVS v1.0 som verifieringsöverlägg för
AI-assisterat författande och MCP-ytan. AISVS ersätter inte befintliga
applikationskontroller för autentisering, behörighet, loggning, SSDLC,
SAST, DAST eller beroendekontroll. Det kompletterar dem med AI- och
agentnära kontrollpunkter.

Målnivån är AISVS nivå 1 samt utvalda nivå 2-kontroller där applikationen
redan har en faktisk riskyta: promptinjektion, utdatafiltrering,
säkerhetsloggning och MCP-transport. Nivå 3 och kontroller för modellträning,
finjustering, RAG, vektorindex och autonoma agentkedjor är inte tillämpliga
så länge Kravhantering inte har dessa funktioner.
