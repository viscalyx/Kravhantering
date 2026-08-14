export interface McpImportValidationStorageInput {
  creatorPrincipalFingerprint: string
  destinationKind: string
  destinationSnapshotJson: string
  payloadHash: string
  referenceDataFingerprint: string
  submittedPayloadJson: string
  tokenHash: string
  validatedRowCount: number
  validationResultJson: string
}

const EXECUTION_RECEIPT_BASE_BYTES = 1024
const EXECUTION_RECEIPT_BYTES_PER_ROW = 2048
const FIXED_AND_ROW_OVERHEAD_BYTES = 256

export const MCP_IMPORT_VALIDATION_MINIMUM_RESERVED_BYTES =
  EXECUTION_RECEIPT_BASE_BYTES + FIXED_AND_ROW_OVERHEAD_BYTES

function sqlServerNvarcharBytes(value: string): number {
  return Buffer.byteLength(value, 'utf16le')
}

export function maximumMcpImportExecutionReceiptBytes(
  validatedRowCount: number,
): number {
  if (!Number.isInteger(validatedRowCount) || validatedRowCount < 0) {
    throw new Error('Validated MCP import row count must be non-negative')
  }
  return (
    EXECUTION_RECEIPT_BASE_BYTES +
    validatedRowCount * EXECUTION_RECEIPT_BYTES_PER_ROW
  )
}

export function calculateMcpImportValidationSessionReservedBytes(
  input: McpImportValidationStorageInput,
): number {
  const initialTextBytes = [
    input.creatorPrincipalFingerprint,
    input.destinationKind,
    input.destinationSnapshotJson,
    input.payloadHash,
    input.referenceDataFingerprint,
    input.submittedPayloadJson,
    input.tokenHash,
    input.validationResultJson,
  ].reduce((total, value) => total + sqlServerNvarcharBytes(value), 0)

  return (
    initialTextBytes +
    FIXED_AND_ROW_OVERHEAD_BYTES +
    maximumMcpImportExecutionReceiptBytes(input.validatedRowCount)
  )
}
