#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseAiProviderSecretKeyring } from '../lib/ai/provider-secret-keyring.ts'

const KEYRING_ENV = 'AI_PROVIDER_SECRET_KEYRING_FILE'
const LOCAL_ROOT_KEY_VERSION = 'local-1'

function assertPrivatePath(metadata, expectedOwnerUid, expectedMode, kind) {
  if (metadata.uid !== expectedOwnerUid) {
    throw new Error(
      `AI provider-secret keyring ${kind} has an unexpected owner`,
    )
  }
  if ((metadata.mode & 0o7777) !== expectedMode) {
    throw new Error(
      `AI provider-secret keyring ${kind} must have mode ${expectedMode.toString(8)}`,
    )
  }
}

async function validateContainingDirectory(
  path,
  { inspectPath = lstat, ownerUid = process.getuid?.() } = {},
) {
  if (!Number.isInteger(ownerUid)) {
    throw new Error('AI provider-secret keyring ownership cannot be validated')
  }
  const metadata = await inspectPath(dirname(path))
  if (!metadata.isDirectory()) {
    throw new Error(
      'AI provider-secret keyring containing path is not a directory',
    )
  }
  assertPrivatePath(metadata, ownerUid, 0o700, 'directory')
}

export async function validateExistingAiProviderSecretKeyring(
  path,
  { inspectPath = lstat, openFile = open, ownerUid = process.getuid?.() } = {},
) {
  const resolvedPath = resolve(path)
  await validateContainingDirectory(resolvedPath, { inspectPath, ownerUid })

  const existing = await openFile(
    resolvedPath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  )
  try {
    const metadata = await existing.stat()
    if (!metadata.isFile()) {
      throw new Error('AI provider-secret keyring path is not a regular file')
    }
    assertPrivatePath(metadata, ownerUid, 0o600, 'file')
    parseAiProviderSecretKeyring(await existing.readFile({ encoding: 'utf8' }))
  } finally {
    await existing.close()
  }
}

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

export async function provisionAiProviderSecretKeyring(
  { path },
  {
    linkFile = link,
    inspectPath = lstat,
    makeDirectory = mkdir,
    openFile = open,
    ownerUid = process.getuid?.(),
    removeFile = unlink,
  } = {},
) {
  const resolvedPath = resolve(path)
  await makeDirectory(dirname(resolvedPath), { mode: 0o700, recursive: true })
  await validateContainingDirectory(resolvedPath, { inspectPath, ownerUid })
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

  const temporary = await openFile(temporaryPath, 'wx', 0o600)
  try {
    await temporary.writeFile(document, { encoding: 'utf8' })
    await temporary.sync()
  } finally {
    await temporary.close()
  }

  try {
    await linkFile(temporaryPath, resolvedPath)
    return { created: true, path: resolvedPath }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      await validateExistingAiProviderSecretKeyring(resolvedPath, {
        inspectPath,
        openFile,
        ownerUid,
      })
      return { created: false, path: resolvedPath }
    }
    throw error
  } finally {
    await removeFile(temporaryPath).catch(() => undefined)
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
  provision = provisionAiProviderSecretKeyring,
} = {}) {
  const path = resolve(
    cwd,
    readPathArgument(argv) ?? defaultAiProviderSecretKeyringPath(env, cwd),
  )
  const result = await provision({ path })
  log(
    result.created
      ? `Created local AI provider-secret keyring at ${result.path}`
      : `Local AI provider-secret keyring already exists at ${result.path}`,
  )
  return result
}

/* v8 ignore start -- direct CLI orchestration is exercised through the exported runner */
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
/* v8 ignore stop */
