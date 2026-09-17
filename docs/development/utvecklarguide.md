# Utvecklingsverktyg för projektet

Den här guiden hjälper utvecklare att välja utvecklingsmiljö och ordna de
verktyg och åtkomster som behövs för att ändra och testa Kravhantering.

## Basverktyg

- Git.
- Node.js 24.
- Den exakta npm-versionen i `package.json` (`packageManager`).
- En Unix-liknande terminal.
- Docker-kompatibel `docker compose`.
- Modern webbläsare för lokal körning och felsökning.

Node-versionen är låst i `.nvmrc` och `package.json`. Använd samma
huvudversion lokalt, i devcontainer och i CI.

## Rekommenderad utvecklingsmiljö

En utvecklare bör ha ett av följande miljöalternativ:

- [VS Code med Dev Containers](devcontainer-developer-workflow.md).
- [GitHub Codespaces](github-codespaces.md).
- [VS Code Remote SSH mot en förberedd RHEL-miljö](remote-ssh-rhel10-development.md).

Devcontainer-miljön är den mest kompletta lokala standardmiljön. Den innehåller
projektets vanliga Node-, databas-, auth- och testförutsättningar.

Börja med [CONTRIBUTING.md](../../CONTRIBUTING.md) för installation och
startkommandon. Följ sedan
[databasflödet](sql-server-developer-workflow.md) för schema, seedning och
anslutning samt [auth-flödet](auth-developer-workflow.md) för lokal inloggning.

## Editor och tillägg

Rekommenderad editor är VS Code.

Praktiska tillägg:

- Dev Containers.
- SQLTools med MSSQL-stöd.
- Playwright Test for VS Code.
- Biome, som projektet använder för lint och formatering.
- Markdown-stöd med markdownlint.

Editorn behöver kunna hantera TypeScript, React, Tailwind CSS och Markdown.

## Lokala stödtjänster

Utvecklaren behöver kunna köra eller nå dessa tjänster:

- SQL Server Developer för applikationsdatabasen.
- Keycloak för lokal OIDC-inloggning.
- Kong Gateway för devcontainer-lokal API-management-verifiering.
- HSA-personuppslagsadapter för devcontainer-lokal REST-till-SOAP-verifiering
  av personuppslag via Kong.
- HSA-katalogmock för devcontainer-lokal SOAP-verifiering av `GetHsaPerson`
  bakom adaptern.

Om AI-stödet ska testas behövs även en konfigurerad AI-anslutning och
leverantörens autentiseringsuppgifter. Hantera anslutningen i Admin Center
enligt [AI-utvecklarflödet](ai-assisted-authoring-developer-workflow.md).

I devcontainer och Codespaces hanteras SQL Server, Keycloak, Kong,
HSA-personuppslagsadaptern och HSA-katalogmocken som sidotjänster. Vid
host-baserad utveckling startas SQL Server och Keycloak med separata
Compose-filer enligt databas- och auth-flödena ovan. Använd devcontainer för
den förberedda HSA-miljön.

## Databasverktyg

Utvecklaren behöver ett sätt att läsa den lokala SQL Server-databasen.

Rekommenderat:

- VS Code SQLTools.
- MSSQL-drivrutin för SQLTools.
- Read-only databasanslutning från `npm run db:browse`.

För mer avancerad felsökning kan även SQL Server Management Studio eller
motsvarande SQL Server-klient användas.

Ändringar i databasens schema och data för tester hanteras i kod, inte manuellt
i databasklienten.

## Auth-verktyg

För lokal auth behövs:

- Keycloak Admin Console för att inspektera den lokala identitetsmiljön.
- Projektets seedade testkonton.
- `scripts/dev-curl.sh` för autentiserade HTTP-anrop mot
  utvecklingsservern.

Vanlig `curl` räcker inte för skyddade routes eftersom auth alltid är aktiv.

## HSA-id-uppslagsverktyg

Använd devcontainer-miljön för att testa personuppslag via Kong och den
lokala HSA-katalogmocken. Följ
[auth-flödets felsökning][auth-hsa-lookup] för tjänster och certifikat.
Integrationskontrakt och diagram finns i
[hsa-person-lookup-integration.md](../integrations/hsa-person-lookup-integration.md).

`npm run dev` genererar även en statisk Swagger UI för REST-kontraktet och
låter Next.js utvecklingsserver exponera den på samma ursprung som
applikationen:

```text
http://localhost:3000/api-docs/hsa-person-lookup/
```

Sökvägen är publik och omdirigerar till den genererade `index.html`.

[auth-hsa-lookup]: ./auth-developer-workflow.md#local-hsa-id-lookup-support

## Test- och kvalitetsverktyg

Följande verktyg installeras via projektets npm-beroenden:

- TypeScript.
- Vitest.
- Playwright.
- Biome.
- markdownlint.
- cSpell.
- Pyright.
- Tailwind CSS kanonisk klass-lint.

`npm run check` kör projektets samlade kontroller. Det kräver även externa
verktyg som `dotenv-linter` och Lychee; `npm install` installerar inte dessa.
Använd den förberedda utvecklingsmiljön om verktygen saknas lokalt.

Playwright behöver egna webbläsare. Devcontainer och Codespaces installerar dem
som en del av miljön. Vid host-baserad utveckling behöver utvecklaren kunna köra
Playwrights installationssteg.

`npm run lint` kör även Tailwind-kontrollen för kanoniska klassnamn. När
kontrollen rapporterar en klass ska utvecklaren normalt ersätta den med den
föreslagna kanoniska formen, till exempel `rounded-4xl` i stället för ett
likvärdigt godtyckligt värde.

## Container- och leveransverktyg

För arbete med bygg, release och produktionslik körning behövs:

- Docker eller Podman.
- Docker Buildx när containeravbildningar byggs lokalt.
- Tillgång till GitHub Actions.
- Tillgång till GHCR eller det containerregister som används av organisationen.
- `gh` CLI om teamet hanterar releaser och workflowkörningar från terminalen.

Följ [publiceringsflödet](trusted-container-publishing.md) för lokala
containerkontroller och releasearbete.

## Åtkomster och behörigheter

Utvecklaren kan behöva:

- Läs- och skrivbehörighet till GitHub-projektet.
- Behörighet att läsa GitHub Actions-loggar.
- Behörighet att läsa eller publicera containeravbildningar.
- Åtkomst till projektets hemligheter i vald utvecklingsmiljö.
- Behörighet att köra containrar i den valda utvecklingsmiljön.

Följ miljöguidens anvisningar för lokala hemligheter och använd
organisationens hemlighetshantering för delade miljöer. AI-leverantörens
autentiseringsuppgifter hanteras via Admin Center; se
[AI-anslutningar](../operations/ai-connections.md). Hemligheter ska inte
checkas in.

## Agentic engineering

Välj agentverktyg som organisationen godkänner för källkod och
utvecklingsdata. Agentstödet behöver kunna läsa kodbasen, köra lokala
kommandon och redovisa verifieringsresultat. För UI-arbete behövs även
tillgång till en lokal webbläsare eller Playwright.

Låt agenten följa projektets `AGENTS.md`, `.github/copilot-instructions.md`
och tillämpliga `.github/instructions/*.md`. Arbeta via vanliga grenar,
PR:er och CI/CD-kontroller. Agenten ska inte ha direkt åtkomst till
produktionshemligheter, produktionsdata eller produktionsmiljöer. Mänsklig
granskning behövs för arkitekturval, säkerhetsbeslut, dataskyddsbedömningar
och releasebeslut.

## Utvecklarflöde

Följ [bidragschecklistan](../../CONTRIBUTING.md#contributor-checklist) innan
du öppnar eller uppdaterar en PR. Redovisa vilka kontroller som körts och
uppdatera tester och dokumentation för ändrat beteende.

För att välja rätt integrationstestflöde, se
[CI integration ownership](ci-integration-ownership.md). När ett CI-jobb
inte körs, kontrollera
[urval av CI-kontroller](ci-selection.md): flera workflows väljer jobb
utifrån vilka filer som ändrats.
