export const AI_DEMO_SEED_CONNECTION_ID = '20000000-0000-4000-8000-000000000001'

export type AiConnectionProvenance = 'administrator' | 'demo_seed'

export function aiConnectionProvenance(
  connectionId: string,
): AiConnectionProvenance {
  return connectionId.toLowerCase() === AI_DEMO_SEED_CONNECTION_ID
    ? 'demo_seed'
    : 'administrator'
}
