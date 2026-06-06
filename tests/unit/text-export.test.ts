import { describe, expect, it } from 'vitest'
import { createUtf8BomBlob, UTF8_BOM, withUtf8Bom } from '@/lib/text-export'

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('text export helpers', () => {
  it('prefixes text with a UTF-8 BOM exactly once', () => {
    expect(withUtf8Bom('åäö')).toBe(`${UTF8_BOM}åäö`)
    expect(withUtf8Bom(`${UTF8_BOM}åäö`)).toBe(`${UTF8_BOM}åäö`)
  })

  it('creates browser text blobs with UTF-8 BOM bytes', async () => {
    const blob = createUtf8BomBlob(
      JSON.stringify({ label: 'Åtgärdslogg' }),
      'application/json;charset=utf-8',
    )
    const bytes = await blobBytes(blob)

    expect(blob.type).toBe('application/json;charset=utf-8')
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(
      `${UTF8_BOM}{"label":"Åtgärdslogg"}`,
    )
  })
})
