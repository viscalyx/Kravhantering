import fs from 'node:fs'
import path from 'node:path'

export interface BuildMetadata {
  builtAt: string
  commitSha: string
  imageTag: string
  version: string
}

const BUILD_METADATA_PATH = path.join(process.cwd(), 'public', 'build.json')

interface BuildMetadataFs {
  readFileSync(filePath: string, encoding: BufferEncoding): string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseBuildMetadata(value: unknown): BuildMetadata | null {
  if (!isRecord(value)) return null

  const version = readNonEmptyString(value.version)
  const commitSha = readNonEmptyString(value.commitSha)
  const builtAt = readNonEmptyString(value.builtAt)
  const imageTag = readNonEmptyString(value.imageTag)

  if (!version || !commitSha || !builtAt || !imageTag) return null
  return { builtAt, commitSha, imageTag, version }
}

export function readBuildMetadata(
  filePath = BUILD_METADATA_PATH,
  fsImpl: BuildMetadataFs = fs,
): BuildMetadata | null {
  try {
    return parseBuildMetadata(JSON.parse(fsImpl.readFileSync(filePath, 'utf8')))
  } catch {
    return null
  }
}
