import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_HASH_OUTPUT_PATH = 'hashes.sha256'
export const DEFAULT_HASHED_FILES = [
  'container-stack.lock.json',
  'container-stack.compose.yml',
  'container-status.txt',
  'container-status.json',
  'public/build.json',
]

const USAGE = `Usage:
  node scripts/containers/write-hashes.mjs [--output hashes.sha256] [file ...]`

function isSensitivePath(filePath) {
  return (
    /\.env(?:\.[^.]+)?\.local$/u.test(filePath) ||
    /\.key$/u.test(filePath) ||
    filePath.includes('container-tls')
  )
}

function assertPathInsideCwd(cwd, absolutePath, originalPath) {
  const relativeToCwd = path.relative(cwd, absolutePath)
  if (
    relativeToCwd === '..' ||
    relativeToCwd.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToCwd)
  ) {
    throw new Error(`Refusing to hash file outside workspace: ${originalPath}`)
  }
}

export function hashFileContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function buildHashLines(files, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const fsImpl = options.fsImpl ?? fs
  const lines = []

  for (const file of files) {
    const relativePath = path.normalize(file)
    if (isSensitivePath(relativePath)) {
      throw new Error(`Refusing to hash sensitive runtime file: ${file}`)
    }

    const absolutePath = path.resolve(cwd, relativePath)
    assertPathInsideCwd(cwd, absolutePath, file)
    if (!fsImpl.existsSync(absolutePath)) continue

    const hash = hashFileContent(fsImpl.readFileSync(absolutePath))
    lines.push(`${hash}  ${relativePath.replaceAll(path.sep, '/')}`)
  }

  return lines
}

export function parseArgs(args) {
  const files = []
  let output = DEFAULT_HASH_OUTPUT_PATH

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--output') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --output.')
      }
      output = value
      index += 1
      continue
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    files.push(arg)
  }

  return {
    files: files.length > 0 ? files : DEFAULT_HASHED_FILES,
    output,
  }
}

export function writeHashes(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const output = options.output ?? DEFAULT_HASH_OUTPUT_PATH
  const lines = buildHashLines(options.files ?? DEFAULT_HASHED_FILES, {
    cwd,
    fsImpl,
  })
  const outputPath = path.resolve(cwd, output)
  fsImpl.writeFileSync(
    outputPath,
    `${lines.join('\n')}${lines.length ? '\n' : ''}`,
  )
  return { lines, outputPath }
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const parsed = parseArgs(args)
    const result = writeHashes({
      cwd: dependencies.cwd,
      files: parsed.files,
      fsImpl: dependencies.fsImpl,
      output: parsed.output,
    })
    consoleObj.log(
      `Wrote ${path.relative(dependencies.cwd ?? process.cwd(), result.outputPath)}`,
    )
    return 0
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
