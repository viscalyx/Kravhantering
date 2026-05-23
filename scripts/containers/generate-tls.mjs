import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_TLS_DIR = 'tmp/container-tls'
export const DEFAULT_HOSTNAME = 'kravhantering.test'
const SAFE_HOSTNAME_PATTERN = /^[A-Za-z0-9._-]+$/u

const USAGE = `Usage:
  node scripts/containers/generate-tls.mjs [options]

Options:
  --hostname <host>   Certificate DNS name (default kravhantering.test)
  --output-dir <dir>  Directory for generated TLS files`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function sanitizeHostname(value = DEFAULT_HOSTNAME) {
  const hostname = readNonEmpty(value) ?? DEFAULT_HOSTNAME
  if (
    !SAFE_HOSTNAME_PATTERN.test(hostname) ||
    hostname.includes('/') ||
    hostname.includes('\\') ||
    hostname.includes('..')
  ) {
    throw new Error(
      `Invalid TLS hostname "${hostname}". Use only letters, numbers, dots, hyphens, and underscores, without path separators or "..".`,
    )
  }
  return hostname
}

export function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  return {
    hostname: sanitizeHostname(
      readNonEmpty(options.hostname) ?? DEFAULT_HOSTNAME,
    ),
    outputDir: readNonEmpty(options['output-dir']) ?? DEFAULT_TLS_DIR,
  }
}

export function tlsFilePlan(outputDir, hostname = DEFAULT_HOSTNAME) {
  const sanitizedHostname = sanitizeHostname(hostname)
  return {
    caCert: path.join(outputDir, 'ca.crt'),
    caKey: path.join(outputDir, 'ca.key'),
    csr: path.join(outputDir, `${sanitizedHostname}.csr`),
    ext: path.join(outputDir, `${sanitizedHostname}.ext`),
    serverCert: path.join(outputDir, `${sanitizedHostname}.crt`),
    serverKey: path.join(outputDir, `${sanitizedHostname}.key`),
  }
}

export function opensslCommandPlan(files, hostname = DEFAULT_HOSTNAME) {
  const sanitizedHostname = sanitizeHostname(hostname)
  return [
    [
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:4096',
        '-sha256',
        '-days',
        '7',
        '-nodes',
        '-subj',
        `/CN=${sanitizedHostname} local CA`,
        '-keyout',
        files.caKey,
        '-out',
        files.caCert,
      ],
    ],
    [
      'openssl',
      [
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        `/CN=${sanitizedHostname}`,
        '-keyout',
        files.serverKey,
        '-out',
        files.csr,
      ],
    ],
    [
      'openssl',
      [
        'x509',
        '-req',
        '-in',
        files.csr,
        '-CA',
        files.caCert,
        '-CAkey',
        files.caKey,
        '-CAcreateserial',
        '-out',
        files.serverCert,
        '-days',
        '7',
        '-sha256',
        '-extfile',
        files.ext,
      ],
    ],
  ]
}

export function writeOpenSslExtFile(filePath, hostname, fsImpl = fs) {
  const sanitizedHostname = sanitizeHostname(hostname)
  fsImpl.writeFileSync(
    filePath,
    `subjectAltName=DNS:${sanitizedHostname}\nextendedKeyUsage=serverAuth\n`,
  )
}

export function generateTlsFiles(options = {}) {
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const hostname = sanitizeHostname(options.hostname)
  const outputDir = options.outputDir ?? DEFAULT_TLS_DIR
  const files = tlsFilePlan(outputDir, hostname)

  fsImpl.mkdirSync(outputDir, { recursive: true })
  writeOpenSslExtFile(files.ext, hostname, fsImpl)

  for (const [command, args] of opensslCommandPlan(files, hostname)) {
    execFileSync(command, args, { stdio: 'inherit' })
  }

  return files
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const parsed = parseArgs(args)
    const files = generateTlsFiles({
      execFileSync: dependencies.execFileSync,
      fsImpl: dependencies.fsImpl,
      hostname: parsed.hostname,
      outputDir: parsed.outputDir,
    })
    consoleObj.log(`Wrote ${files.caCert}`)
    consoleObj.log(`Wrote ${files.serverCert}`)
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
