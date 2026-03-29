import {
  devMarker as createDeveloperModeMarker,
  type DeveloperModeMarkerInput,
} from '@viscalyx/developer-mode-core'

const REQUIREMENT_COLUMN_LABELS: Record<string, string> = {
  area: 'area',
  category: 'category',
  description: 'requirement text',
  requiresTesting: 'verifiable',
  status: 'status',
  type: 'type',
  qualityCharacteristic: 'quality characteristic',
  uniqueId: 'requirement id',
  version: 'version',
}

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

export function devMarker(
  input: DeveloperModeMarkerInput,
): ReturnType<typeof createDeveloperModeMarker> {
  return createDeveloperModeMarker(input)
}

export function getRequirementColumnDeveloperModeLabel(
  columnId: string,
): string {
  return REQUIREMENT_COLUMN_LABELS[columnId] ?? humanizeIdentifier(columnId)
}
