import type { RequirementRefInput } from '@/lib/requirements/service'

/** Parse the [id] segment as either a numeric id or a uniqueId string. */
export function parseRequirementRef(raw: string): RequirementRefInput {
  const n = Number(raw)
  if (!Number.isNaN(n) && Number.isInteger(n) && n > 0) {
    return { id: n }
  }
  return { uniqueId: raw }
}
