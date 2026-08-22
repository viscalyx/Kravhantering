import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION,
  AiProviderSecretCryptoError,
  buildAiProviderSecretAad,
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from '@/lib/ai/provider-secret-crypto'
import {
  AiProviderSecretKeyringError,
  loadAiProviderSecretKeyring,
  parseAiProviderSecretKeyring,
} from '@/lib/ai/provider-secret-keyring'

function keyring(
  activeWriteVersion = 'root-blue',
  keys: Record<string, string> = {
    'root-blue': randomBytes(32).toString('base64'),
    'root-green': randomBytes(32).toString('base64'),
  },
) {
  return parseAiProviderSecretKeyring(
    JSON.stringify({ activeWriteVersion, formatVersion: 1, keys }),
  )
}

describe('AI provider-secret cryptographic envelope', () => {
  it('round-trips AES-256-GCM with the explicitly selected write version', () => {
    const connectionId = randomUUID()
    const secretVersionId = randomUUID()
    const ring = keyring('root-blue')

    const encrypted = encryptAiProviderSecret(
      ring,
      { connectionId, secretVersionId },
      'provider-secret-value',
    )

    expect(encrypted).toMatchObject({
      formatVersion: AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION,
      rootKeyVersion: 'root-blue',
    })
    expect(encrypted.nonce).toHaveLength(12)
    expect(encrypted.authenticationTag).toHaveLength(16)
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(
      'provider-secret-value',
    )
    expect(
      decryptAiProviderSecret(
        ring,
        { connectionId, secretVersionId },
        encrypted,
      ),
    ).toBe('provider-secret-value')
  })

  it('uses a fresh random nonce for every revision encryption', () => {
    const ring = keyring()
    const connectionId = randomUUID()

    const first = encryptAiProviderSecret(
      ring,
      { connectionId, secretVersionId: randomUUID() },
      'same-secret',
    )
    const second = encryptAiProviderSecret(
      ring,
      { connectionId, secretVersionId: randomUUID() },
      'same-secret',
    )

    expect(first.nonce.equals(second.nonce)).toBe(false)
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false)
  })

  it('authenticates immutable IDs and exact version metadata as AAD', () => {
    const ring = keyring()
    const binding = {
      connectionId: randomUUID(),
      secretVersionId: randomUUID(),
    }
    const encrypted = encryptAiProviderSecret(ring, binding, 'bound-secret')

    expect(() =>
      decryptAiProviderSecret(
        ring,
        { ...binding, connectionId: randomUUID() },
        encrypted,
      ),
    ).toThrow('authentication failed')
    expect(() =>
      decryptAiProviderSecret(
        ring,
        { ...binding, secretVersionId: randomUUID() },
        encrypted,
      ),
    ).toThrow('authentication failed')
    expect(() =>
      decryptAiProviderSecret(ring, binding, {
        ...encrypted,
        rootKeyVersion: 'root-green',
      }),
    ).toThrow('authentication failed')

    expect(buildAiProviderSecretAad(binding, encrypted)).toEqual(
      Buffer.from(
        `kravhantering.ai-provider-secret\u0000${AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION}\u0000root-blue\u0000${binding.connectionId}\u0000${binding.secretVersionId}`,
        'utf8',
      ),
    )
  })

  it('requires the envelope root version instead of choosing a different key', () => {
    const ring = keyring()
    const binding = {
      connectionId: randomUUID(),
      secretVersionId: randomUUID(),
    }
    const encrypted = encryptAiProviderSecret(ring, binding, 'bound-secret')
    const withoutRequiredVersion = keyring('root-green', {
      'root-green': randomBytes(32).toString('base64'),
    })

    expect(() =>
      decryptAiProviderSecret(withoutRequiredVersion, binding, encrypted),
    ).toThrow('root key version root-blue is unavailable')
  })

  it('rejects invalid bindings, plaintext bounds, and envelope shapes', () => {
    const ring = keyring()
    const binding = {
      connectionId: randomUUID(),
      secretVersionId: randomUUID(),
    }
    expect(() =>
      encryptAiProviderSecret(
        ring,
        { ...binding, connectionId: 'not-a-uuid' },
        'secret',
      ),
    ).toThrow('connection ID must be a UUID')
    expect(() => encryptAiProviderSecret(ring, binding, '')).toThrow(
      'must contain 1-65536 UTF-8 bytes',
    )
    expect(() =>
      encryptAiProviderSecret(ring, binding, 'x'.repeat(65_537)),
    ).toThrow('must contain 1-65536 UTF-8 bytes')

    const encrypted = encryptAiProviderSecret(ring, binding, 'secret')
    for (const invalid of [
      { ...encrypted, formatVersion: 2 as 1 },
      { ...encrypted, nonce: Buffer.alloc(11) },
      { ...encrypted, authenticationTag: Buffer.alloc(15) },
      { ...encrypted, ciphertext: Buffer.alloc(0) },
      { ...encrypted, rootKeyVersion: '' },
    ]) {
      expect(() => decryptAiProviderSecret(ring, binding, invalid)).toThrow(
        AiProviderSecretCryptoError,
      )
    }
  })

  it('preserves non-keyring lookup failures and typed binding failures', () => {
    const binding = {
      connectionId: randomUUID(),
      secretVersionId: randomUUID(),
    }
    const ring = keyring()
    const encrypted = encryptAiProviderSecret(ring, binding, 'secret')
    expect(() =>
      decryptAiProviderSecret(
        {
          ...ring,
          keyForVersion: () => {
            throw new TypeError('key provider unavailable')
          },
        },
        binding,
        encrypted,
      ),
    ).toThrow('key provider unavailable')
    expect(() =>
      decryptAiProviderSecret(
        ring,
        { ...binding, secretVersionId: 'not-a-uuid' },
        encrypted,
      ),
    ).toThrow('secret-version ID must be a UUID')
  })
})

describe('AI provider-secret root keyring', () => {
  it('rejects malformed formats and keys that are not exactly 256 bits', () => {
    expect(() =>
      parseAiProviderSecretKeyring(
        JSON.stringify({
          activeWriteVersion: '1',
          formatVersion: 2,
          keys: { '1': randomBytes(32).toString('base64') },
        }),
      ),
    ).toThrow(AiProviderSecretKeyringError)
    expect(() =>
      parseAiProviderSecretKeyring(
        JSON.stringify({
          activeWriteVersion: '1',
          formatVersion: 1,
          keys: { '1': randomBytes(31).toString('base64') },
        }),
      ),
    ).toThrow('exactly 32 bytes')
  })

  it('does not infer the active write version from sortable key versions', () => {
    expect(() =>
      keyring('11', {
        '10': randomBytes(32).toString('base64'),
        '9': randomBytes(32).toString('base64'),
      }),
    ).toThrow('active write version 11 is unavailable')

    const ring = keyring('9', {
      '10': randomBytes(32).toString('base64'),
      '9': randomBytes(32).toString('base64'),
    })
    expect(ring.activeWriteVersion).toBe('9')
  })

  it('loads only the configured external file and redacts file failures', () => {
    const serialized = JSON.stringify({
      activeWriteVersion: 'root-1',
      formatVersion: 1,
      keys: { 'root-1': randomBytes(32).toString('base64') },
    })
    const readFile = vi.fn(() => serialized)

    const ring = loadAiProviderSecretKeyring(
      { AI_PROVIDER_SECRET_KEYRING_FILE: '/run/secrets/keyring.json' },
      readFile,
    )

    expect(readFile).toHaveBeenCalledWith('/run/secrets/keyring.json')
    expect(ring.activeWriteVersion).toBe('root-1')
    expect(() =>
      loadAiProviderSecretKeyring(
        { AI_PROVIDER_SECRET_KEYRING_FILE: '/private/keyring.json' },
        () => {
          throw new Error('permission denied for /private/keyring.json')
        },
      ),
    ).toThrow('AI provider-secret keyring file is unavailable')
  })

  it.each([
    ['invalid JSON', '{'],
    ['non-object document', 'null'],
    [
      'invalid active version',
      JSON.stringify({
        activeWriteVersion: '../root',
        formatVersion: 1,
        keys: {},
      }),
    ],
    [
      'non-object keys',
      JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: [],
      }),
    ],
    [
      'empty keys',
      JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: {},
      }),
    ],
    [
      'invalid key version',
      JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: { '../root': randomBytes(32).toString('base64') },
      }),
    ],
    [
      'non-string key',
      JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: { 'root-1': 32 },
      }),
    ],
    [
      'invalid base64 key',
      JSON.stringify({
        activeWriteVersion: 'root-1',
        formatVersion: 1,
        keys: { 'root-1': '***' },
      }),
    ],
  ])('rejects a keyring with %s', (_case, serialized) => {
    expect(() => parseAiProviderSecretKeyring(serialized)).toThrow(
      AiProviderSecretKeyringError,
    )
  })

  it('returns sorted versions and copied keys while rejecting an unknown version', () => {
    const ring = keyring('root-2', {
      'root-2': randomBytes(32).toString('base64'),
      'root-1': randomBytes(32).toString('base64'),
    })
    const first = ring.keyForVersion('root-1')
    first.fill(0)

    expect(ring.versions()).toEqual(['root-1', 'root-2'])
    expect(ring.keyForVersion('root-1')).not.toEqual(first)
    expect(() => ring.keyForVersion('missing')).toThrow(
      'root key version missing is unavailable',
    )
  })

  it('requires configuration and loads the configured file with the default reader', () => {
    expect(() => loadAiProviderSecretKeyring({})).toThrow(
      'AI_PROVIDER_SECRET_KEYRING_FILE is not configured',
    )
    const directory = mkdtempSync(join(tmpdir(), 'keyring-load-'))
    const path = join(directory, 'keyring.json')
    writeFileSync(
      path,
      JSON.stringify({
        activeWriteVersion: 'root-file',
        formatVersion: 1,
        keys: { 'root-file': randomBytes(32).toString('base64') },
      }),
    )
    try {
      expect(
        loadAiProviderSecretKeyring({ AI_PROVIDER_SECRET_KEYRING_FILE: path }),
      ).toMatchObject({ activeWriteVersion: 'root-file' })
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})
