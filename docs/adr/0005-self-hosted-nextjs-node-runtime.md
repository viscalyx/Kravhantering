# Self-Hosted Next.js Node Runtime

Status: Accepted on 2026-06-05.

Kravhantering targets a self-hosted Next.js Node runtime with standalone
container builds as the architectural default. The runtime contract is a
Node.js process started with the native Next.js server, environment variables
for SQL Server and OIDC integration, and an ingress or reverse proxy that
preserves the public host and protocol for authentication flows.

This keeps the application portable across local development, CI,
OpenShift-compatible container platforms and other self-hosted Node
deployments. Edge runtime, Vercel-specific services and platform-specific
adapters are not the default architecture; they would require a separate
decision when their operational value outweighs the portability cost.

## Considered Options

- Use Vercel or another managed serverless platform as the default: rejected
  because production delivery must support self-hosted and disconnected
  operation.
- Use Edge runtime for API routes: rejected because the application needs
  SQL Server access, TypeORM and Node runtime behavior.
- Introduce a platform-specific adapter: rejected until a concrete deployment
  target needs behavior that native `next start` cannot provide.
