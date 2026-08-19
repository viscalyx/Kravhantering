import type {
  AiAdminConnectionAdapter,
  AiAdminConnectionAdapterRegistration,
} from './admin-adapter'
import {
  CONTROLLED_TEST_ADAPTER_TYPE,
  CONTROLLED_TEST_ADAPTER_VERSION,
} from './controlled-test-adapter'

const controlledTestAdminAdapter: AiAdminConnectionAdapter = {
  async fetchCatalog(context) {
    return context.connection.models.flatMap(model =>
      model.revisions.slice(0, 1).map(revision => ({
        capabilities:
          revision.discoveredCapabilities ?? revision.declaredCapabilities,
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
        name: model.name,
      })),
    )
  },
  async probeConnection() {
    return {
      details: { adapterReachable: true },
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'controlled-test-admin-v1',
    }
  },
  async probeHealth() {
    return 'healthy'
  },
  async verifyModelRevision(_context, revision) {
    return {
      details: { modelResolved: true },
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'controlled-test-admin-v1',
      verifiedCapabilities:
        revision.discoveredCapabilities ?? revision.declaredCapabilities,
    }
  },
  async verifySecretCandidate(context) {
    if (
      context.connection.authenticationType !== 'none' &&
      !context.credential
    ) {
      throw new Error('The controlled test credential is empty.')
    }
  },
}

export const controlledTestAdminAdapterRegistration = Object.freeze({
  adapter: controlledTestAdminAdapter,
  adapterType: CONTROLLED_TEST_ADAPTER_TYPE,
  adapterVersion: CONTROLLED_TEST_ADAPTER_VERSION,
}) satisfies AiAdminConnectionAdapterRegistration
