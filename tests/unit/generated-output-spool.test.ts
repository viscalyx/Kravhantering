import {
  access,
  mkdir,
  mkdtemp,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import {
  acquireGeneratedOutputSpool,
  BoundedGeneratedOutputWriter,
  cleanupStaleGeneratedOutputDirectories,
  createGeneratedOutputFileResponse,
  generatedOutputCapacitySnapshot,
  probeGeneratedOutputTempDirectory,
  resolveGeneratedOutputTempDirectory,
} from '@/lib/generated-output/spool'

const roots: string[] = []
const testEnv = (root: string): NodeJS.ProcessEnv => ({
  KRAVHANTERING_EXPORT_TEMP_DIR: root,
  NODE_ENV: 'test',
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'generated-output-test-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(
    roots.splice(0).map(root => rm(root, { force: true, recursive: true })),
  )
})

describe('generated output spool', () => {
  it('uses the operating-system temporary directory when unset or blank', () => {
    expect(resolveGeneratedOutputTempDirectory({ NODE_ENV: 'test' })).toBe(
      tmpdir(),
    )
    expect(
      resolveGeneratedOutputTempDirectory({
        KRAVHANTERING_EXPORT_TEMP_DIR: '  ',
        NODE_ENV: 'test',
      }),
    ).toBe(tmpdir())
  })

  it('requires an absolute configured root and probes create/write/remove', async () => {
    expect(() =>
      resolveGeneratedOutputTempDirectory({
        KRAVHANTERING_EXPORT_TEMP_DIR: 'relative',
        NODE_ENV: 'test',
      }),
    ).toThrow('temporary directory is invalid')

    const root = await temporaryRoot()
    await probeGeneratedOutputTempDirectory(testEnv(root))
    expect(await stat(root)).toMatchObject({})
    expect(generatedOutputCapacitySnapshot()).toMatchObject({
      activeCsv: 0,
      activePdf: 0,
      reservedBytes: 0,
    })
  })

  it('creates private entries and releases admission/reservation idempotently', async () => {
    const root = await temporaryRoot()
    const spool = await acquireGeneratedOutputSpool(
      {
        concurrencyLimit: 1,
        maxFileBytes: 1024,
        output: 'csv',
      },
      testEnv(root),
    )

    expect((await stat(spool.directoryPath)).mode & 0o777).toBe(0o700)
    expect((await stat(spool.filePath)).mode & 0o777).toBe(0o600)
    expect(generatedOutputCapacitySnapshot()).toMatchObject({
      activeCsv: 1,
      reservedBytes: 1024,
    })
    await expect(
      acquireGeneratedOutputSpool(
        {
          concurrencyLimit: 1,
          maxFileBytes: 1024,
          output: 'csv',
        },
        testEnv(root),
      ),
    ).rejects.toMatchObject({
      code: 'capacity_busy',
      details: { output: 'csv', retryAfterSeconds: 5 },
    })

    spool.releaseGeneration()
    spool.releaseGeneration()
    await spool.releaseSpool()
    await spool.releaseSpool()
    expect(generatedOutputCapacitySnapshot()).toMatchObject({
      activeCsv: 0,
      reservedBytes: 0,
    })
  })

  it('bounds bytes before a partial oversized write', async () => {
    const root = await temporaryRoot()
    const filePath = join(root, 'bounded')
    const writer = await BoundedGeneratedOutputWriter.open(filePath, 4, 'csv')
    await writer.write('å')
    await expect(writer.write('abc')).rejects.toMatchObject({
      capacityReason: 'byte_limit_exceeded',
      code: 'output_limit_exceeded',
      details: { limit: 4, limitKind: 'bytes', output: 'csv' },
    })
    expect(writer.byteCount).toBe(2)
    await expect(writer.close()).resolves.toBe(2)
  })

  it('streams an exact-length no-store response and cleans up after transfer', async () => {
    const root = await temporaryRoot()
    const spool = await acquireGeneratedOutputSpool(
      {
        concurrencyLimit: 1,
        maxFileBytes: 1024,
        output: 'pdf',
      },
      testEnv(root),
    )
    await writeFile(spool.filePath, '%PDF')
    let completed = 0
    const response = await createGeneratedOutputFileResponse(
      spool,
      { 'Content-Type': 'application/pdf' },
      { onComplete: () => completed++ },
    )

    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
    expect(await response.text()).toBe('%PDF')
    await new Promise(resolve => setImmediate(resolve))
    expect(completed).toBe(1)
    await expect(access(spool.directoryPath)).rejects.toThrow()
  })

  it('cleans the spool and reports cancellation once', async () => {
    const root = await temporaryRoot()
    const spool = await acquireGeneratedOutputSpool(
      {
        concurrencyLimit: 1,
        maxFileBytes: 1024,
        output: 'pdf',
      },
      testEnv(root),
    )
    await writeFile(spool.filePath, '%PDF data')
    let cancelled = 0
    const response = await createGeneratedOutputFileResponse(
      spool,
      {},
      { onCancel: () => cancelled++ },
    )
    await response.body?.cancel()

    expect(cancelled).toBe(1)
    await expect(access(spool.directoryPath)).rejects.toThrow()
  })

  it('removes only stale owned directories', async () => {
    const root = await temporaryRoot()
    const oldOwned = join(root, 'kravhantering-output-old')
    const freshOwned = join(root, 'kravhantering-output-fresh')
    const unrelated = join(root, 'other-old')
    await Promise.all([mkdir(oldOwned), mkdir(freshOwned), mkdir(unrelated)])
    const now = Date.now()
    const old = new Date(now - 16 * 60 * 1000)
    await Promise.all([utimes(oldOwned, old, old), utimes(unrelated, old, old)])

    await cleanupStaleGeneratedOutputDirectories(root, now)

    await expect(access(oldOwned)).rejects.toThrow()
    await expect(access(freshOwned)).resolves.toBeUndefined()
    await expect(access(unrelated)).resolves.toBeUndefined()
  })

  it('fails before creating output when logical disk reservation is unavailable', async () => {
    const root = await temporaryRoot()
    await expect(
      acquireGeneratedOutputSpool(
        {
          concurrencyLimit: 1,
          maxFileBytes: Number.MAX_SAFE_INTEGER,
          output: 'csv',
        },
        testEnv(root),
      ),
    ).rejects.toBeInstanceOf(GeneratedOutputError)
    expect(generatedOutputCapacitySnapshot()).toMatchObject({
      activeCsv: 0,
      reservedBytes: 0,
    })
  })
})
