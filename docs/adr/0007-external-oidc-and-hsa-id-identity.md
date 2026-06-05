# External OIDC And HSA-ID Identity

Status: Accepted on 2026-06-05.

Kravhantering uses an external OIDC identity provider as the source of
identity. Browser users authenticate with Authorization Code + PKCE and receive
a stateless encrypted `iron-session` cookie, while MCP clients authenticate
with Bearer JWTs verified against the OIDC issuer.

In both paths, `employeeHsaId` / HSA-ID is the durable application identity key
for authorization, assignments, audit and privacy workflows. Names, email
addresses and display names are contact or display snapshots, not matching
keys.

The application does not maintain a local password store, does not trust
inbound identity headers such as `x-user-id` or `x-user-roles`, and does not
require a server-side session store or sticky-session load balancing.

## Considered Options

- Store local users and passwords: rejected because identity lifecycle,
  authentication strength and account recovery belong to the organization's
  identity provider.
- Trust reverse-proxy identity headers: rejected because callers could spoof
  identity unless every deployment edge was perfectly controlled.
- Match privacy and authorization workflows by name or email: rejected because
  names and contact details can change, collide or be anonymized.
- Use a server-side session store: rejected because the current session payload
  is small enough for an encrypted cookie and stateless sessions keep
  multi-instance deployment simpler.
