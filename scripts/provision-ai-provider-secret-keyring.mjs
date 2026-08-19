#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto'
import { link, mkdir, open, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const KEYRING_ENV = 'AI_PROVIDER_SECRET_KEYRING_FILE'
const LOCAL_ROOT_KEY_VERSION = 'local-1'

export function defaultAiProviderSecretKeyringPath(
  env = process.env,
  cwd = process.cwd(),
) {
  return resolve(
    cwd,
    env[KEYRING_ENV]?.trim() ||
      join('.local', 'ai-provider-secret-keyring.json'),
  )
}

export async function provisionAiProviderSecretKeyring({ path }) {
  const resolvedPath = resolve(path)
  await mkdir(dirname(resolvedPath), { mode: 0o700, recursive: true })
  const temporaryPath = `${resolvedPath}.${process.pid}.${randomUUID()}.tmp`
  const document = `${JSON.stringify(
    {
      activeWriteVersion: LOCAL_ROOT_KEY_VERSION,
      formatVersion: 1,
      keys: {
        [LOCAL_ROOT_KEY_VERSION]: randomBytes(32).toString('base64'),
      },
    },
    null,
    2,
  )}\n`

  const temporary = await open(temporaryPath, 'wx', 0o600)
  try {
    await temporary.writeFile(document, { encoding: 'utf8' })
    await temporary.sync()
  } finally {
    await temporary.close()
  }

  try {
    await link(temporaryPath, resolvedPath)
    return { created: true, path: resolvedPath }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return { created: false, path: resolvedPath }
    }
    throw error
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

function readPathArgument(argv) {
  const index = argv.indexOf('--path')
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  if (!value) throw new Error('--path requires a value')
  return value
}

export async function runAiProviderSecretKeyringProvisioning({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  log = console.log,
} = {}) {
  const path = resolve(
    cwd,
    readPathArgument(argv) ?? defaultAiProviderSecretKeyringPath(env, cwd),
  )
  const result = await provisionAiProviderSecretKeyring({ path })
  log(
    result.created
      ? `Created local AI provider-secret keyring at ${result.path}`
      : `Local AI provider-secret keyring already exists at ${result.path}`,
  )
  return result
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) {
  runAiProviderSecretKeyringProvisioning().catch(error => {
    console.error(
      error instanceof Error
        ? `Could not provision local AI provider-secret keyring: ${error.message}`
        : 'Could not provision local AI provider-secret keyring',
    )
    process.exitCode = 1
  })
}
