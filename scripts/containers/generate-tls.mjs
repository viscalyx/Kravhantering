import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_TLS_DIR = 'tmp/container-tls'
export const DEFAULT_HOSTNAME = 'kravhantering.test'
export const CERTIFICATE_PROFILE = Object.freeze({
  STANDARD: 'standard',
  SQL_SERVER: 'sql-server',
})
const SAFE_HOSTNAME_PATTERN = /^[A-Za-z0-9._-]+$/u

const USAGE = `Usage:
  node scripts/containers/generate-tls.mjs [options]

Options:
  --hostname <host>   Certificate DNS name (default kravhantering.test)
  --output-dir <dir>  Directory for generated TLS files
  --ca-cert <path>    Reuse this CA certificate to issue one server certificate
  --ca-key <path>     Reuse this CA key to issue one server certificate
  --file-stem <name>  Output file stem when reusing a CA (default hostname)`

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

  const caCert = readNonEmpty(options['ca-cert'])
  const caKey = readNonEmpty(options['ca-key'])
  if ((caCert && !caKey) || (!caCert && caKey)) {
    throw new Error('--ca-cert and --ca-key must be provided together.')
  }

  const hostname = sanitizeHostname(
    readNonEmpty(options.hostname) ?? DEFAULT_HOSTNAME,
  )
  const parsed = {
    hostname,
    outputDir: readNonEmpty(options['output-dir']) ?? DEFAULT_TLS_DIR,
  }
  if (caCert && caKey) {
    parsed.caCert = caCert
    parsed.caKey = caKey
    parsed.fileStem = sanitizeHostname(
      readNonEmpty(options['file-stem']) ?? hostname,
    )
  }
  return parsed
}

export function serverCertificateFilePlan(
  outputDir,
  hostname,
  fileStem = hostname,
) {
  const sanitizedHostname = sanitizeHostname(hostname)
  const sanitizedFileStem = sanitizeHostname(fileStem)
  return {
    csr: path.join(outputDir, `${sanitizedFileStem}.csr`),
    ext: path.join(outputDir, `${sanitizedFileStem}.ext`),
    hostname: sanitizedHostname,
    serverCert: path.join(outputDir, `${sanitizedFileStem}.crt`),
    serverKey: path.join(outputDir, `${sanitizedFileStem}.key`),
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
    sqlServerCert: path.join(outputDir, 'sqlserver.crt'),
    sqlServerCsr: path.join(outputDir, 'sqlserver.csr'),
    sqlServerExt: path.join(outputDir, 'sqlserver.ext'),
    sqlServerKey: path.join(outputDir, 'sqlserver.key'),
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
    [
      'openssl',
      [
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=sqlserver',
        '-keyout',
        files.sqlServerKey,
        '-out',
        files.sqlServerCsr,
      ],
    ],
    [
      'openssl',
      [
        'x509',
        '-req',
        '-in',
        files.sqlServerCsr,
        '-CA',
        files.caCert,
        '-CAkey',
        files.caKey,
        '-CAcreateserial',
        '-out',
        files.sqlServerCert,
        '-days',
        '7',
        '-sha256',
        '-extfile',
        files.sqlServerExt,
      ],
    ],
  ]
}

export function writeOpenSslExtFile(
  filePath,
  hostname,
  fsImpl = fs,
  profile = CERTIFICATE_PROFILE.STANDARD,
) {
  const sanitizedHostname = sanitizeHostname(hostname)
  const keyUsageLine =
    profile === CERTIFICATE_PROFILE.SQL_SERVER
      ? 'keyUsage=critical,digitalSignature,keyEncipherment\n'
      : ''
  fsImpl.writeFileSync(
    filePath,
    `subjectAltName=DNS:${sanitizedHostname}\n${keyUsageLine}extendedKeyUsage=serverAuth\n`,
  )
}

export function generateServerCertificate(options) {
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const hostname = sanitizeHostname(options.hostname)
  const outputDir = options.outputDir ?? DEFAULT_TLS_DIR
  const caCert = readNonEmpty(options.caCert)
  const caKey = readNonEmpty(options.caKey)
  if (!caCert || !caKey) {
    throw new Error('A CA certificate and key are required for issuance.')
  }
  const files = serverCertificateFilePlan(
    outputDir,
    hostname,
    options.fileStem ?? hostname,
  )

  fsImpl.mkdirSync(outputDir, { recursive: true })
  writeOpenSslExtFile(
    files.ext,
    hostname,
    fsImpl,
    options.profile ?? CERTIFICATE_PROFILE.STANDARD,
  )
  const commands = [
    [
      'openssl',
      [
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        `/CN=${hostname}`,
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
        caCert,
        '-CAkey',
        caKey,
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
  for (const [command, args] of commands) {
    execFileSync(command, args, { stdio: 'inherit' })
  }
  return files
}

export function generateTlsFiles(options = {}) {
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const hostname = sanitizeHostname(options.hostname)
  const outputDir = options.outputDir ?? DEFAULT_TLS_DIR
  const files = tlsFilePlan(outputDir, hostname)

  fsImpl.mkdirSync(outputDir, { recursive: true })
  writeOpenSslExtFile(files.ext, hostname, fsImpl)
  writeOpenSslExtFile(
    files.sqlServerExt,
    'sqlserver',
    fsImpl,
    CERTIFICATE_PROFILE.SQL_SERVER,
  )

  for (const [command, args] of opensslCommandPlan(files, hostname)) {
    execFileSync(command, args, { stdio: 'inherit' })
  }

  return files
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const parsed = parseArgs(args)
    const generate = parsed.caCert
      ? generateServerCertificate
      : generateTlsFiles
    const files = generate({
      caCert: parsed.caCert,
      caKey: parsed.caKey,
      execFileSync: dependencies.execFileSync,
      fileStem: parsed.fileStem,
      fsImpl: dependencies.fsImpl,
      hostname: parsed.hostname,
      outputDir: parsed.outputDir,
      profile: parsed.caCert ? CERTIFICATE_PROFILE.SQL_SERVER : undefined,
    })
    if (files.caCert) consoleObj.log(`Wrote ${files.caCert}`)
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
