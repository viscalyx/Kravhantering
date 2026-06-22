import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createFullScanKeycloakRealm,
  createFullScanRealm,
  FULL_SCAN_HSA_ID,
  FULL_SCAN_PASSWORD,
  FULL_SCAN_REALM,
  FULL_SCAN_USERNAME,
  fullScanComposeOverride,
} from '../create-full-scan-keycloak-realm.mjs'

const tempDirs = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-scan-realm-'))
  tempDirs.push(dir)
  return dir
}

function sampleRealm() {
  return {
    clients: [
      {
        clientId: 'kravhantering-prodlike',
        redirectUris: ['http://localhost:3001/api/auth/callback'],
        secret: 'prodlike-secret',
      },
    ],
    realm: 'kravhantering-dev',
    roles: {
      realm: [{ name: 'Reviewer' }, { name: 'Admin' }],
    },
    users: [{ username: 'ada.admin' }],
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

describe('createFullScanRealm', () => {
  it('clones clients and roles but keeps only the throwaway full-scan user', () => {
    const realm = createFullScanRealm(sampleRealm())

    expect(realm.realm).toBe(FULL_SCAN_REALM)
    expect(realm.clients).toEqual(sampleRealm().clients)
    expect(realm.roles).toEqual(sampleRealm().roles)
    expect(realm.users).toEqual([
      expect.objectContaining({
        attributes: { hsaId: [FULL_SCAN_HSA_ID] },
        credentials: [
          {
            temporary: false,
            type: 'password',
            value: FULL_SCAN_PASSWORD,
          },
        ],
        email: 'full.scan@example.test',
        realmRoles: ['Admin', 'PrivacyOfficer', 'Reviewer'],
        username: FULL_SCAN_USERNAME,
      }),
    ])
  })
})

describe('createFullScanKeycloakRealm', () => {
  it('writes realm and compose override without modifying the source realm', () => {
    const dir = makeTempDir()
    const source = path.join(dir, 'realm-dev.json')
    const outputDir = path.join(dir, 'out')
    const sourceText = JSON.stringify(sampleRealm(), null, 2)
    fs.writeFileSync(source, sourceText)

    const result = createFullScanKeycloakRealm({ outputDir, source })

    expect(fs.readFileSync(source, 'utf8')).toBe(sourceText)
    expect(JSON.parse(fs.readFileSync(result.realmPath, 'utf8'))).toMatchObject(
      {
        realm: FULL_SCAN_REALM,
        users: [{ username: FULL_SCAN_USERNAME }],
      },
    )
    expect(fs.readFileSync(result.composePath, 'utf8')).toBe(
      fullScanComposeOverride(outputDir),
    )
  })

  it('quotes the full volume mapping in the compose override', () => {
    const override = fullScanComposeOverride('/tmp/full scan realm')

    expect(override).toContain(
      JSON.stringify('/tmp/full scan realm:/opt/keycloak/data/import:ro'),
    )
  })
})
