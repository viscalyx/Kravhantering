#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_FIXTURE_PATH =
  'containers/hsa-directory-mock/fixtures/hsa-personer.json'
export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8790
export const HEALTH_PATH = '/health'
export const LOOKUP_PATH = '/hsa/person-records/lookup'

const MAX_BODY_BYTES = 1024 * 1024

function stringField(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nullableStringField(value) {
  return value == null ? null : stringField(value)
}

function protectedPersonFlag(value) {
  return value === true || value === 'true'
}

function jsonResponse(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(text),
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(text)
}

async function requestBody(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.')
      error.status = 413
      throw error
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function hsaRecordToLookupPayload(record) {
  return {
    email: nullableStringField(record.mail),
    givenName: stringField(record.givenName) ?? '',
    hasProtectedPersonalData: protectedPersonFlag(record.hsaProtectedPerson),
    hsaId: stringField(record.hsaIdentity) ?? '',
    middleName: nullableStringField(record.middleName),
    surname: nullableStringField(record.sn),
  }
}

export function buildFixtureLookup(fixture) {
  const records = Array.isArray(fixture?.hsaPersonRecords)
    ? fixture.hsaPersonRecords
    : []
  const notFoundIdentities = new Set(
    (Array.isArray(fixture?.notFoundIdentities)
      ? fixture.notFoundIdentities
      : []
    )
      .map(stringField)
      .filter(Boolean),
  )
  const recordsByHsaId = new Map()

  for (const record of records) {
    const hsaId = stringField(record?.hsaIdentity)
    if (!hsaId) continue
    const matchingRecords = recordsByHsaId.get(hsaId) ?? []
    matchingRecords.push(record)
    recordsByHsaId.set(hsaId, matchingRecords)
  }

  return {
    personCount: recordsByHsaId.size,
    lookup(hsaId) {
      const requestedHsaId = stringField(hsaId)
      if (!requestedHsaId) {
        return {
          body: {
            code: 'bad_request',
            message: 'Expected body.hsaId to be a non-empty string.',
          },
          status: 400,
        }
      }

      if (notFoundIdentities.has(requestedHsaId)) {
        return {
          body: { code: 'not_found', message: 'HSA person was not found.' },
          status: 404,
        }
      }

      const matchingRecords = recordsByHsaId.get(requestedHsaId) ?? []
      if (matchingRecords.length === 0) {
        return {
          body: { code: 'not_found', message: 'HSA person was not found.' },
          status: 404,
        }
      }
      if (matchingRecords.length > 1) {
        return {
          body: {
            code: 'conflict',
            message: 'HSA lookup returned conflicting person records.',
          },
          status: 409,
        }
      }

      return {
        body: hsaRecordToLookupPayload(matchingRecords[0]),
        status: 200,
      }
    },
  }
}

export async function loadFixtureLookup(
  fixturePath = DEFAULT_FIXTURE_PATH,
  readFileImpl = readFile,
) {
  const text = await readFileImpl(fixturePath, 'utf8')
  return buildFixtureLookup(JSON.parse(text))
}

export function createFixtureServer(lookup) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'ci'}`)

    if (req.method === 'GET' && url.pathname === HEALTH_PATH) {
      jsonResponse(res, 200, { ok: true, personCount: lookup.personCount })
      return
    }

    if (req.method !== 'POST' || url.pathname !== LOOKUP_PATH) {
      jsonResponse(res, 404, { code: 'not_found' })
      return
    }

    try {
      const text = await requestBody(req)
      const payload = text.trim() ? JSON.parse(text) : {}
      const result = lookup.lookup(payload?.hsaId)
      jsonResponse(res, result.status, result.body)
    } catch (error) {
      jsonResponse(res, error.status ?? 400, {
        code: 'bad_request',
        message: error instanceof Error ? error.message : 'Invalid request.',
      })
    }
  })
}

export function parseArgs(argv) {
  const options = {
    fixturePath: DEFAULT_FIXTURE_PATH,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const [inlineKey, inlineValue] = arg.startsWith('--')
      ? arg.slice(2).split('=', 2)
      : [undefined, undefined]

    if (arg === '--fixture' || inlineKey === 'fixture') {
      options.fixturePath = inlineValue ?? argv[index + 1]
      if (inlineValue == null) index += 1
      continue
    }
    if (arg === '--host' || inlineKey === 'host') {
      options.host = inlineValue ?? argv[index + 1]
      if (inlineValue == null) index += 1
      continue
    }
    if (arg === '--port' || inlineKey === 'port') {
      options.port = Number(inlineValue ?? argv[index + 1])
      if (inlineValue == null) index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.fixturePath) throw new Error('Missing --fixture value.')
  if (!options.host) throw new Error('Missing --host value.')
  if (!Number.isInteger(options.port) || options.port < 1) {
    throw new Error('Expected --port to be a positive integer.')
  }

  return options
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server) {
  return new Promise(resolve => {
    server.close(() => resolve())
  })
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const lookup = await loadFixtureLookup(options.fixturePath)
  const server = createFixtureServer(lookup)
  await listen(server, options.host, options.port)
  const baseUrl = `http://${options.host}:${options.port}`
  process.stdout.write(
    `HSA person lookup fixture listening at ${baseUrl}${LOOKUP_PATH}\n`,
  )

  const stop = () => close(server).then(() => process.exit(0))
  process.on('SIGINT', () => {
    void stop()
  })
  process.on('SIGTERM', () => {
    void stop()
  })

  await new Promise(() => {})
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  }
}
