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

function humanizeIdentifier(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

export function devMarker(input: DeveloperModeMarkerInput) {
  return createDeveloperModeMarker(input)
}

export function getRequirementColumnDeveloperModeLabel(
  columnId: string,
): string {
  return REQUIREMENT_COLUMN_LABELS[columnId] ?? humanizeIdentifier(columnId)
}
