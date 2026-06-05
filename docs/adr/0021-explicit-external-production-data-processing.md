# Explicit External Production-Data Processing

Status: Accepted on 2026-06-05.

Kravhantering treats external production-data processing as an explicit
deployment and integration choice, not as something implied by installing the
application. In a self-hosted installation where the customer runs the
application host, SQL Server, IdP, reverse proxy, logging, SIEM and backup
inside its own organization, the baseline is that no external party processes
Kravhantering's production information solely because the application is
installed.

External parties become relevant when they actually receive, store, transport,
analyze or can access production information. Examples include external IdP
services, hosted SQL Server or database operations, platform logging or SIEM,
backup or archive storage, support with access to logs or exports, approved
external MCP clients or AI agents, and OpenRouter or selected model providers
when AI-assisted authoring is enabled.

Software vendors, package sources, CI/CD services and container registries are
documented as supply-chain dependencies by default. They are documented as
external production-data processors only when they receive production data,
logs, telemetry, support packages, remote access or another actual path to
Kravhantering's information.

## Considered Options

- List every software supplier as a production-data processor: rejected
  because it confuses supply-chain dependencies with parties that actually
  process Kravhantering information.
- Treat a self-hosted installation as having no external processors in every
  case: rejected because integrations such as external IdP, logging, support,
  MCP clients and AI providers may introduce real external access.
- Let each feature decide the boundary independently: rejected because
  procurement, privacy, security and operations need one consistent rule for
  when external processing must be documented.
