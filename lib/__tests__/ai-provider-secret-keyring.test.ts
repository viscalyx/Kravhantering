import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AiProviderSecretKeyringError,
  loadAiProviderSecretKeyring,
  parseAiProviderSecretKeyring,
} from '@/lib/ai/provider-secret-keyring'
import { loadAiProviderSecretMaintenanceKeyring } from '@/scripts/ai-provider-secret-maintenance.mjs'
import { provisionAiProviderSecretKeyring } from '@/scripts/provision-ai-provider-secret-keyring.mjs'

// cSpell:disable-next-line
const encoded = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
const valid = {
  activeWriteVersion: 'root-1',
  formatVersion: 1,
  keys: { 'root-2': encoded, 'root-1': encoded },
}
const invalidDocuments: readonly (readonly [string, string])[] = [
  ['malformed JSON', '{'],
  ['null document', 'null'],
  ['array document', '[]'],
  ['primitive document', '42'],
  ['missing format', JSON.stringify({ ...valid, formatVersion: undefined })],
  ['unsupported format', JSON.stringify({ ...valid, formatVersion: 2 })],
  ['string format', JSON.stringify({ ...valid, formatVersion: '1' })],
  [
    'missing active version',
    JSON.stringify({ ...valid, activeWriteVersion: undefined }),
  ],
  [
    'numeric active version',
    JSON.stringify({ ...valid, activeWriteVersion: 1 }),
  ],
  [
    'invalid active version',
    JSON.stringify({ ...valid, activeWriteVersion: '../key' }),
  ],
  ['missing keys', JSON.stringify({ ...valid, keys: undefined })],
  ['null keys', JSON.stringify({ ...valid, keys: null })],
  ['primitive keys', JSON.stringify({ ...valid, keys: 'keys' })],
  ['array keys', JSON.stringify({ ...valid, keys: [] })],
  ['empty keys', JSON.stringify({ ...valid, keys: {} })],
  [
    'invalid key version',
    JSON.stringify({ ...valid, keys: { '../key': encoded } }),
  ],
  ...(
    [
      ['non-string key', 32],
      ['empty key', ''],
      ['invalid base64', '***'],
      ['base64 punctuation', `${encoded}!`],
      ['base64 whitespace', `${encoded}\n`],
      ['missing padding', encoded.slice(0, -1)],
      // cSpell:disable-next-line
      ['short key', 'AQEB'],
      ['long key', Buffer.alloc(33).toString('base64')],
    ] as const
  ).map(
    ([name, value]) =>
      [name, JSON.stringify({ ...valid, keys: { 'root-1': value } })] as const,
  ),
]

describe('shared AI provider-secret keyring contract', () => {
  it.each([
    ...invalidDocuments.map(([name, serialized]) => [
      name,
      serialized,
      'invalid_keyring',
    ]),
    [
      'missing active key',
      JSON.stringify({ ...valid, activeWriteVersion: 'missing' }),
      'active_write_version_missing',
    ],
  ])(
    'rejects %s consistently in every consumer',
    async (_name, serialized, code) => {
      const directory = await mkdtemp(join(tmpdir(), 'keyring-contract-'))
      const path = join(directory, 'keyring.json')
      try {
        await writeFile(path, serialized, { mode: 0o600 })
        const env = { AI_PROVIDER_SECRET_KEYRING_FILE: path }
        for (const load of [
          () => parseAiProviderSecretKeyring(serialized),
          () => loadAiProviderSecretKeyring(env),
          () => loadAiProviderSecretMaintenanceKeyring(env),
        ]) {
          expect(load).toThrow(AiProviderSecretKeyringError)
          expect(load).toThrow(expect.objectContaining({ code }))
        }
        await expect(
          provisionAiProviderSecretKeyring({ path }),
        ).rejects.toMatchObject({ code })
        expect(await readFile(path, 'utf8')).toBe(serialized)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('keeps explicit write selection, version lookup and defensive copies across consumers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'keyring-contract-'))
    const path = join(directory, 'private', 'keyring.json')
    const serialized = JSON.stringify(valid)
    try {
      await mkdir(join(directory, 'private'), { mode: 0o700 })
      await writeFile(path, serialized, { mode: 0o600 })
      const env = { AI_PROVIDER_SECRET_KEYRING_FILE: path }
      await expect(provisionAiProviderSecretKeyring({ path })).resolves.toEqual(
        { created: false, path },
      )
      for (const ring of [
        parseAiProviderSecretKeyring(serialized),
        loadAiProviderSecretKeyring(env),
        loadAiProviderSecretMaintenanceKeyring(env),
      ]) {
        expect(ring.activeWriteVersion).toBe('root-1')
        expect(ring.formatVersion).toBe(1)
        const versions = ring.versions()
        expect(versions).toEqual(['root-1', 'root-2'])
        expect(ring.versions()).not.toBe(versions)
        ring.keyForVersion('root-1').fill(0)
        expect(ring.keyForVersion('root-1')).toEqual(Buffer.alloc(32, 1))
        expect(() => ring.keyForVersion('missing')).toThrow(
          AiProviderSecretKeyringError,
        )
        expect(() => ring.keyForVersion('missing')).toThrow(
          expect.objectContaining({ code: 'root_key_version_missing' }),
        )
      }
      expect(await readFile(path, 'utf8')).toBe(serialized)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
