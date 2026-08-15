export const SHIPPED_OIDC_CLIENT_SECRET_SENTINELS = [
  'dev-only-app-secret',
  'prodlike-kc-app-secret',
  'container-demo-app-secret-not-for-production',
  'replace-with-oidc-client-secret',
  'replace-with-production-app-client-secret',
]

export const SHIPPED_SESSION_COOKIE_SENTINELS = [
  'dev-only-cookie-password-not-for-production-32chars-min',
  'local-kc-session-key-not-for-production-32chars',
  'container-demo-session-key-not-for-production-32chars',
  'replace-with-32-bytes-of-randomness-XXXXXXXX',
  'replace-with-at-least-32-random-characters',
]

export const SHIPPED_KEYCLOAK_ADMIN_SENTINELS = [
  'admin',
  'replace-with-keycloak-admin-user',
]

export const SHIPPED_KEYCLOAK_ADMIN_PASSWORD_SENTINELS = [
  'admin-not-for-production',
  'replace-with-keycloak-admin-password',
]

export const SHIPPED_MCP_CLIENT_SECRET_SENTINELS = [
  'dev-only-mcp-secret',
  'container-demo-mcp-secret-not-for-production',
  'replace-with-production-mcp-client-secret',
]
