import { pathToFileURL } from 'node:url'
import {
  loadAiProviderSecretMaintenanceKeyring,
  verifyAiProviderSecretRestoreSet,
} from './ai-provider-secret-maintenance.mjs'
import {
  getSqlServerDatabaseUrl,
  verifyAiProviderSecretRestoreForConnection,
} from './db-sqlserver-admin.mjs'

const DEFAULT_BATCH_SIZE = 100

export function parseAiProviderSecretRestoreArgs(args) {
  let batchSize = DEFAULT_BATCH_SIZE
  let omitRootKeyVersion
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]?.trim()
    if (flag === '--batch-size') {
      batchSize = Number(value)
    } else if (flag === '--omit-root-key-version') {
      omitRootKeyVersion = value
    } else {
      throw new Error(`Unsupported restore-verifier option: ${flag}`)
    }
    if (!value) throw new Error(`${flag} requires a value.`)
    index += 1
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error('--batch-size must be an integer from 1 to 1000.')
  }
  return { batchSize, omitRootKeyVersion }
}

export async function verifyAiProviderSecretRestoreInPages(
  connectionString,
  options,
) {
  const verifyConnection =
    options.verifyConnectionImpl ?? verifyAiProviderSecretRestoreForConnection
  const verifyRestore =
    options.verifyRestoreImpl ?? verifyAiProviderSecretRestoreSet
  return verifyConnection(connectionString, {
    env: options.env,
    ...(options.omitRootKeyVersion
      ? { omitRootKeyVersion: options.omitRootKeyVersion }
      : {}),
    providerSecretMaintenanceModule: {
      loadAiProviderSecretMaintenanceKeyring:
        options.loadKeyringImpl ?? loadAiProviderSecretMaintenanceKeyring,
      verifyAiProviderSecretRestoreSet(dataSource, keyring, forwardedOptions) {
        return verifyRestore(dataSource, keyring, {
          ...forwardedOptions,
          batchSize: options.batchSize,
        })
      },
    },
  })
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const env = dependencies.env ?? process.env
  try {
    const parsed = parseAiProviderSecretRestoreArgs(args)
    const connectionString = (
      dependencies.getDatabaseUrlImpl ?? getSqlServerDatabaseUrl
    )(env)
    const report = await verifyAiProviderSecretRestoreInPages(
      connectionString,
      { ...dependencies, ...parsed, env },
    )
    consoleObj.log(JSON.stringify(report, null, 2))
    return report.compatible &&
      report.checkedSecretVersionCount > 0 &&
      report.safeToRemoveOmittedRootKeyVersion !== false
      ? 0
      : 1
  } catch {
    consoleObj.error(
      'AI provider-secret restore verification failed. Check the restored database, bounded arguments, and external keyring.',
    )
    return 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2))
}
