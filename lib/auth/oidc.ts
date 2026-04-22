/**
 * Cached OIDC discovery + Configuration. Uses openid-client v6 functional API.
 * One Configuration per pod, refreshed only on JWKS rotation (which the lib
 * handles internally).
 */

import * as client from 'openid-client'
import { getAuthConfig } from '@/lib/auth/config'

let configurationPromise: Promise<client.Configuration> | undefined

async function discover(): Promise<client.Configuration> {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    throw new Error(
      'Auth is disabled — getOidcConfiguration() must not be called.',
    )
  }
  const issuerUrl = new URL(cfg.issuerUrl)
  // openid-client v6 refuses http:// issuers by default. For local dev
  // against Keycloak on http://localhost:8080 we opt in explicitly. Never
  // allowed in production: lib/auth/config.ts already validates auth at boot,
  // and we additionally gate this opt-in on a non-https issuer + non-production
  // NODE_ENV so a misconfigured prod can never silently accept plaintext OIDC.
  //
  // Escape hatch for `npm run start:prodlike` (which sets NODE_ENV=production
  // but still talks to the local http Keycloak): set
  // AUTH_OIDC_ALLOW_INSECURE_ISSUER=true. This is opt-in and must never be
  // set in a real production deployment.
  const isInsecureIssuer = issuerUrl.protocol === 'http:'
  const isProduction = process.env.NODE_ENV === 'production'
  const insecureOptIn = process.env.AUTH_OIDC_ALLOW_INSECURE_ISSUER === 'true'
  if (isInsecureIssuer && isProduction && !insecureOptIn) {
    throw new Error(
      `Refusing to use insecure http:// OIDC issuer in production: ${cfg.issuerUrl}. ` +
        'If this is a local prod-like run (e.g. npm run start:prodlike), set ' +
        'AUTH_OIDC_ALLOW_INSECURE_ISSUER=true. Never set this in a real deployment.',
    )
  }
  if (isInsecureIssuer && isProduction && insecureOptIn) {
    // Loud, persistent warning so this can't be missed in logs.
    console.warn(
      '[auth] AUTH_OIDC_ALLOW_INSECURE_ISSUER=true: accepting insecure http:// ' +
        'OIDC issuer despite NODE_ENV=production. This must only be used for ' +
        'local prod-like validation against a dev IdP.',
    )
  }
  const executeOptions = isInsecureIssuer
    ? { execute: [client.allowInsecureRequests] }
    : undefined
  const config = await client.discovery(
    issuerUrl,
    cfg.clientId,
    undefined,
    client.ClientSecretPost(cfg.clientSecret),
    executeOptions,
  )
  if (isInsecureIssuer) {
    // Mark the Configuration so subsequent token-exchange / userinfo / etc.
    // calls also accept http://. Equivalent to passing execute on every call.
    client.allowInsecureRequests(config)
  }
  return config
}

export async function getOidcConfiguration(): Promise<client.Configuration> {
  if (configurationPromise === undefined) {
    configurationPromise = discover().catch(error => {
      // Reset so the next call retries discovery instead of caching the failure.
      configurationPromise = undefined
      throw error
    })
  }
  return configurationPromise
}

/** For tests: drop the cached Configuration so the next call re-discovers. */
export function resetOidcConfigurationForTests(): void {
  configurationPromise = undefined
}

/** Re-export commonly used helpers under one namespace. */
export const oidcClient = client
