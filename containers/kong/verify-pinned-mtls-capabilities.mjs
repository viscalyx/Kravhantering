#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const lockPath = path.join(repositoryRoot, 'containers/kong/image.lock.json')
const probeImage =
  'localhost/kravhantering/hsa-mtls-provisioner:kong-capability-probe'

async function command(program, args, options = {}) {
  return execFileAsync(program, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DOCKER_CONFIG: probeState.dockerConfig },
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  })
}

async function openssl(args) {
  await command('openssl', args)
}

async function issueCa(directory, name) {
  const key = path.join(directory, `${name}-ca.key`)
  const certificate = path.join(directory, `${name}-ca.crt`)
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:4096',
    '-out',
    key,
  ])
  await openssl([
    'req',
    '-x509',
    '-new',
    '-key',
    key,
    '-sha256',
    '-days',
    '7',
    '-subj',
    `/CN=${name} probe CA`,
    '-addext',
    'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    certificate,
  ])
  return { certificate, key }
}

async function issueLeaf({ ca, directory, eku, keyUsage, name, san, subject }) {
  const key = path.join(directory, `${name}.key`)
  const request = path.join(directory, `${name}.csr`)
  const certificate = path.join(directory, `${name}.crt`)
  const extensions = path.join(directory, `${name}.ext`)
  const lines = [
    'basicConstraints=critical,CA:FALSE',
    `keyUsage=critical,${keyUsage}`,
    `extendedKeyUsage=${eku}`,
  ]
  if (san) lines.push(`subjectAltName=DNS:${san}`)
  await writeFile(extensions, `${lines.join('\n')}\n`)
  await openssl([
    'genpkey',
    '-algorithm',
    'RSA',
    '-pkeyopt',
    'rsa_keygen_bits:2048',
    '-out',
    key,
  ])
  await openssl(['req', '-new', '-key', key, '-subj', subject, '-out', request])
  await openssl([
    'x509',
    '-req',
    '-in',
    request,
    '-CA',
    ca.certificate,
    '-CAkey',
    ca.key,
    '-set_serial',
    `0x${randomUUID().replaceAll('-', '')}`,
    '-days',
    '7',
    '-sha256',
    '-extfile',
    extensions,
    '-out',
    certificate,
  ])
  return { certificate, key }
}

async function waitForKong(name) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const result = await command('docker', [
      'exec',
      name,
      'kong',
      'health',
    ]).catch(() => null)
    if (result) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const logs = await command('docker', ['logs', name]).catch(() => ({
    stdout: '',
  }))
  throw new Error(`Kong did not become healthy: ${logs.stdout.slice(-1000)}`)
}

async function runNodeRequest({ certificate, key, network, expectedStatus }) {
  const requestProgram = [
    "const fs=require('node:fs'),https=require('node:https');",
    "const options={host:'kong',port:8443,path:'/probe',servername:'kong',",
    "ca:fs.readFileSync('/fixture/app-to-kong-ca.crt'),rejectUnauthorized:true};",
    'if(process.env.CLIENT_CERT){options.cert=fs.readFileSync(process.env.CLIENT_CERT);options.key=fs.readFileSync(process.env.CLIENT_KEY)}',
    "const request=https.get(options,response=>{response.resume();response.on('end',()=>{console.log(response.statusCode);process.exit(response.statusCode===Number(process.env.EXPECTED_STATUS)?0:1)})});",
    "request.on('error',()=>{console.log('TLS_REJECTED');process.exit(process.env.EXPECTED_STATUS==='TLS_REJECTED'?0:1)});",
  ].join('')
  const args = [
    'run',
    '--rm',
    '--network',
    network,
    '--user',
    probeState.fixtureUser,
    '--mount',
    `type=bind,src=${probeState.fixtureDir},dst=/fixture,readonly`,
    '--entrypoint',
    'node',
    '-e',
    `EXPECTED_STATUS=${expectedStatus}`,
  ]
  if (certificate) {
    args.push(
      '-e',
      `CLIENT_CERT=/fixture/${path.basename(certificate)}`,
      '-e',
      `CLIENT_KEY=/fixture/${path.basename(key)}`,
    )
  }
  args.push(probeImage, '-e', requestProgram)
  await command('docker', args)
}

const probeState = { dockerConfig: '', fixtureDir: '', fixtureUser: '' }

async function main() {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  const image = `${lock.image}@${lock.manifestDigest}`
  const suffix = randomUUID().slice(0, 8)
  const network = `hsa-kong-capability-${suffix}`
  const kongName = `hsa-kong-${suffix}`
  const adapterName = `hsa-adapter-${suffix}`
  const dockerConfig = await mkdtemp(
    path.join(os.tmpdir(), 'kravhantering-hsa-kong-probe-docker-'),
  )
  await chmod(dockerConfig, 0o700)
  probeState.dockerConfig = dockerConfig
  let fixtureDir = ''
  const cleanup = async () => {
    await command('docker', ['rm', '-f', kongName, adapterName]).catch(
      () => undefined,
    )
    await command('docker', ['network', 'rm', network]).catch(() => undefined)
    if (fixtureDir) await rm(fixtureDir, { force: true, recursive: true })
    await rm(dockerConfig, { force: true, recursive: true })
  }
  process.on('SIGINT', () => {
    cleanup().finally(() => process.exit(130))
  })
  try {
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'hsa-kong-capability-'))
    await chmod(fixtureDir, 0o700)
    probeState.fixtureDir = fixtureDir
    const fixtureStat = await stat(fixtureDir)
    probeState.fixtureUser = `${fixtureStat.uid}:${fixtureStat.gid}`
    await command('docker', ['pull', image])
    await command('docker', ['image', 'inspect', image, '--format', '{{.Id}}'])
    await command('docker', [
      'build',
      '--file',
      'containers/hsa-mtls-provisioner/Dockerfile',
      '--tag',
      probeImage,
      '.',
    ])
    await command('docker', ['network', 'create', network])

    const appCa = await issueCa(fixtureDir, 'app-to-kong')
    const adapterCa = await issueCa(fixtureDir, 'kong-to-adapter')
    await Promise.all([
      issueLeaf({
        ca: appCa,
        directory: fixtureDir,
        eku: 'serverAuth',
        keyUsage: 'digitalSignature,keyEncipherment',
        name: 'kong-server',
        san: 'kong',
        subject: '/CN=kong',
      }),
      issueLeaf({
        ca: appCa,
        directory: fixtureDir,
        eku: 'clientAuth',
        keyUsage: 'digitalSignature',
        name: 'app-client',
        subject: '/CN=kravhantering-app',
      }),
      issueLeaf({
        ca: appCa,
        directory: fixtureDir,
        eku: 'clientAuth',
        keyUsage: 'digitalSignature',
        name: 'wrong-app-client',
        subject: '/CN=trusted-but-wrong-app',
      }),
      issueLeaf({
        ca: adapterCa,
        directory: fixtureDir,
        eku: 'serverAuth',
        keyUsage: 'digitalSignature,keyEncipherment',
        name: 'adapter-server',
        san: 'hsa-person-lookup-adapter',
        subject: '/CN=hsa-person-lookup-adapter',
      }),
      issueLeaf({
        ca: adapterCa,
        directory: fixtureDir,
        eku: 'serverAuth',
        keyUsage: 'digitalSignature,keyEncipherment',
        name: 'wrong-adapter-server',
        san: 'trusted-but-wrong-adapter',
        subject: '/CN=trusted-but-wrong-adapter',
      }),
      issueLeaf({
        ca: adapterCa,
        directory: fixtureDir,
        eku: 'clientAuth',
        keyUsage: 'digitalSignature',
        name: 'kong-client',
        subject: '/CN=kravhantering-kong',
      }),
    ])
    await Promise.all(
      (await readdir(fixtureDir))
        .filter(
          name =>
            name.endsWith('-ca.key') ||
            name.endsWith('.csr') ||
            name.endsWith('.ext'),
        )
        .map(name => rm(path.join(fixtureDir, name), { force: true })),
    )
    await Promise.all(
      (await readdir(fixtureDir)).map(name =>
        chmod(
          path.join(fixtureDir, name),
          name.endsWith('.key') ? 0o400 : 0o444,
        ),
      ),
    )
    await writeFile(
      path.join(fixtureDir, 'app-identity.conf'),
      'if ($ssl_client_s_dn != "CN=kravhantering-app") { return 403; }\n',
      { mode: 0o444 },
    )
    await writeFile(
      path.join(fixtureDir, 'kong.yml'),
      [
        '_format_version: "3.0"',
        '_transform: true',
        'services:',
        '  - name: hsa-person-lookup-adapter',
        '    protocol: https',
        '    host: hsa-person-lookup-adapter',
        '    port: 8443',
        '    tls_verify: true',
        '    tls_verify_depth: 1',
        '    routes:',
        '      - name: probe',
        '        protocols: [https]',
        '        paths: [/probe]',
        '        strip_path: false',
        '',
      ].join('\n'),
      { mode: 0o444 },
    )

    const startAdapter = async certificate => {
      await command('docker', ['rm', '-f', adapterName]).catch(() => undefined)
      await command('docker', [
        'run',
        '-d',
        '--name',
        adapterName,
        '--network',
        network,
        '--network-alias',
        'hsa-person-lookup-adapter',
        '--user',
        probeState.fixtureUser,
        '--mount',
        `type=bind,src=${fixtureDir},dst=/fixture,readonly`,
        '--entrypoint',
        'openssl',
        image,
        's_server',
        '-accept',
        '8443',
        '-www',
        '-cert',
        `/fixture/${certificate}`,
        '-key',
        `/fixture/${certificate.replace('.crt', '.key')}`,
        '-CAfile',
        '/fixture/kong-to-adapter-ca.crt',
        '-Verify',
        '1',
        '-verify_return_error',
      ])
    }
    const startKong = async () => {
      await command('docker', ['rm', '-f', kongName]).catch(() => undefined)
      await command('docker', [
        'run',
        '-d',
        '--name',
        kongName,
        '--network',
        network,
        '--network-alias',
        'kong',
        '--user',
        probeState.fixtureUser,
        '--mount',
        `type=bind,src=${fixtureDir},dst=/fixture,readonly`,
        '-e',
        'KONG_DATABASE=off',
        '-e',
        'KONG_DECLARATIVE_CONFIG=/fixture/kong.yml',
        '-e',
        'KONG_PREFIX=/tmp/kong',
        '-e',
        'KONG_PROXY_LISTEN=0.0.0.0:8443 ssl',
        '-e',
        'KONG_ADMIN_LISTEN=127.0.0.1:8001',
        '-e',
        'KONG_SSL_CERT=/fixture/kong-server.crt',
        '-e',
        'KONG_SSL_CERT_KEY=/fixture/kong-server.key',
        '-e',
        'KONG_NGINX_PROXY_SSL_CLIENT_CERTIFICATE=/fixture/app-to-kong-ca.crt',
        '-e',
        'KONG_NGINX_PROXY_SSL_VERIFY_CLIENT=on',
        '-e',
        'KONG_NGINX_PROXY_SSL_VERIFY_DEPTH=1',
        '-e',
        'KONG_NGINX_PROXY_INCLUDE=/fixture/app-identity.conf',
        '-e',
        'KONG_CLIENT_SSL=on',
        '-e',
        'KONG_CLIENT_SSL_CERT=/fixture/kong-client.crt',
        '-e',
        'KONG_CLIENT_SSL_CERT_KEY=/fixture/kong-client.key',
        '-e',
        'KONG_TLS_CERTIFICATE_VERIFY=on',
        '-e',
        'KONG_NGINX_PROXY_PROXY_SSL_TRUSTED_CERTIFICATE=/fixture/kong-to-adapter-ca.crt',
        image,
      ])
      await waitForKong(kongName)
    }

    await startAdapter('adapter-server.crt')
    await startKong()
    await runNodeRequest({
      certificate: path.join(fixtureDir, 'app-client.crt'),
      expectedStatus: 200,
      key: path.join(fixtureDir, 'app-client.key'),
      network,
    })
    await runNodeRequest({ expectedStatus: 400, network })
    await runNodeRequest({
      certificate: path.join(fixtureDir, 'wrong-app-client.crt'),
      expectedStatus: 403,
      key: path.join(fixtureDir, 'wrong-app-client.key'),
      network,
    })

    const generated = (
      await command('docker', [
        'exec',
        kongName,
        'cat',
        '/tmp/kong/nginx-kong.conf',
      ])
    ).stdout
    const requiredGeneratedDirectives = [
      'ssl_client_certificate /fixture/app-to-kong-ca.crt;',
      'ssl_verify_client on;',
      'include /fixture/app-identity.conf;',
      'proxy_ssl_certificate /fixture/kong-client.crt;',
      'proxy_ssl_certificate_key /fixture/kong-client.key;',
      'proxy_ssl_trusted_certificate /fixture/kong-to-adapter-ca.crt;',
      'proxy_ssl_name $upstream_host;',
    ]
    const normalizedGenerated = generated.replaceAll(/\s+/g, ' ')
    for (const directive of requiredGeneratedDirectives) {
      if (!normalizedGenerated.includes(directive)) {
        throw new Error(`Generated directive missing: ${directive}`)
      }
    }
    const adminStatus = (
      await command('docker', [
        'exec',
        kongName,
        'resty',
        '-e',
        "local s=ngx.socket.tcp();assert(s:connect('127.0.0.1',8001));assert(s:send('POST /config HTTP/1.1\\r\\nHost: localhost\\r\\nContent-Type: application/yaml\\r\\nContent-Length: 23\\r\\nConnection: close\\r\\n\\r\\n_format_version: \"3.0\"\\n'));print(assert(s:receive('*l')))",
      ])
    ).stdout.trim()
    if (!adminStatus.includes(' 403 '))
      throw new Error(`Unexpected Admin API result: ${adminStatus}`)

    await startAdapter('wrong-adapter-server.crt')
    await startKong()
    await runNodeRequest({
      certificate: path.join(fixtureDir, 'app-client.crt'),
      expectedStatus: 502,
      key: path.join(fixtureDir, 'app-client.key'),
      network,
    })

    process.stdout.write(
      `${JSON.stringify(
        {
          adminApiPostConfigStatus: 403,
          adminApiReachability: 'loopback-only',
          declarativeServiceTlsFields: ['tls_verify', 'tls_verify_depth'],
          downstreamClientChainRequired: true,
          downstreamExactRfc2253SubjectRequired: true,
          generatedDirectives: requiredGeneratedDirectives,
          image: lock.image,
          imageId: lock.imageId,
          manifestDigest: lock.manifestDigest,
          upstreamClientCertificatePresented: true,
          upstreamServerChainVerified: true,
          upstreamServerDnsIdentityVerified: true,
          version: lock.tag.split('-', 1)[0],
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    await cleanup()
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
