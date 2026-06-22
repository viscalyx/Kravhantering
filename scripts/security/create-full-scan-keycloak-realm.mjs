#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_DEV_REALM_PATH =
  'dev/keycloak/realm-kravhantering-dev.json'
export const DEFAULT_OUTPUT_DIR = 'test-results/security-dast-full/keycloak'
export const FULL_SCAN_REALM = 'kravhantering-full-scan'
export const FULL_SCAN_USERNAME = 'full.scan'
export const FULL_SCAN_PASSWORD = 'devpass'
export const FULL_SCAN_HSA_ID = 'SE5560000001-fullscan'

function readArg(argv, name, defaultValue) {
  const index = argv.indexOf(name)
  if (index === -1) return defaultValue
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createFullScanRealm(sourceRealm) {
  if (!sourceRealm || typeof sourceRealm !== 'object') {
    throw new Error('Source realm must be an object')
  }

  return {
    ...cloneJson(sourceRealm),
    displayName: 'Kravhantering Full Scan',
    realm: FULL_SCAN_REALM,
    users: [
      {
        attributes: {
          hsaId: [FULL_SCAN_HSA_ID],
        },
        credentials: [
          {
            temporary: false,
            type: 'password',
            value: FULL_SCAN_PASSWORD,
          },
        ],
        email: 'full.scan@example.test',
        emailVerified: true,
        enabled: true,
        firstName: 'Full',
        lastName: 'Scan',
        realmRoles: ['Admin', 'PrivacyOfficer', 'Reviewer'],
        username: FULL_SCAN_USERNAME,
      },
    ],
  }
}

export function fullScanComposeOverride(importDir) {
  const volume = `${path.resolve(importDir)}:/opt/keycloak/data/import:ro`
  return [
    'services:',
    '  idp:',
    '    volumes:',
    `      - ${JSON.stringify(volume)}`,
    '',
  ].join('\n')
}

export function createFullScanKeycloakRealm({
  fsImpl = fs,
  outputDir = DEFAULT_OUTPUT_DIR,
  source = DEFAULT_DEV_REALM_PATH,
} = {}) {
  const sourceText = fsImpl.readFileSync(source, 'utf8')
  const sourceRealm = JSON.parse(sourceText)
  const realm = createFullScanRealm(sourceRealm)
  const realmPath = path.join(outputDir, `realm-${FULL_SCAN_REALM}.json`)
  const composePath = path.join(outputDir, 'docker-compose.full-scan.yml')

  fsImpl.mkdirSync(outputDir, { recursive: true })
  fsImpl.writeFileSync(realmPath, `${JSON.stringify(realm, null, 2)}\n`)
  fsImpl.writeFileSync(composePath, fullScanComposeOverride(outputDir))

  return {
    composePath,
    realm,
    realmPath,
  }
}

export function isDirectRun(argv = process.argv, metaUrl = import.meta.url) {
  return argv[1] != null && path.resolve(argv[1]) === fileURLToPath(metaUrl)
}

if (isDirectRun()) {
  try {
    const result = createFullScanKeycloakRealm({
      outputDir: readArg(process.argv, '--output-dir', DEFAULT_OUTPUT_DIR),
      source: readArg(process.argv, '--source', DEFAULT_DEV_REALM_PATH),
    })
    console.log(`Wrote ${result.realmPath}`)
    console.log(`Wrote ${result.composePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[create-full-scan-keycloak-realm] ${message}`)
    process.exit(1)
  }
}
