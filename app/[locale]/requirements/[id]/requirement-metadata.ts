import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { parseRequirementRef } from '@/app/api/requirements/parse-requirement-ref'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { requirementRefSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import { createServerComponentRequestContext } from '@/lib/requirements/server-component-context'

import { findRequestedVersion } from './_detail/version-state'

export async function requirementMetadata({
  id,
  locale,
  version,
  versionId,
}: {
  id: string
  locale: string
  version?: string
  versionId?: string
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'nav' })
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
    const { requirement } = await runtime.service.getRequirement(context, {
      ...parseRequirementRef(parsed.data),
      view: 'accessible',
    })
    const { uniqueId } = requirement
    if (version === undefined)
      return { title: t('recordTitles.requirement', { uniqueId }) }
    const selected = findRequestedVersion(
      requirement.versions,
      Number(version),
      versionId == null ? undefined : Number(versionId),
    )
    if (!selected) return fallback
    return {
      title: t('recordTitles.requirementVersion', {
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
