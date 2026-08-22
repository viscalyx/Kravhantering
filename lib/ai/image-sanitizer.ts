import sharp, { type OutputInfo } from 'sharp'

export interface AiImageSanitizationLimits {
  maximumBytes: number
  maximumFrames: number
  maximumHeight: number
  maximumPixels: number
  maximumWidth: number
}

export interface AiUntrustedImage {
  data: Uint8Array
  mediaType: string
}

export interface AiSanitizedImage {
  data: Uint8Array
  height: number
  mediaType: 'image/png'
  width: number
}

export type AiImageSanitizationErrorCode =
  | 'image_decode_failed'
  | 'image_dimensions_exceeded'
  | 'image_frames_exceeded'
  | 'image_pixels_exceeded'
  | 'image_too_large'
  | 'invalid_limits'
  | 'mime_signature_mismatch'
  | 'unsupported_image_type'

export class AiImageSanitizationError extends Error {
  readonly code: AiImageSanitizationErrorCode
  readonly safeMessage = 'The image could not be accepted for AI processing.'

  constructor(code: AiImageSanitizationErrorCode) {
    super('The image could not be accepted for AI processing.')
    this.name = 'AiImageSanitizationError'
    this.code = code
  }
}

function reject(code: AiImageSanitizationErrorCode): never {
  throw new AiImageSanitizationError(code)
}

function hasPrefix(data: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => data[index] === byte)
}

function detectedMediaType(data: Uint8Array): string | null {
  if (hasPrefix(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (hasPrefix(data, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return 'image/png'
  }
  if (
    hasPrefix(data, [82, 73, 70, 70]) &&
    data[8] === 87 &&
    data[9] === 69 &&
    data[10] === 66 &&
    data[11] === 80
  ) {
    return 'image/webp'
  }
  if (
    hasPrefix(data, [71, 73, 70, 56, 55, 97]) ||
    hasPrefix(data, [71, 73, 70, 56, 57, 97])
  ) {
    return 'image/gif'
  }
  return null
}

function validateLimits(limits: AiImageSanitizationLimits): void {
  if (
    Object.values(limits).some(
      value => !Number.isSafeInteger(value) || value < 1,
    )
  ) {
    reject('invalid_limits')
  }
}

function validateMetadata(
  metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>,
  limits: AiImageSanitizationLimits,
): { height: number; width: number } {
  const width = metadata.width
  const pageHeight = metadata.pageHeight ?? metadata.height
  const frames = metadata.pages ?? 1
  if (!width || !pageHeight) return reject('image_decode_failed')
  if (frames > limits.maximumFrames) return reject('image_frames_exceeded')
  if (width > limits.maximumWidth || pageHeight > limits.maximumHeight) {
    return reject('image_dimensions_exceeded')
  }
  if (width * pageHeight * frames > limits.maximumPixels) {
    return reject('image_pixels_exceeded')
  }
  return { height: pageHeight, width }
}

export async function sanitizeAiImage(
  image: Readonly<AiUntrustedImage>,
  limits: Readonly<AiImageSanitizationLimits>,
): Promise<Readonly<AiSanitizedImage>> {
  validateLimits(limits)
  if (
    image.data.byteLength === 0 ||
    image.data.byteLength > limits.maximumBytes
  ) {
    return reject('image_too_large')
  }
  const detected = detectedMediaType(image.data)
  if (!detected) return reject('unsupported_image_type')
  if (image.mediaType.toLowerCase() !== detected) {
    return reject('mime_signature_mismatch')
  }
  const input = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  )
  let pipeline: ReturnType<typeof sharp>
  try {
    const metadataPipeline = sharp(input, {
      animated: true,
      failOn: 'error',
      limitInputPixels: false,
      sequentialRead: true,
    })
    validateMetadata(await metadataPipeline.metadata(), limits)
    pipeline = sharp(input, {
      animated: true,
      failOn: 'error',
      limitInputPixels: limits.maximumPixels,
      sequentialRead: true,
    })
  } catch (error) {
    if (error instanceof AiImageSanitizationError) throw error
    return reject('image_decode_failed')
  }
  let encoded: {
    data: Buffer
    info: OutputInfo
  }
  try {
    encoded = await pipeline
      .rotate()
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })
  } catch {
    return reject('image_decode_failed')
  }
  const { data: output, info } = encoded
  if (output.byteLength > limits.maximumBytes) return reject('image_too_large')
  return Object.freeze({
    data: output,
    height:
      limits.maximumFrames > 1 ? (info.pageHeight ?? info.height) : info.height,
    mediaType: 'image/png',
    width: info.width,
  })
}
