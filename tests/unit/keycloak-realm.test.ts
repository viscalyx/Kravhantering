import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isHsaId } from '@/lib/auth/hsa-id'

type KeycloakRealmClient = {
  clientId?: string
  protocolMappers?: Array<{
    name?: string
    config?: Record<string, string>
    protocolMapper?: string
  }>
}

type KeycloakRealm = {
  clients?: KeycloakRealmClient[]
}

function readDevRealm() {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), 'dev/keycloak/realm-kravhantering-dev.json'),
      'utf8',
    ),
  ) as KeycloakRealm
}

function getMcpEmployeeHsaIdMapper() {
  const realm = readDevRealm()
  const mcpClient = realm.clients?.find(
    client => client.clientId === 'kravhantering-mcp',
  )
  return mcpClient?.protocolMappers?.find(
    mapper => mapper.name === 'mcp-employeeHsaId',
  )
}

describe('dev Keycloak realm', () => {
  it('emits a real-format HSA-ID for the MCP service account', () => {
    const mapper = getMcpEmployeeHsaIdMapper()
    const employeeHsaId = mapper?.config?.['claim.value']

    expect(mapper?.protocolMapper).toBe('oidc-hardcoded-claim-mapper')
    expect(mapper?.config?.['access.token.claim']).toBe('true')
    expect(employeeHsaId).toBe('SE2321000032-mcp1')
    expect(isHsaId(employeeHsaId)).toBe(true)
  })
})
