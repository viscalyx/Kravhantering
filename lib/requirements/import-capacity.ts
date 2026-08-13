import { importCapacityBusyError } from '@/lib/requirements/errors'
import { REQUIREMENT_IMPORT_CONCURRENCY_PER_NODE } from '@/lib/requirements/import-budget'

let activeRequirementImports = 0

export interface RequirementImportCapacityLease {
  release(): void
}

export function tryAcquireRequirementImportCapacity(): RequirementImportCapacityLease | null {
  if (activeRequirementImports >= REQUIREMENT_IMPORT_CONCURRENCY_PER_NODE) {
    return null
  }
  activeRequirementImports += 1
  let released = false
  return {
    release(): void {
      if (released) return
      released = true
      activeRequirementImports = Math.max(0, activeRequirementImports - 1)
    },
  }
}

export async function withRequirementImportCapacity<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const lease = tryAcquireRequirementImportCapacity()
  if (!lease) throw importCapacityBusyError()
  try {
    return await operation()
  } finally {
    lease.release()
  }
}

export function resetRequirementImportCapacityForTests(): void {
  activeRequirementImports = 0
}
