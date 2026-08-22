import { isIP } from 'node:net'
import type { AiEgressTransport, AiRunType } from '@/lib/ai/run-contracts'

export const AI_CONNECTION_AUTHENTICATION_TYPES = [
  'mtls',
  'none',
  'oauth2_client_credentials',
  'static_secret',
] as const

export type AiConnectionAuthenticationType =
  (typeof AI_CONNECTION_AUTHENTICATION_TYPES)[number]

export interface AiConnectionDataPolicy {
  isPersonalDataProcessed: boolean
  isTrainingAllowed: boolean
  maximumInformationClass: string
  maximumRetentionDays: number
  processingRegions: readonly string[]
  subprocessors: readonly string[]
}

export interface AiConnectionTrustConfiguration {
  authenticationType: AiConnectionAuthenticationType
  dataPolicy: Readonly<AiConnectionDataPolicy> | null
  egressPolicyKey: string
  endpointUrl: string
  tlsPolicyKey: string
}

export interface AiRunDataPolicyRequirement {
  allowedProcessingRegions: readonly string[]
  informationClassOrder: readonly string[]
  maximumInformationClass: string
  maximumRetentionDays: number
  personalDataAllowed: boolean
  requireTrainingProhibited: boolean
}

export interface AiEgressPolicy {
  allowedOrigins: readonly string[]
  privateSidecarAddresses?: readonly string[]
  privateSidecarOrigins: readonly string[]
}

export interface AiTlsPolicy {
  certificateValidation: 'required'
  /**
   * Deployment-owned transport. It MUST connect only to resolvedAddresses
   * while retaining serverName for SNI and hostname/certificate validation.
   */
  fetchPinned(request: Readonly<AiPinnedTlsRequest>): Promise<Response>
  trustSource: 'deployment_private_ca' | 'public_web_pki'
}

export interface AiPinnedTlsRequest {
  init: Readonly<RequestInit>
  resolvedAddresses: readonly string[]
  serverName: string
  url: string
}

export interface AiDeploymentTrustPolicy {
  dataPolicies: Partial<Record<AiRunType, AiRunDataPolicyRequirement>>
  developmentLocalOrigin?: string
  egressPolicies: Readonly<Record<string, AiEgressPolicy>>
  environment: 'development' | 'production' | 'test'
  resolveHostname(hostname: string): Promise<readonly string[]>
  tlsPolicies: Readonly<Record<string, AiTlsPolicy>>
}

export type AiConnectionTrustErrorCode =
  | 'authentication_not_allowed'
  | 'data_policy_not_satisfied'
  | 'endpoint_not_allowed'
  | 'egress_policy_missing'
  | 'resolved_address_not_allowed'
  | 'tls_policy_missing'

export class AiConnectionTrustError extends Error {
  readonly code: AiConnectionTrustErrorCode
  readonly safeMessage = 'The AI connection trust policy blocked the request.'

  constructor(code: AiConnectionTrustErrorCode) {
    super('The AI connection trust policy blocked the request.')
    this.name = 'AiConnectionTrustError'
    this.code = code
  }
}

export interface AiAuthorizedConnectionTarget {
  egressPolicyKey: string
  endpoint: URL
  hostname: string
  isPrivateSidecar: boolean
  protocol: string
  tlsPolicyKey: string
}

function denied(code: AiConnectionTrustErrorCode): never {
  throw new AiConnectionTrustError(code)
}

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

function parseEndpoint(
  configuration: AiConnectionTrustConfiguration,
  deployment: AiDeploymentTrustPolicy,
): URL {
  let endpoint: URL
  try {
    endpoint = new URL(configuration.endpointUrl)
  } catch {
    return denied('endpoint_not_allowed')
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    return denied('endpoint_not_allowed')
  }
  const developmentLocal =
    deployment.environment === 'development' &&
    deployment.developmentLocalOrigin !== undefined &&
    endpoint.origin === normalizedOrigin(deployment.developmentLocalOrigin)
  if (
    endpoint.protocol !== 'https:' &&
    endpoint.protocol !== 'wss:' &&
    !(developmentLocal && endpoint.protocol === 'http:')
  ) {
    return denied('endpoint_not_allowed')
  }
  return endpoint
}

function ipv4Parts(value: string): readonly number[] | null {
  if (isIP(value) !== 4) return null
  return value.split('.').map(part => Number(part))
}

function isPublicIpv4(value: string): boolean {
  const parts = ipv4Parts(value)
  if (!parts) return false
  const [a = 0, b = 0, c = 0] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168)) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) {
    return false
  }
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function ipv6Bytes(value: string): readonly number[] | null {
  if (isIP(value) !== 6) return null
  const dottedIndex = value.lastIndexOf(':')
  const dotted = value.includes('.') ? value.slice(dottedIndex + 1) : null
  const ipv4 = dotted ? ipv4Parts(dotted) : null
  const hexadecimal = ipv4
    ? `${value.slice(0, dottedIndex)}:${(((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0)).toString(16)}:${(((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0)).toString(16)}`
    : value
  const halves = hexadecimal.split('::')
  if (halves.length > 2) return null
  const left = halves[0]?.split(':').filter(Boolean) ?? []
  const right = halves[1]?.split(':').filter(Boolean) ?? []
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ].map(group => Number.parseInt(group, 16))
  if (groups.length !== 8 || groups.some(group => !Number.isFinite(group))) {
    return null
  }
  return groups.flatMap(group => [group >> 8, group & 0xff])
}

function isPublicIpAddress(value: string): boolean {
  if (isIP(value) === 4) return isPublicIpv4(value)
  const bytes = ipv6Bytes(value.toLowerCase())
  if (!bytes) return false
  const isEmbeddedIpv4 = bytes.slice(0, 10).every(byte => byte === 0)
  if (
    isEmbeddedIpv4 &&
    ((bytes[10] === 0 && bytes[11] === 0) ||
      (bytes[10] === 0xff && bytes[11] === 0xff))
  ) {
    return isPublicIpv4(bytes.slice(12).join('.'))
  }
  // Fail closed outside IPv6 global unicast and for documentation/tunnel ranges.
  const [first = 0, second = 0, third = 0, fourth = 0] = bytes
  if ((first & 0xe0) !== 0x20) return false
  if (first === 0x20 && second === 0x02) return false // 6to4
  if (
    first === 0x20 &&
    second === 0x01 &&
    (third === 0 ||
      (third === 0x0d && fourth === 0xb8) ||
      (third === 0x10 && (fourth & 0xf0) === 0) ||
      (third === 0x20 && (fourth & 0xf0) === 0))
  ) {
    return false
  }
  return !(first === 0x3f && second === 0xff && (third & 0xf0) === 0)
}

function exactSidecarAddresses(policy: AiEgressPolicy): ReadonlySet<string> {
  return new Set(
    (policy.privateSidecarAddresses ?? []).map(address =>
      address.toLowerCase(),
    ),
  )
}

function validateResolvedAddresses(
  addresses: readonly string[],
  isPrivateSidecar: boolean,
  policy: AiEgressPolicy,
): void {
  if (addresses.length === 0) denied('resolved_address_not_allowed')
  const sidecarAddresses = exactSidecarAddresses(policy)
  for (const address of addresses) {
    if (isPrivateSidecar) {
      if (
        sidecarAddresses.size === 0 ||
        !sidecarAddresses.has(address.toLowerCase())
      ) {
        denied('resolved_address_not_allowed')
      }
      continue
    }
    if (!isPublicIpAddress(address)) {
      denied('resolved_address_not_allowed')
    }
  }
}

function validateAuthentication(
  configuration: AiConnectionTrustConfiguration,
  deployment: AiDeploymentTrustPolicy,
  endpoint: URL,
): void {
  if (
    !AI_CONNECTION_AUTHENTICATION_TYPES.includes(
      configuration.authenticationType,
    )
  ) {
    denied('authentication_not_allowed')
  }
  if (configuration.authenticationType !== 'none') return
  const developmentOrigin = deployment.developmentLocalOrigin
    ? normalizedOrigin(deployment.developmentLocalOrigin)
    : null
  if (
    deployment.environment !== 'development' ||
    !developmentOrigin ||
    endpoint.origin !== developmentOrigin
  ) {
    denied('authentication_not_allowed')
  }
}

export async function authorizeAiConnectionTarget(
  configuration: AiConnectionTrustConfiguration,
  deployment: AiDeploymentTrustPolicy,
): Promise<Readonly<AiAuthorizedConnectionTarget>> {
  const endpoint = parseEndpoint(configuration, deployment)
  validateAuthentication(configuration, deployment, endpoint)
  const egressPolicy = deployment.egressPolicies[configuration.egressPolicyKey]
  if (!egressPolicy) denied('egress_policy_missing')
  const tlsPolicy = deployment.tlsPolicies[configuration.tlsPolicyKey]
  if (
    tlsPolicy?.certificateValidation !== 'required' ||
    !['deployment_private_ca', 'public_web_pki'].includes(
      tlsPolicy?.trustSource ?? '',
    )
  ) {
    denied('tls_policy_missing')
  }
  const allowedOrigins = new Set(
    egressPolicy.allowedOrigins.map(normalizedOrigin).filter(Boolean),
  )
  const privateSidecarOrigins = new Set(
    egressPolicy.privateSidecarOrigins.map(normalizedOrigin).filter(Boolean),
  )
  const isPrivateSidecar = privateSidecarOrigins.has(endpoint.origin)
  if (!isPrivateSidecar && !allowedOrigins.has(endpoint.origin)) {
    denied('endpoint_not_allowed')
  }
  let addresses: readonly string[]
  try {
    addresses = await deployment.resolveHostname(endpoint.hostname)
  } catch {
    return denied('resolved_address_not_allowed')
  }
  validateResolvedAddresses(addresses, isPrivateSidecar, egressPolicy)
  return Object.freeze({
    egressPolicyKey: configuration.egressPolicyKey,
    endpoint,
    hostname: endpoint.hostname,
    isPrivateSidecar,
    protocol: endpoint.protocol,
    tlsPolicyKey: configuration.tlsPolicyKey,
  })
}

function endpointContains(target: URL, requested: URL): boolean {
  const basePath = target.pathname.endsWith('/')
    ? target.pathname
    : `${target.pathname}/`
  return (
    requested.origin === target.origin &&
    (requested.pathname === target.pathname ||
      requested.pathname.startsWith(basePath)) &&
    !requested.username &&
    !requested.password &&
    !requested.search &&
    !requested.hash
  )
}

export function createAiEgressTransport(
  target: Readonly<AiAuthorizedConnectionTarget>,
  deployment: AiDeploymentTrustPolicy,
): AiEgressTransport {
  const egressPolicy = deployment.egressPolicies[target.egressPolicyKey]
  const tlsPolicy = deployment.tlsPolicies[target.tlsPolicyKey]
  if (!egressPolicy) return denied('egress_policy_missing')
  if (!tlsPolicy) return denied('tls_policy_missing')
  return Object.freeze({
    async fetch(input: string, init: RequestInit): Promise<Response> {
      let requested: URL
      try {
        requested = new URL(input)
      } catch {
        return denied('endpoint_not_allowed')
      }
      if (!endpointContains(target.endpoint, requested)) {
        return denied('endpoint_not_allowed')
      }
      if (init.redirect !== 'error') return denied('endpoint_not_allowed')
      let addresses: readonly string[]
      try {
        addresses = await deployment.resolveHostname(requested.hostname)
      } catch {
        return denied('resolved_address_not_allowed')
      }
      validateResolvedAddresses(
        addresses,
        target.isPrivateSidecar,
        egressPolicy,
      )
      return tlsPolicy.fetchPinned(
        Object.freeze({
          init: Object.freeze({
            ...init,
            redirect: 'error',
          }),
          resolvedAddresses: Object.freeze([...addresses]),
          serverName: target.hostname,
          url: requested.toString(),
        }),
      )
    },
  })
}

function isCompleteDataPolicy(
  policy: Readonly<AiConnectionDataPolicy> | null,
): policy is Readonly<AiConnectionDataPolicy> {
  return Boolean(
    policy &&
      typeof policy.isPersonalDataProcessed === 'boolean' &&
      typeof policy.isTrainingAllowed === 'boolean' &&
      policy.maximumInformationClass &&
      Number.isInteger(policy.maximumRetentionDays) &&
      policy.maximumRetentionDays >= 0 &&
      Array.isArray(policy.processingRegions) &&
      policy.processingRegions.length > 0 &&
      Array.isArray(policy.subprocessors),
  )
}

export function enforceAiDataPolicy(
  configuration: AiConnectionTrustConfiguration,
  runType: AiRunType,
  deployment: AiDeploymentTrustPolicy,
): void {
  const connectionPolicy = configuration.dataPolicy
  const required = deployment.dataPolicies[runType]
  if (!required || !isCompleteDataPolicy(connectionPolicy)) {
    denied('data_policy_not_satisfied')
  }
  if (
    connectionPolicy.isTrainingAllowed ||
    connectionPolicy.maximumRetentionDays > 0
  ) {
    denied('data_policy_not_satisfied')
  }
  const requiredClass = required.informationClassOrder.indexOf(
    required.maximumInformationClass,
  )
  const approvedClass = required.informationClassOrder.indexOf(
    connectionPolicy.maximumInformationClass,
  )
  if (requiredClass < 0 || approvedClass < requiredClass) {
    denied('data_policy_not_satisfied')
  }
  if (
    required.personalDataAllowed !== connectionPolicy.isPersonalDataProcessed
  ) {
    denied('data_policy_not_satisfied')
  }
  if (
    required.requireTrainingProhibited &&
    connectionPolicy.isTrainingAllowed
  ) {
    denied('data_policy_not_satisfied')
  }
  if (connectionPolicy.maximumRetentionDays > required.maximumRetentionDays) {
    denied('data_policy_not_satisfied')
  }
  const allowedRegions = new Set(required.allowedProcessingRegions)
  if (
    connectionPolicy.processingRegions.some(
      region => !allowedRegions.has(region),
    )
  ) {
    denied('data_policy_not_satisfied')
  }
}
