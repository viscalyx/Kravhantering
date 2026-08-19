import type { RequestContext } from '@/lib/requirements/auth'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import type { SqlServerDatabase } from '@/lib/db'
import { createSqlServerAiAdminStore } from '@/lib/dal/ai-connection-admin'
import {
  AiConnectionAdministrationService,
  type AiAdminExternalOperations,
  unavailableAiAdminExternalOperations,
} from './admin-service'
import {
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
  const external =
    options.external ?? unavailableAiAdminExternalOperations()
  const keyring = () => loadAiProviderSecretKeyring()
  return new AiConnectionAdministrationService({
    audit: detail =>
      recordAdminPrivilegedActionSucceeded(
        context,
        {
          changedFields: detail.changedFields,
          operation: detail.operation,
          resourceId: detail.resourceId,
          resourceType: detail.resourceType,
        },
      ),
    external,
    secrets: {
      activateCandidate: input =>
        new AiProviderSecretService(db, keyring(), {
          verifyCandidate: (candidateContext, plaintext) =>
            external.verifySecretCandidate(candidateContext, plaintext),
        }).activateCandidate(input),
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
        confirmAiProviderSecretRevocation(db, input),
      deleteCandidate: input => deleteAiProviderSecretCandidate(db, input),
      writeCandidate: input =>
        writeAiProviderSecretCandidate(db, keyring(), input),
    },
    store: createSqlServerAiAdminStore(db),
  })
}
