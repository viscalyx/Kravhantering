import {
  SPECIFICATION_LIFECYCLE_STATUS_DEVELOPMENT_ID,
  SPECIFICATION_LIFECYCLE_STATUS_IMPLEMENTATION_ID,
  SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID,
  SPECIFICATION_LIFECYCLE_STATUS_PROCUREMENT_ID,
} from '@/lib/specifications/lifecycle-status-constants'

export function isBuiltInSpecificationLifecycleStatus(id: number): boolean {
  return [
    SPECIFICATION_LIFECYCLE_STATUS_PROCUREMENT_ID,
    SPECIFICATION_LIFECYCLE_STATUS_IMPLEMENTATION_ID,
    SPECIFICATION_LIFECYCLE_STATUS_DEVELOPMENT_ID,
    SPECIFICATION_LIFECYCLE_STATUS_MANAGEMENT_ID,
  ].includes(id)
}

export class ProtectedSpecificationLifecycleStatusError extends Error {
  constructor() {
    super(
      'Built-in specification lifecycle statuses can be renamed but cannot be deleted',
    )
    this.name = 'ProtectedSpecificationLifecycleStatusError'
  }
}
