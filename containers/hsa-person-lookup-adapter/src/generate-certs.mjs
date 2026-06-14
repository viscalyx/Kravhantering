import { execFile } from 'node:child_process'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_OUTPUT_DIR = '/run/hsa-mtls'
const DEFAULT_CLIENT_SERIAL_NUMBER = 'SE5560000000-MOCK001'
const DEFAULT_SERVER_DNS = 'hsa-directory-mock'

function readString(name, fallback = undefined, env = process.env) {
  const value = env[name]?.trim()
  return value || fallback
}

async function openssl(args, options = {}) {
  await execFileAsync('openssl', args, {
    maxBuffer: 1024 * 1024,
    ...options,
  })
}

export async function generateClientCertificate({
  caCert,
  caKey,
  clientSerialNumber,
  commonName = 'HSA Person Lookup Adapter',
  name = 'client',
  outputDir,
} = {}) {
  const clientKey = path.join(outputDir, `${name}.key`)
  const clientCsr = path.join(outputDir, `${name}.csr`)
  const clientCert = path.join(outputDir, `${name}.crt`)
  const clientExt = path.join(outputDir, `${name}.ext`)
  const subjectSerial = clientSerialNumber
    ? `/serialNumber=${clientSerialNumber}`
    : ''

  await openssl(['genrsa', '-out', clientKey, '2048'])
  await openssl([
    'req',
    '-new',
    '-key',
    clientKey,
    '-subj',
    `/C=SE/O=Kravhantering Test/CN=${commonName}${subjectSerial}`,
    '-out',
    clientCsr,
  ])
  await writeFile(clientExt, ['extendedKeyUsage=clientAuth', ''].join('\n'))
  await openssl([
    'x509',
    '-req',
    '-in',
    clientCsr,
    '-CA',
    caCert,
    '-CAkey',
    caKey,
    '-CAcreateserial',
    '-out',
    clientCert,
    '-days',
    '3650',
    '-sha256',
    '-extfile',
    clientExt,
  ])
  for (const file of [clientCert, clientKey]) {
    await chmod(file, 0o644)
  }

  return { clientCert, clientKey }
}

export async function generateCertificates({
  clientSerialNumber = readString(
    'HSA_MTLS_CLIENT_SERIAL_NUMBER',
    DEFAULT_CLIENT_SERIAL_NUMBER,
  ),
  outputDir = readString('HSA_MTLS_CERT_DIR', DEFAULT_OUTPUT_DIR),
  serverDns = readString('HSA_MTLS_SERVER_DNS', DEFAULT_SERVER_DNS),
} = {}) {
  await mkdir(outputDir, { recursive: true })
  const caKey = path.join(outputDir, 'ca.key')
  const caCert = path.join(outputDir, 'ca.crt')
  const serverKey = path.join(outputDir, 'server.key')
  const serverCsr = path.join(outputDir, 'server.csr')
  const serverCert = path.join(outputDir, 'server.crt')
  const serverExt = path.join(outputDir, 'server.ext')
  await openssl(['genrsa', '-out', caKey, '4096'])
  await openssl([
    'req',
    '-x509',
    '-new',
    '-nodes',
    '-key',
    caKey,
    '-sha256',
    '-days',
    '3650',
    '-subj',
    '/C=SE/O=Kravhantering Test/CN=Kravhantering HSA Mock Test CA',
    '-out',
    caCert,
  ])

  await openssl(['genrsa', '-out', serverKey, '2048'])
  await openssl([
    'req',
    '-new',
    '-key',
    serverKey,
    '-subj',
    `/C=SE/O=Kravhantering Test/CN=${serverDns}`,
    '-out',
    serverCsr,
  ])
  await writeFile(
    serverExt,
    [
      'subjectAltName=DNS:hsa-directory-mock,DNS:localhost,IP:127.0.0.1',
      'extendedKeyUsage=serverAuth',
      '',
    ].join('\n'),
  )
  await openssl([
    'x509',
    '-req',
    '-in',
    serverCsr,
    '-CA',
    caCert,
    '-CAkey',
    caKey,
    '-CAcreateserial',
    '-out',
    serverCert,
    '-days',
    '3650',
    '-sha256',
    '-extfile',
    serverExt,
  ])

  const { clientCert, clientKey } = await generateClientCertificate({
    caCert,
    caKey,
    clientSerialNumber,
    outputDir,
  })

  for (const file of [caCert, serverCert, clientCert, serverKey, clientKey]) {
    await chmod(file, 0o644)
  }

  return {
    caCert,
    caKey,
    clientCert,
    clientKey,
    serverCert,
    serverKey,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await generateCertificates()
  console.log(JSON.stringify(result, null, 2))
}
