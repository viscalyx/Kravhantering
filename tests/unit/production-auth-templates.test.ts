import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface RealmTemplate {
  clients: Array<{
    clientId: string
    publicClient: boolean
    secret: string
  }>
}

function readEnvTemplate(relativePath: string): Map<string, string> {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), relativePath),
    'utf8',
  )
  return new Map(
    content
      .split(/\r?\n/u)
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

describe('production authentication templates', () => {
  it('ships required application secrets blank for deployment injection', () => {
    const appEnv = readEnvTemplate('containers/production/env/app.env.template')

    expect(appEnv.get('AUTH_OIDC_CLIENT_SECRET')).toBe('')
    expect(appEnv.get('AUTH_SESSION_COOKIE_PASSWORD')).toBe('')
  })

  it('ships bundled Keycloak administrator credentials blank', () => {
    const keycloakEnv = readEnvTemplate(
      'containers/production/env/keycloak.env.template',
    )

    expect(keycloakEnv.get('KEYCLOAK_ADMIN')).toBe('')
    expect(keycloakEnv.get('KEYCLOAK_ADMIN_PASSWORD')).toBe('')
  })

  it('ships every bundled confidential realm client without a secret', () => {
    const realm = JSON.parse(
      fs.readFileSync(
        path.resolve(
          process.cwd(),
          'containers/production/keycloak/realm-kravhantering-production.template.json',
        ),
        'utf8',
      ),
    ) as RealmTemplate
    const confidentialClients = realm.clients.filter(
      client => client.publicClient === false,
    )

    expect(confidentialClients.map(client => client.clientId)).toEqual([
      'kravhantering-app',
      'kravhantering-mcp',
    ])
    expect(confidentialClients.map(client => client.secret)).toEqual(['', ''])
  })
})
