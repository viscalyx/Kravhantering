import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { parseRequirementRef } from '@/app/api/requirements/parse-requirement-ref'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { requirementRefSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { readRequirementDetail } from '@/lib/requirements/read-detail'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import { createServerComponentRequestContext } from '@/lib/requirements/server-component-context'

export async function requirementMetadata({
  id,
  version,
  versionId,
}: {
  id: string
  version?: string
  versionId?: string
}): Promise<Metadata> {
  const t = await getTranslations('nav')
  const fallback = { title: t('catalog') }
  const parsed = requirementRefSchema.safeParse(id)
  if (!parsed.success) return fallback

  const context = await createServerComponentRequestContext({
    path: `/requirements/${id}`,
  })
  try {
    const runtime = createRequirementsRuntime(
      await getRequestSqlServerDataSource(),
    )
    const { requirement } = await readRequirementDetail(
      runtime,
      context,
      parseRequirementRef(parsed.data),
    )
    const { uniqueId } = requirement
    if (version === undefined)
      return { title: t('requirementTitle', { uniqueId }) }
    const selected = requirement.versions.find(
      v => v.versionNumber === Number(version),
    )
    if (
      !selected ||
      (versionId !== undefined && selected.id !== Number(versionId))
    )
      return fallback
    return {
      title: t('requirementVersionTitle', {
        uniqueId,
        version: selected.versionNumber,
      }),
    }
  } catch (error) {
    if (!isRequirementsServiceError(error) || error.status >= 500) {
      logSanitizedError('Failed to resolve requirement title', error)
    }
    return fallback
  }
}
