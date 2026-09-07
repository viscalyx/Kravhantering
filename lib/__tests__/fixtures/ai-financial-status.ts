import type { AiConnectionFinancialStatus } from '@/lib/ai/financial-contracts'

export const FINANCIAL_STATUS: AiConnectionFinancialStatus = {
  capabilities: {
    support: 'partial',
    operations: [
      {
        id: 'account_credits',
        scope: 'account',
        credentialPurpose: 'management',
        fields: ['purchased_credits', 'usage', 'credit_balance'],
      },
      {
        id: 'current_credential',
        scope: 'credential',
        credentialPurpose: 'runtime',
        fields: ['usage', 'spending_limit', 'remaining_allowance'],
      },
    ],
  },
  managementCredential: { active: null, candidates: [] },
  results: [
    {
      operation: {
        id: 'account_credits',
        scope: 'account',
        credentialPurpose: 'management',
        fields: ['purchased_credits', 'usage', 'credit_balance'],
      },
      binding: null,
      state: 'missing_credential',
      lastSuccessfulAt: null,
      snapshot: null,
    },
    {
      operation: {
        id: 'current_credential',
        scope: 'credential',
        credentialPurpose: 'runtime',
        fields: ['usage', 'spending_limit', 'remaining_allowance'],
      },
      binding: 'runtime-connection-one-v1',
      state: 'success',
      lastSuccessfulAt: '2026-09-07T10:00:00.000Z',
      snapshot: {
        scope: 'credential',
        measurements: [
          {
            field: 'usage',
            amount: '25.5',
            currency: 'USD',
            state: 'available',
            period: 'lifetime',
          },
          {
            field: 'spending_limit',
            amount: null,
            currency: 'USD',
            state: 'unlimited',
            period: 'lifetime',
          },
          {
            field: 'remaining_allowance',
            amount: null,
            currency: 'USD',
            state: 'unavailable',
            period: 'unknown',
          },
        ],
      },
    },
  ],
}
