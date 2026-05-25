import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertStackLockSchema,
  DEFAULT_STACK_LOCK_PATH,
  findService,
} from './generate-stack-lock.mjs'

export const DEFAULT_OCI_OUTPUT_DIR = 'tmp/container-oci-archives'
export const DEFAULT_OCI_VERIFY_ROOT = '/tmp/kh-oci-verify'
export const DEFAULT_PODMAN_STORAGE_DRIVER = 'vfs'
export const MAX_PODMAN_RUNROOT_LENGTH = 50
export const PROJECT_ARCHIVE_SERVICES = ['app-runtime', 'db-job']

const USAGE = `Usage:
  node scripts/containers/export-oci-archives.mjs export [--lock-file <path>] [--output-dir <path>]
  node scripts/containers/export-oci-archives.mjs verify [--lock-file <path>] [--output-dir <path>] [--verify-root <path>]`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readJsonFile(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
}

function normalizeImageId(value) {
  const imageId = readNonEmpty(value)
  if (!imageId) return undefined
  return imageId.startsWith('sha256:') ? imageId : `sha256:${imageId}`
}

function requireServiceImageId(serviceName, service) {
  const imageId = readNonEmpty(service.imageId)
  if (!imageId) {
    throw new Error(
      `container-stack.lock.json service "${serviceName}" is missing imageId.`,
    )
  }
  return normalizeImageId(imageId)
}

export function parseArgs(args) {
  const [command = '', ...rest] = args
  const options = {}

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  return {
    command,
    lockFile: readNonEmpty(options['lock-file']) ?? DEFAULT_STACK_LOCK_PATH,
    outputDir: readNonEmpty(options['output-dir']) ?? DEFAULT_OCI_OUTPUT_DIR,
    verifyRoot: readNonEmpty(options['verify-root']),
  }
}

export function imageReference(service) {
  if (!service?.image || !service.tag) {
    throw new Error(
      `Service "${service?.name ?? 'unknown'}" is missing image or tag.`,
    )
  }
  return `${service.image}:${service.tag}`
}

export function archiveFileName(serviceName) {
  return `${serviceName}.oci.tar.gz`
}

export function buildArchivePlans(stackLock, outputDir) {
  assertStackLockSchema(stackLock)
  return PROJECT_ARCHIVE_SERVICES.map(serviceName => {
    const service = findService(stackLock, serviceName)
    if (!service) {
      throw new Error(`container-stack.lock.json is missing "${serviceName}".`)
    }

    return {
      archivePath: path.join(outputDir, archiveFileName(serviceName)),
      imageId: requireServiceImageId(serviceName, service),
      imageRef: imageReference(service),
      rawArchivePath: path.join(outputDir, `${serviceName}.oci.tar`),
      serviceName,
    }
  })
}

function podmanEnv(options = {}) {
  return {
    ...process.env,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? DEFAULT_PODMAN_STORAGE_DRIVER,
    ...options.env,
  }
}

function runPodman(args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  const result = spawnSync('podman', args, {
    cwd: options.cwd,
    env: podmanEnv(options),
    stdio: options.stdio ?? 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`podman ${args.join(' ')} failed with ${result.status}`)
  }
  return result
}

function runCommand(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: podmanEnv(options),
    stdio: options.stdio ?? 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`)
  }
  return result
}

function execPodman(args, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync('podman', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: podmanEnv(options),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function exportOciArchives(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lockFile = options.lockFile ?? DEFAULT_STACK_LOCK_PATH
  const outputDir = options.outputDir ?? DEFAULT_OCI_OUTPUT_DIR
  const stackLock = readJsonFile(path.resolve(cwd, lockFile), fsImpl)
  const plans = buildArchivePlans(stackLock, outputDir)

  fsImpl.mkdirSync(path.resolve(cwd, outputDir), { recursive: true })
  for (const plan of plans) {
    runPodman(
      [
        'save',
        '--format',
        'oci-archive',
        '--output',
        plan.rawArchivePath,
        plan.imageRef,
      ],
      options,
    )
    runCommand('gzip', ['--force', '--best', plan.rawArchivePath], options)
  }

  return plans
}

function createVerifyWorkspace(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const requestedVerifyRoot = readNonEmpty(options.verifyRoot)
  const baseDir = requestedVerifyRoot
    ? path.resolve(cwd, requestedVerifyRoot)
    : createTemporaryVerifyWorkspace(cwd, fsImpl)
  const root = path.join(baseDir, 'root')
  const runroot = path.join(baseDir, 'run')
  validateRunrootLength(runroot)
  fsImpl.mkdirSync(root, { recursive: true })
  fsImpl.mkdirSync(runroot, { recursive: true })
  return {
    baseDir,
    created: !requestedVerifyRoot,
    podmanGlobalArgs: ['--root', root, '--runroot', runroot],
  }
}

function createTemporaryVerifyWorkspace(cwd, fsImpl) {
  const parentDir = path.resolve(cwd, DEFAULT_OCI_VERIFY_ROOT)
  fsImpl.mkdirSync(parentDir, { recursive: true })
  return fsImpl.mkdtempSync(path.join(parentDir, 'verify-'))
}

function validateRunrootLength(runroot) {
  if (runroot.length <= MAX_PODMAN_RUNROOT_LENGTH) return
  throw new Error(
    `OCI verification runroot path is ${runroot.length} characters, but Podman requires ${MAX_PODMAN_RUNROOT_LENGTH} or fewer. Pass --verify-root /tmp/kh-oci-verify or another shorter path.`,
  )
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function writeInfo(consoleObj, message) {
  const writer =
    typeof consoleObj.info === 'function' ? consoleObj.info : consoleObj.log
  if (typeof writer === 'function') {
    writer.call(consoleObj, message)
  }
}

function removeTemporaryVerifyWorkspace(
  workspace,
  fsImpl,
  consoleObj = console,
) {
  try {
    fsImpl.rmSync(workspace.baseDir, { force: true, recursive: true })
  } catch (error) {
    writeInfo(
      consoleObj,
      `Ignoring OCI verification store cleanup failure for ${workspace.baseDir}: ${formatErrorMessage(error)}. Podman may leave rootless storage files that Node cannot remove; the archive verification result is preserved.`,
    )
  }
}

export function verifyOciArchives(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lockFile = options.lockFile ?? DEFAULT_STACK_LOCK_PATH
  const outputDir = options.outputDir ?? DEFAULT_OCI_OUTPUT_DIR
  const stackLock = readJsonFile(path.resolve(cwd, lockFile), fsImpl)
  const plans = buildArchivePlans(stackLock, outputDir)
  const results = []

  for (const plan of plans) {
    const absoluteArchivePath = path.resolve(cwd, plan.archivePath)
    if (!fsImpl.existsSync(absoluteArchivePath)) {
      throw new Error(
        `Missing OCI archive for ${plan.serviceName}: ${plan.archivePath}`,
      )
    }

    const workspace = createVerifyWorkspace(options)
    try {
      runPodman(
        [...workspace.podmanGlobalArgs, 'load', '--input', plan.archivePath],
        options,
      )
      const actualImageId = normalizeImageId(
        execPodman(
          [
            ...workspace.podmanGlobalArgs,
            'image',
            'inspect',
            plan.imageRef,
            '--format',
            '{{.Id}}',
          ],
          options,
        ),
      )

      if (actualImageId !== plan.imageId) {
        throw new Error(
          `${plan.serviceName} OCI archive image ID ${actualImageId} does not match ${plan.imageId}.`,
        )
      }
      results.push({ ...plan, actualImageId })
    } finally {
      if (workspace.created) {
        removeTemporaryVerifyWorkspace(workspace, fsImpl, options.consoleObj)
      }
    }
  }

  return results
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const cwd = dependencies.cwd ?? process.cwd()

  try {
    const parsed = parseArgs(args)
    if (parsed.command === 'export') {
      const plans = exportOciArchives({
        ...dependencies,
        cwd,
        lockFile: parsed.lockFile,
        outputDir: parsed.outputDir,
      })
      for (const plan of plans) {
        consoleObj.log(`Wrote ${plan.archivePath}`)
      }
      return 0
    }

    if (parsed.command === 'verify') {
      const results = verifyOciArchives({
        ...dependencies,
        cwd,
        lockFile: parsed.lockFile,
        outputDir: parsed.outputDir,
        verifyRoot: parsed.verifyRoot,
      })
      for (const result of results) {
        consoleObj.log(`Verified ${result.archivePath}`)
      }
      return 0
    }

    consoleObj.error(USAGE)
    return 1
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : String(error))
    consoleObj.error(USAGE)
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2))
}
