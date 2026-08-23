import { randomUUID } from 'node:crypto'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/**
 * @param {(() => string) | undefined} uuid
 * @returns {string}
 */
export function createHsaCorrelationId(uuid = randomUUID) {
  const correlationId = uuid()
  if (!UUID_V4.test(correlationId)) {
    throw new Error('invalid_generated_correlation')
  }
  return correlationId
}
