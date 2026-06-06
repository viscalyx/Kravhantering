# Next.js Node-runtime i egen drift

Status: Antagen 2026-06-05.

Kravhantering riktar sig mot en Next.js Node-runtime i egen drift med
standalone container builds som arkitektonisk standard. Runtime-kontraktet är
en Node.js
process startad med den inbyggda Next.js-servern, miljövariabler för SQL Server
och OIDC-integration samt en ingress eller reverse proxy som bevarar publik
host och protokoll för autentiseringsflöden.

Det håller applikationen portabel över lokal utveckling, CI,
OpenShift-kompatibla containerplattformar och andra självhostade
Node-driftsättningar. Edge runtime, Vercel-specifika tjänster och
plattformsspecifika adapters är inte standardarkitekturen; de kräver ett
separat beslut när deras driftvärde väger tyngre än portabilitetskostnaden.

## Övervägda alternativ

- Använda Vercel eller en annan managed serverless platform som standard:
  avvisat eftersom produktionsleverans måste stödja egen drift och
  frånkopplad drift.
- Använda Edge runtime för API routes: avvisat eftersom applikationen behöver
  SQL Server-åtkomst, TypeORM och Node-runtime-beteende.
- Införa en plattformsspecifik adapter: avvisat tills ett konkret
  driftsättningsmål behöver beteende som inbyggd `next start` inte kan ge.
