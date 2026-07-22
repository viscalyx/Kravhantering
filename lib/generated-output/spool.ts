import { createReadStream, type Dirent, type ReadStream } from 'node:fs'
import {
  type FileHandle,
  lstat,
  mkdtemp,
  open,
  readdir,
  rm,
  stat,
  statfs,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  GeneratedOutputError,
  type GeneratedOutputKind,
} from '@/lib/generated-output/errors'

const OWNED_DIRECTORY_PREFIX = 'kravhantering-output-'
const STALE_DIRECTORY_AGE_MS = (600 + 5 * 60) * 1000
const startupCleanupByBase = new Map<string, Promise<void>>()
let reservedBytes = 0
const activeGeneration: Record<GeneratedOutputKind, number> = { csv: 0, pdf: 0 }

export interface GeneratedOutputAdmissionOptions {
  concurrencyLimit: number
  maxFileBytes: number
  output: GeneratedOutputKind
}

export interface GeneratedOutputSpool {
  directoryPath: string
  filePath: string
  releaseGeneration: () => void
  releaseSpool: () => Promise<void>
}

export interface GeneratedOutputStreamLifecycle {
  onCancel?: () => void
  onComplete?: () => void
  onError?: () => void
}

export class BoundedGeneratedOutputWriter {
  readonly output: GeneratedOutputKind
  readonly maxBytes: number
  #byteCount = 0
  #closed = false
  #file: FileHandle

  private constructor(
    file: FileHandle,
    maxBytes: number,
    output: GeneratedOutputKind,
  ) {
    this.#file = file
    this.maxBytes = maxBytes
    this.output = output
  }

  static async open(
    filePath: string,
    maxBytes: number,
    output: GeneratedOutputKind,
  ): Promise<BoundedGeneratedOutputWriter> {
    const file = await open(filePath, 'w', 0o600)
    return new BoundedGeneratedOutputWriter(file, maxBytes, output)
  }

  get byteCount(): number {
    return this.#byteCount
  }

  async write(chunk: string | Uint8Array): Promise<void> {
    if (this.#closed) throw new Error('Generated-output writer is closed')
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    if (this.#byteCount + bytes.byteLength > this.maxBytes) {
      throw new GeneratedOutputError(
        'output_limit_exceeded',
        'byte_limit_exceeded',
        {
          limit: this.maxBytes,
          limitKind: 'bytes',
          output: this.output,
        },
      )
    }
    try {
      await this.#file.write(bytes)
      this.#byteCount += bytes.byteLength
    } catch (error) {
      if (isStorageCapacityError(error)) {
        throw temporaryStorageError(this.output, error)
      }
      throw error
    }
  }

  async close(): Promise<number> {
    if (this.#closed) return this.#byteCount
    this.#closed = true
    try {
      await this.#file.sync()
    } finally {
      await this.#file.close()
    }
    return this.#byteCount
  }
}

export function resolveGeneratedOutputTempDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.KRAVHANTERING_EXPORT_TEMP_DIR?.trim()
  if (!explicit) return tmpdir()
  if (!isAbsolute(explicit)) {
    throw new Error(
      'Configured generated-output temporary directory is invalid',
    )
  }
  return explicit
}

export async function probeGeneratedOutputTempDirectory(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const basePath = resolveGeneratedOutputTempDirectory(env)
  const base = await stat(basePath)
  if (!base.isDirectory()) {
    throw new Error('Generated-output temporary storage is not a directory')
  }
  const directoryPath = await mkdtemp(join(basePath, OWNED_DIRECTORY_PREFIX))
  const filePath = join(directoryPath, 'probe')
  try {
    const file = await open(filePath, 'wx', 0o600)
    await file.writeFile('ready')
    await file.close()
  } finally {
    await rm(directoryPath, { force: true, recursive: true })
  }
}

export async function acquireGeneratedOutputSpool(
  options: GeneratedOutputAdmissionOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GeneratedOutputSpool> {
  if (activeGeneration[options.output] >= options.concurrencyLimit) {
    throw new GeneratedOutputError('capacity_busy', 'concurrency_limit', {
      output: options.output,
      retryAfterSeconds: 5,
    })
  }
  activeGeneration[options.output] += 1
  let generationReleased = false
  let reservationHeld = false
  let directoryPath: string | undefined

  const releaseGeneration = (): void => {
    if (generationReleased) return
    generationReleased = true
    activeGeneration[options.output] = Math.max(
      0,
      activeGeneration[options.output] - 1,
    )
  }

  try {
    const basePath = resolveGeneratedOutputTempDirectory(env)
    await ensureStartupCleanup(basePath)
    const filesystem = await statfs(basePath, { bigint: true })
    const freeBytes = filesystem.bavail * filesystem.bsize
    const availableAfterReservations = freeBytes - BigInt(reservedBytes)
    if (availableAfterReservations < BigInt(options.maxFileBytes)) {
      throw temporaryStorageError(options.output)
    }
    reservedBytes += options.maxFileBytes
    reservationHeld = true

    directoryPath = await mkdtemp(join(basePath, OWNED_DIRECTORY_PREFIX))
    await assertMode(directoryPath, 0o700)
    const filePath = join(directoryPath, 'output')
    const file = await open(filePath, 'wx', 0o600)
    await file.close()
    await assertMode(filePath, 0o600)
    const ownedDirectoryPath = directoryPath

    let spoolReleased = false
    return {
      directoryPath: ownedDirectoryPath,
      filePath,
      releaseGeneration,
      releaseSpool: async () => {
        if (spoolReleased) return
        spoolReleased = true
        if (reservationHeld) {
          reservationHeld = false
          reservedBytes = Math.max(0, reservedBytes - options.maxFileBytes)
        }
        await rm(ownedDirectoryPath, { force: true, recursive: true })
      },
    }
  } catch (error) {
    releaseGeneration()
    if (reservationHeld) {
      reservedBytes = Math.max(0, reservedBytes - options.maxFileBytes)
    }
    if (directoryPath) {
      await rm(directoryPath, { force: true, recursive: true }).catch(() => {})
    }
    if (error instanceof GeneratedOutputError) throw error
    throw temporaryStorageError(options.output, error)
  }
}

export async function createGeneratedOutputFileResponse(
  spool: GeneratedOutputSpool,
  headers: HeadersInit,
  lifecycle: GeneratedOutputStreamLifecycle = {},
): Promise<Response> {
  const file = await stat(spool.filePath)
  if (!file.isFile() || file.size <= 0) {
    throw new Error('Generated output file is empty or missing')
  }
  spool.releaseGeneration()

  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set('Content-Length', String(file.size))
  responseHeaders.set('X-Accel-Buffering', 'no')

  return new Response(
    cleanupFileStream(
      createReadStream(spool.filePath),
      spool.releaseSpool,
      lifecycle,
    ),
    { headers: responseHeaders },
  )
}

export async function writeBoundedFile(
  filePath: string,
  chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
  maxBytes: number,
  output: GeneratedOutputKind,
  signal?: AbortSignal,
): Promise<number> {
  const file = await open(filePath, 'w', 0o600)
  let byteCount = 0
  try {
    for await (const chunk of chunks) {
      if (signal?.aborted) throw signal.reason
      const bytes =
        typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      if (byteCount + bytes.byteLength > maxBytes) {
        throw new GeneratedOutputError(
          'output_limit_exceeded',
          'byte_limit_exceeded',
          { limit: maxBytes, limitKind: 'bytes', output },
        )
      }
      await file.write(bytes)
      byteCount += bytes.byteLength
    }
    await file.sync()
    return byteCount
  } catch (error) {
    if (isStorageCapacityError(error)) {
      throw temporaryStorageError(output, error)
    }
    throw error
  } finally {
    await file.close()
  }
}

export async function cleanupStaleGeneratedOutputDirectories(
  basePath: string,
  now = Date.now(),
): Promise<void> {
  const entries = await readdir(basePath, { withFileTypes: true })
  await Promise.all(
    entries.filter(isOwnedDirectory).map(async entry => {
      const path = join(basePath, entry.name)
      const metadata = await lstat(path)
      if (now - metadata.mtimeMs <= STALE_DIRECTORY_AGE_MS) return
      await rm(path, { force: true, recursive: true })
    }),
  )
}

export function generatedOutputCapacitySnapshot(): {
  activeCsv: number
  activePdf: number
  reservedBytes: number
} {
  return {
    activeCsv: activeGeneration.csv,
    activePdf: activeGeneration.pdf,
    reservedBytes,
  }
}

function ensureStartupCleanup(basePath: string): Promise<void> {
  let cleanup = startupCleanupByBase.get(basePath)
  if (!cleanup) {
    cleanup = cleanupStaleGeneratedOutputDirectories(basePath).catch(error => {
      console.warn('[generated-output] stale cleanup failed', {
        error: error instanceof Error ? error.name : 'Error',
      })
    })
    startupCleanupByBase.set(basePath, cleanup)
  }
  return cleanup
}

function cleanupFileStream(
  source: ReadStream,
  cleanup: () => Promise<void>,
  lifecycle: GeneratedOutputStreamLifecycle,
): ReadableStream<Uint8Array> {
  let cleaned = false
  const cleanupOnce = async (): Promise<void> => {
    if (cleaned) return
    cleaned = true
    await cleanup()
  }

  return new ReadableStream<Uint8Array>({
    cancel: async reason => {
      source.destroy(
        reason instanceof Error ? reason : new Error('Client cancelled'),
      )
      lifecycle.onCancel?.()
      await cleanupOnce()
    },
    start(controller) {
      source.on('data', chunk => {
        controller.enqueue(
          typeof chunk === 'string'
            ? Buffer.from(chunk)
            : new Uint8Array(chunk),
        )
        source.pause()
      })
      source.once('end', () => {
        lifecycle.onComplete?.()
        void cleanupOnce()
          .catch(() => {})
          .then(() => controller.close())
      })
      source.once('error', error => {
        controller.error(error)
        lifecycle.onError?.()
        void cleanupOnce().catch(() => {})
      })
    },
    pull() {
      source.resume()
    },
  })
}

async function assertMode(path: string, expectedMode: number): Promise<void> {
  const metadata = await stat(path)
  if ((metadata.mode & 0o777) !== expectedMode) {
    throw new Error('Generated-output temporary storage has unsafe mode')
  }
}

function isOwnedDirectory(entry: Dirent): boolean {
  return entry.isDirectory() && entry.name.startsWith(OWNED_DIRECTORY_PREFIX)
}

function isStorageCapacityError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'ENOSPC' || error.code === 'EFBIG'
}

function temporaryStorageError(
  output: GeneratedOutputKind,
  cause?: unknown,
): GeneratedOutputError {
  return new GeneratedOutputError(
    'temporary_storage_unavailable',
    'temporary_storage_unavailable',
    { output },
    { cause },
  )
}
