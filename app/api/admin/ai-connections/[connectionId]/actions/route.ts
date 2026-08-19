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
  paramsSchema: aiConnectionParamsSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
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
      case 'retire_model_revision':
        return NextResponse.json(
          await service.retireModelRevision({
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
      case 'verify_connection':
        return NextResponse.json(await service.verifyConnection(connectionId))
      case 'verify_live_path':
        return NextResponse.json(
          await service.verifyLivePath({
            connectionId,
            expectedEnvironmentId: body.expectedEnvironmentId,
            modelRevisionId: body.modelRevisionId,
            profileRevisionId: body.profileRevisionId,
          }),
        )
      case 'verify_model_revision':
        return NextResponse.json(
          await service.verifyModelRevision({
            connectionId,
            modelRevisionId: body.modelRevisionId,
            revisionToken: body.revisionToken,
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
