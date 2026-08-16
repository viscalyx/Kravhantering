import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AI_FORENSIC_OPERATIONS,
  authorizeAiForensicCaptureTransition,
  createAiForensicCaptureRequest,
  listAiForensicCaptureMetadata,
  readStoppedAiForensicCaptureEvidence,
  transitionAiForensicCapture,
} from '@/lib/ai/forensic-capture'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import {
  adminMutationPolicy,
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseSearchParams, positiveIntegerSchema } from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

const captureReadSchema = z
  .object({ captureWindowId: z.coerce.number().int().positive().optional() })
  .strict()

async function getHandler(request: NextRequest) {
  const parsed = parseSearchParams(
    request.nextUrl.searchParams,
    captureReadSchema,
  )
  if (!parsed.ok) return parsed.response
  try {
    const context = await createRequestContext(request, 'rest')
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json(
      parsed.data.captureWindowId == null
        ? {
            canPurge: context.actor.roles.includes('PrivacyOfficer'),
            captures: await listAiForensicCaptureMetadata(db, context),
          }
        : await readStoppedAiForensicCaptureEvidence(
            db,
            context,
            parsed.data.captureWindowId,
          ),
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    console.error('Failed to read AI forensic evidence', {
      errorKind: error instanceof Error ? 'Error' : 'NonError',
    })
    return NextResponse.json(
      { error: 'Failed to read AI forensic evidence.' },
      { status: 500 },
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)

const captureRequestSchema = z
  .object({
    direction: z.enum(['input', 'output']),
    expiresAt: z.iso.datetime({ offset: true }),
    operation: z.enum(AI_FORENSIC_OPERATIONS),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: captureRequestSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const result = await createAiForensicCaptureRequest(db, context, body)
    return NextResponse.json(result, { status: 201 })
  },
})

const captureTransitionSchema = z
  .object({
    action: z.enum(['approve', 'purge', 'stop']),
    captureWindowId: positiveIntegerSchema,
  })
  .strict()
type CaptureTransitionBody = z.infer<typeof captureTransitionSchema>

export const PATCH = secureMutationRoute({
  bodySchema: captureTransitionSchema,
  policy: customMutationPolicy<CaptureTransitionBody>(
    'admin.ai_forensic_capture.transition',
    ({ body, context }) => {
      authorizeAiForensicCaptureTransition(context, body.action)
    },
  ),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json(
      await transitionAiForensicCapture(db, context, body),
    )
  },
})
