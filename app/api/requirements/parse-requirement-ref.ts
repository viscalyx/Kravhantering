import type { RequirementRefInput } from '@/lib/requirements/service'

/** Parse the [id] segment as either a numeric id or a uniqueId string. */
export function parseRequirementRef(raw: string): RequirementRefInput {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    if (n > 0) {
      return { id: n }
    }
  }
  return { uniqueId: raw }
}
