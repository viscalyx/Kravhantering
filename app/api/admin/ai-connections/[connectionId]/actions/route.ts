import { NextResponse } from 'next/server'
import {
  aiConnectionActionSchema,
  aiConnectionParamsSchema,
} from '@/lib/ai/admin-contracts'
import { createAiConnectionAdministrationRuntime } from '@/lib/ai/admin-runtime'
import { assertAiStagingLiveVerificationAllowed } from '@/lib/ai/staging-live-policy'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'

export const POST = secureMutationRoute({
  bodySchema: aiConnectionActionSchema,
  errorMessage: 'Failed to perform AI connection action.',
  handlerErrorDetails: 'ai_admin_model_dependencies',
  paramsSchema: aiConnectionParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params, request }) => {
    if (body.action === 'verify_live_path') {
      assertAiStagingLiveVerificationAllowed(body.expectedEnvironmentId)
    }
    const db = await getRequestSqlServerDataSource()
    const service = createAiConnectionAdministrationRuntime(db, context)
    const connectionId = params.connectionId
    switch (body.action) {
      case 'activate_secret':
        return NextResponse.json(
          await service.activateSecret({
            connectionConfigurationVersion: body.connectionConfigurationVersion,
            connectionId,
            connectionRevisionToken: body.connectionRevisionToken,
            secretVersionId: body.secretVersionId,
          }),
        )
      case 'attest':
        return NextResponse.json(
          await service.saveAttestation({
            attestation: body.attestation,
            connectionId,
            currentAttestationRevisionToken:
              body.currentAttestationRevisionToken,
            makeValid: true,
          }),
        )
      case 'confirm_secret_revocation':
        return NextResponse.json(
          await service.confirmSecretRevocation(
            connectionId,
            body.secretVersionId,
          ),
        )
      case 'delete_secret_candidate':
        await service.deleteSecretCandidate(connectionId, body.secretVersionId)
        return new NextResponse(null, { status: 204 })
      case 'delete_model_revision':
        await service.deleteModelRevision({
          connectionId,
          modelRevisionId: body.modelRevisionId,
          revisionToken: body.revisionToken,
        })
        return new NextResponse(null, { status: 204 })
      case 'discard_model_verification':
        service.discardModelVerification(body.attemptId)
        return new NextResponse(null, { status: 204 })
      case 'discard_attestation_draft':
        await service.discardAttestationDraft({
          connectionId,
          currentAttestationRevisionToken: body.currentAttestationRevisionToken,
          draftAttestationId: body.draftAttestationId,
          draftAttestationRevisionToken: body.draftAttestationRevisionToken,
        })
        return new NextResponse(null, { status: 204 })
      case 'fetch_catalog':
        return NextResponse.json(await service.fetchCatalog(connectionId))
      case 'probe_health':
        return NextResponse.json(
          await service.probeHealth({
            connectionId,
            modelRevisionId: body.modelRevisionId,
            revisionToken: body.revisionToken,
          }),
        )
      case 'save_attestation':
        return NextResponse.json(
          await service.saveAttestation({
            attestation: body.attestation,
            connectionId,
            makeValid: false,
          }),
        )
      case 'save_model_revision':
        return NextResponse.json(
          await service.saveModelRevision({
            connectionId,
            modelRevision: body.modelRevision,
          }),
        )
      case 'end_model_revision':
        return NextResponse.json(
          await service.endModelRevision({
            connectionId,
            modelRevisionId: body.modelRevisionId,
            revisionToken: body.revisionToken,
          }),
        )
      case 'set_lifecycle':
        return NextResponse.json(
          await service.setConnectionLifecycle({
            connectionId,
            revisionToken: body.revisionToken,
            status: body.status,
          }),
        )
      case 'verify_model_candidate': {
        const encoder = new TextEncoder()
        const verificationAbort = new AbortController()
        const abortVerification = (): void => verificationAbort.abort()
        if (request.signal.aborted) abortVerification()
        else
          request.signal.addEventListener('abort', abortVerification, {
            once: true,
          })
        let streamInactive = false
        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            streamInactive = true
            abortVerification()
          },
          async start(controller) {
            const send = (value: unknown): void => {
              if (streamInactive) return
              try {
                controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
              } catch {
                streamInactive = true
                abortVerification()
              }
            }
            try {
              const result = await service.verifyModelCandidate({
                candidate: {
                  externalModelId: body.externalModelId,
                  externalModelVersion: body.externalModelVersion,
                },
                connectionId,
                onProgress: progress => send({ progress, type: 'progress' }),
                signal: verificationAbort.signal,
              })
              send({ result, type: 'completed' })
            } catch {
              send({
                error: 'Model verification could not be completed.',
                type: 'failed',
              })
            } finally {
              request.signal.removeEventListener('abort', abortVerification)
              if (!streamInactive) {
                try {
                  controller.close()
                } catch {
                  // The response consumer may cancel between the final send and close.
                }
              }
              streamInactive = true
            }
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
          },
        })
      }
      case 'verify_live_path':
        return NextResponse.json(
          await service.verifyLivePath({
            connectionId,
            expectedEnvironmentId: body.expectedEnvironmentId,
            modelRevisionId: body.modelRevisionId,
            profileKey: body.profileKey,
          }),
        )
      case 'write_secret':
        return NextResponse.json(
          await service.writeSecret(connectionId, body.secret),
          { status: 201 },
        )
    }
  },
})
