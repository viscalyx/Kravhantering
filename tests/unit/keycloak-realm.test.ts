import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isHsaId } from '@/lib/auth/hsa-id'

type KeycloakRealmClient = {
  clientId?: string
  protocolMappers?: Array<{
    name?: string
    config?: Record<string, string>
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

function getMcpEmployeeHsaIdClaim() {
  const realm = readDevRealm()
  const mcpClient = realm.clients?.find(
    client => client.clientId === 'kravhantering-mcp',
  )
  const employeeHsaIdMapper = mcpClient?.protocolMappers?.find(
    mapper => mapper.name === 'mcp-employeeHsaId',
  )

  return employeeHsaIdMapper?.config?.['claim.value']
}

describe('dev Keycloak realm', () => {
  it('emits a real-format HSA-ID for the MCP service account', () => {
    const employeeHsaId = getMcpEmployeeHsaIdClaim()

    expect(employeeHsaId).toBe('SE2321000032-mcp1')
    expect(isHsaId(employeeHsaId)).toBe(true)
  })
})
