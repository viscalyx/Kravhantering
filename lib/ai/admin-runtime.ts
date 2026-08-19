import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import { createProductionAiAdminExternalOperations } from './admin-external'
import {
  type AiAdminExternalOperations,
  AiConnectionAdministrationService,
} from './admin-service'
import {
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
  loadAiProviderSecretKeyring,
} from './provider-secret-keyring'
import {
  AiProviderSecretService,
  confirmAiProviderSecretRevocation,
  deleteAiProviderSecretCandidate,
  getAiProviderSecretAvailability,
  writeAiProviderSecretCandidate,
} from './provider-secret-service'

export interface CreateAiConnectionAdministrationRuntimeOptions {
  external?: AiAdminExternalOperations
}

/**
 * Server-only composition root. Provider-specific probing is installed as a
 * trusted adapter dependency; route handlers never receive plaintext secrets
 * or provider-specific configuration.
 */
export function createAiConnectionAdministrationRuntime(
  db: SqlServerDatabase,
  context: RequestContext,
  options: CreateAiConnectionAdministrationRuntimeOptions = {},
): AiConnectionAdministrationService {
  const keyring = (): AiProviderSecretKeyring => loadAiProviderSecretKeyring()
  const external =
    options.external ?? createProductionAiAdminExternalOperations(db, keyring)
  const audit = (
    detail: Parameters<typeof recordAdminPrivilegedActionSucceeded>[1],
    executor?: Parameters<typeof recordAdminPrivilegedActionSucceeded>[2],
  ): Promise<void> =>
    recordAdminPrivilegedActionSucceeded(context, detail, executor)
  return new AiConnectionAdministrationService({
    audit,
    external,
    secrets: {
      activateCandidate: input =>
        new AiProviderSecretService(
          db,
          keyring(),
          {
            verifyCandidate: (candidateContext, plaintext) =>
              external.verifySecretCandidate(
                input.connection,
                candidateContext,
                plaintext,
              ),
          },
          executor =>
            audit(
              {
                operation: 'activate',
                resourceId: input.connectionId,
                resourceType: 'ai_provider_secret',
              },
              executor,
            ),
        ).activateCandidate({
          connectionId: input.connectionId,
          secretVersionId: input.secretVersionId,
        }),
      availability: async connectionId => {
        try {
          return await getAiProviderSecretAvailability(
            db,
            keyring(),
            connectionId,
          )
        } catch (error) {
          if (!(error instanceof AiProviderSecretKeyringError)) throw error
          // Administrative metadata remains readable when deployment key
          // material is absent, but activation fails closed with a blocker.
          return {
            available: false,
            reason: 'root_key_version_missing',
          }
        }
      },
      confirmRevocation: input =>
        confirmAiProviderSecretRevocation(db, input, executor =>
          audit(
            {
              operation: 'delete',
              resourceId: input.connectionId,
              resourceType: 'ai_provider_secret',
            },
            executor,
          ),
        ),
      deleteCandidate: input =>
        deleteAiProviderSecretCandidate(db, input, executor =>
          audit(
            {
              operation: 'delete',
              resourceId: input.connectionId,
              resourceType: 'ai_provider_secret',
            },
            executor,
          ),
        ),
      writeCandidate: input =>
        writeAiProviderSecretCandidate(db, keyring(), input, executor =>
          audit(
            {
              operation: 'rotate',
              resourceId: input.connectionId,
              resourceType: 'ai_provider_secret',
            },
            executor,
          ),
        ),
    },
    store: createSqlServerAiAdminStore(db, audit),
  })
}
