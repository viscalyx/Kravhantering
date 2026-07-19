import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  APPLICATION_SETTING_CONSTRAINTS,
  type ApplicationSettingField,
} from '@/lib/application-settings'
import {
  getAdminApplicationSettings,
  updateApplicationSetting,
} from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

const applicationSettingsPatchSchema = z
  .object({
    csvExportConcurrencyPerNode: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.csvExportConcurrencyPerNode.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.csvExportConcurrencyPerNode.max)
      .optional(),
    csvExportMaxFileBytes: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.max)
      .multipleOf(APPLICATION_SETTING_CONSTRAINTS.csvExportMaxFileBytes.step)
      .optional(),
    csvExportMaxRequirements: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.csvExportMaxRequirements.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.csvExportMaxRequirements.max)
      .optional(),
    csvExportTimeoutSeconds: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.csvExportTimeoutSeconds.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.csvExportTimeoutSeconds.max)
      .optional(),
    pdfReportConcurrencyPerNode: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.pdfReportConcurrencyPerNode.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.pdfReportConcurrencyPerNode.max)
      .optional(),
    pdfReportMaxFileBytes: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxFileBytes.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxFileBytes.max)
      .multipleOf(APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxFileBytes.step)
      .optional(),
    pdfReportMaxRequirements: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxRequirements.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.pdfReportMaxRequirements.max)
      .optional(),
    pdfReportTimeoutSeconds: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.pdfReportTimeoutSeconds.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.pdfReportTimeoutSeconds.max)
      .optional(),
    pdfWorkerMemoryMib: z
      .number()
      .int()
      .min(APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.min)
      .max(APPLICATION_SETTING_CONSTRAINTS.pdfWorkerMemoryMib.max)
      .optional(),
  })
  .strict()
  .refine(body => Object.keys(body).length === 1, {
    message: 'Expected exactly one application setting.',
  })

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function assertAdmin(request: Request): Promise<void> {
  const context = await createRequestContext(request, 'rest')
  if (!context.actor.roles.includes('Admin')) {
    throw forbiddenError('Missing required role for application settings', {
      actorRoles: context.actor.roles,
      reason: 'required_role_missing',
      requiredRoles: ['Admin'],
    })
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await assertAdmin(request)
    const db = await getRequestSqlServerDataSource()
    return noStore(NextResponse.json(await getAdminApplicationSettings(db)))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    console.error('Failed to load application settings', error)
    return noStore(
      NextResponse.json(
        { error: 'Failed to load application settings.' },
        { status: 500 },
      ),
    )
  }
}

export const PATCH = secureMutationRoute({
  bodySchema: applicationSettingsPatchSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const [field, value] = Object.entries(body)[0] as [
        ApplicationSettingField,
        number,
      ]
      const db = await getRequestSqlServerDataSource()
      const update = await updateApplicationSetting(db, field, value, {
        audit: (executor, change) =>
          recordAdminPrivilegedActionSucceeded(
            context,
            {
              changedFields: [change.field],
              details: {
                newValue: change.newValue,
                oldValue: change.oldValue,
              },
              operation: 'update',
              resourceId: 'global',
              resourceType: 'application_settings',
            },
            executor,
          ),
      })
      return noStore(NextResponse.json(update))
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(body, { status }))
      }
      console.error('Failed to update application settings', error)
      return noStore(
        NextResponse.json(
          { error: 'Failed to save application settings.' },
          { status: 500 },
        ),
      )
    }
  },
})
