/**
 * Cached OIDC discovery + Configuration. Uses openid-client v6 functional API.
 * One Configuration per pod, refreshed only on JWKS rotation (which the lib
 * handles internally).
 */

import * as client from 'openid-client'
import { getAuthConfig } from '@/lib/auth/config'
import { ALLOW_INSECURE_OIDC_ISSUER } from '@/lib/runtime/build-target'

let configurationPromise: Promise<client.Configuration> | undefined

async function discover(): Promise<client.Configuration> {
  const cfg = getAuthConfig()
  if (!cfg.enabled) {
    throw new Error(
      'Auth is disabled — getOidcConfiguration() must not be called.',
    )
  }
  const issuerUrl = new URL(cfg.issuerUrl)
  // openid-client v6 refuses http:// issuers by default. ALLOW_INSECURE_OIDC_ISSUER
  // is a build-time constant: `true` only in `dev` and `local-prod` targets,
  // `false` in `prod` so this entire branch is dead code in production builds.
  const isInsecureIssuer = issuerUrl.protocol === 'http:'
  if (isInsecureIssuer && !ALLOW_INSECURE_OIDC_ISSUER) {
    throw new Error(
      `Refusing to use insecure http:// OIDC issuer in this build: ${cfg.issuerUrl}. ` +
        'Production builds require an https:// issuer.',
    )
  }
  if (isInsecureIssuer && ALLOW_INSECURE_OIDC_ISSUER) {
    // Loud, persistent warning so this can't be missed in logs.
    console.warn(
      '[auth] ALLOW_INSECURE_OIDC_ISSUER=true (build-time constant): accepting insecure http:// ' +
        'OIDC issuer. This must only be used for local dev/prodlike validation against a dev IdP.',
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
