import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  AiImageSanitizationError,
  sanitizeAiImage,
} from '@/lib/ai/image-sanitizer'

const LIMITS = {
  maximumBytes: 1024 * 1024,
  maximumFrames: 1,
  maximumHeight: 64,
  maximumPixels: 4096,
  maximumWidth: 64,
} as const

async function jpegWithMetadata(): Promise<Buffer> {
  return sharp({
    create: {
      background: { alpha: 1, b: 30, g: 20, r: 10 },
      channels: 4,
      height: 4,
      width: 5,
    },
  })
    .withMetadata({ exif: { IFD0: { Artist: 'must-be-removed' } } })
    .jpeg()
    .toBuffer()
}

describe('AI image sanitizer', () => {
  it('verifies a JPEG and re-encodes it as metadata-free PNG', async () => {
    const input = await jpegWithMetadata()

    const sanitized = await sanitizeAiImage(
      { data: input, mediaType: 'image/jpeg' },
      LIMITS,
    )

    expect(sanitized.mediaType).toBe('image/png')
    expect(Buffer.from(sanitized.data).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    const metadata = await sharp(sanitized.data).metadata()
    expect(metadata).toMatchObject({ format: 'png', height: 4, width: 5 })
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
  })

  it('reports the encoded dimensions after applying image orientation', async () => {
    const input = await sharp({
      create: {
        background: 'red',
        channels: 3,
        height: 3,
        width: 5,
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()

    await expect(
      sanitizeAiImage({ data: input, mediaType: 'image/jpeg' }, LIMITS),
    ).resolves.toMatchObject({ height: 5, width: 3 })
  })

  it('reports the encoded per-frame height for accepted animated output', async () => {
    const animatedPixels = Buffer.from([
      ...new Array<number>(12).fill(0),
      ...new Array<number>(12).fill(255),
    ])
    const animated = await sharp(animatedPixels, {
      raw: { channels: 3, height: 4, pageHeight: 2, width: 2 },
    })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer()

    await expect(
      sanitizeAiImage(
        { data: animated, mediaType: 'image/gif' },
        { ...LIMITS, maximumFrames: 2 },
      ),
    ).resolves.toMatchObject({ height: 2, width: 2 })
  })

  it('rejects a declared MIME type that disagrees with the file signature', async () => {
    await expect(
      sanitizeAiImage(
        { data: await jpegWithMetadata(), mediaType: 'image/png' },
        LIMITS,
      ),
    ).rejects.toMatchObject({ code: 'mime_signature_mismatch' })
  })

  it('rejects byte, dimension, pixel and frame limit violations', async () => {
    const image = await sharp({
      create: {
        background: 'black',
        channels: 3,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toBuffer()
    await expect(
      sanitizeAiImage(
        { data: image, mediaType: 'image/png' },
        { ...LIMITS, maximumBytes: image.byteLength - 1 },
      ),
    ).rejects.toMatchObject({ code: 'image_too_large' })
    await expect(
      sanitizeAiImage(
        { data: image, mediaType: 'image/png' },
        { ...LIMITS, maximumWidth: 7 },
      ),
    ).rejects.toMatchObject({ code: 'image_dimensions_exceeded' })
    await expect(
      sanitizeAiImage(
        { data: image, mediaType: 'image/png' },
        { ...LIMITS, maximumPixels: 63 },
      ),
    ).rejects.toMatchObject({ code: 'image_pixels_exceeded' })

    const animatedPixels = Buffer.from([
      ...new Array<number>(12).fill(0),
      ...new Array<number>(12).fill(255),
    ])
    const animated = await sharp(animatedPixels, {
      raw: { channels: 3, height: 4, pageHeight: 2, width: 2 },
    })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer()
    await expect(
      sanitizeAiImage({ data: animated, mediaType: 'image/gif' }, LIMITS),
    ).rejects.toMatchObject({ code: 'image_frames_exceeded' })
  })

  it('fails closed for malformed image bytes', async () => {
    await expect(
      sanitizeAiImage(
        { data: Buffer.from('not an image'), mediaType: 'image/png' },
        LIMITS,
      ),
    ).rejects.toBeInstanceOf(AiImageSanitizationError)
    await expect(
      sanitizeAiImage(
        { data: Buffer.from([0xff, 0xd8, 0xff, 0]), mediaType: 'image/jpeg' },
        LIMITS,
      ),
    ).rejects.toMatchObject({ code: 'image_decode_failed' })
  })

  it('accepts a correctly signed WebP and rejects invalid limits', async () => {
    const webp = await sharp({
      create: {
        background: 'blue',
        channels: 3,
        height: 2,
        width: 2,
      },
    })
      .webp()
      .toBuffer()

    await expect(
      sanitizeAiImage({ data: webp, mediaType: 'IMAGE/WEBP' }, LIMITS),
    ).resolves.toMatchObject({ mediaType: 'image/png' })
    await expect(
      sanitizeAiImage(
        { data: webp, mediaType: 'image/webp' },
        { ...LIMITS, maximumFrames: 0 },
      ),
    ).rejects.toMatchObject({ code: 'invalid_limits' })
  })

  it('enforces the byte limit again after safe re-encoding', async () => {
    const pixels = Buffer.alloc(32 * 32 * 3)
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 73) % 256
    }
    const jpeg = await sharp(pixels, {
      raw: { channels: 3, height: 32, width: 32 },
    })
      .jpeg({ quality: 20 })
      .toBuffer()
    const png = await sharp(jpeg)
      .rotate()
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer()
    expect(png.byteLength).toBeGreaterThan(jpeg.byteLength)

    await expect(
      sanitizeAiImage(
        { data: jpeg, mediaType: 'image/jpeg' },
        { ...LIMITS, maximumBytes: jpeg.byteLength },
      ),
    ).rejects.toMatchObject({ code: 'image_too_large' })
  })
})
