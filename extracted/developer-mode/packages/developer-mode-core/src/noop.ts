import type {
  DeveloperModeMarkerInput,
  DeveloperModeMarkerProps,
} from './index'

export function devMarker(
  _input: DeveloperModeMarkerInput,
): DeveloperModeMarkerProps {
  return {}
}

export function noopDevMarker(): DeveloperModeMarkerProps {
  return {}
}
