import { describe, expect, it } from 'vitest'
import {
  calculateMcpImportValidationSessionReservedBytes,
  maximumMcpImportExecutionReceiptBytes,
} from '@/lib/mcp/import-validation-storage'

describe('MCP import-validation storage reservation', () => {
  it('covers all initial persisted text plus a conservative maximum receipt', () => {
    const input = {
      creatorPrincipalFingerprint: 'a'.repeat(64),
      destinationKind: 'requirements_library',
      destinationSnapshotJson: '{"areaId":7}',
      payloadHash: 'b'.repeat(64),
      referenceDataFingerprint: 'c'.repeat(64),
      submittedPayloadJson: '{"requirements":[{"description":"One"}]}',
      tokenHash: 'd'.repeat(64),
      validatedRowCount: 1,
      validationResultJson: '{"rows":[{"sourceIndex":0}]}',
    }
    const initialTextBytes = Object.entries(input)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      .reduce(
        (total, [, value]) => total + Buffer.byteLength(value, 'utf16le'),
        0,
      )

    expect(
      calculateMcpImportValidationSessionReservedBytes(input),
    ).toBeGreaterThanOrEqual(
      initialTextBytes + maximumMcpImportExecutionReceiptBytes(1),
    )
  })

  it('reserves receipt capacity for every validated row', () => {
    const base = {
      creatorPrincipalFingerprint: 'a'.repeat(64),
      destinationKind: 'requirements_specification',
      destinationSnapshotJson: '{}',
      payloadHash: 'b'.repeat(64),
      referenceDataFingerprint: 'c'.repeat(64),
      submittedPayloadJson: '{}',
      tokenHash: 'd'.repeat(64),
      validationResultJson: '{"rows":[]}',
    }

    expect(
      calculateMcpImportValidationSessionReservedBytes({
        ...base,
        validatedRowCount: 2,
      }) -
        calculateMcpImportValidationSessionReservedBytes({
          ...base,
          validatedRowCount: 1,
        }),
    ).toBe(2048)
  })

  it.each([-1, 1.5])(
    'rejects invalid validated row count %s',
    validatedRowCount => {
      expect(() =>
        maximumMcpImportExecutionReceiptBytes(validatedRowCount),
      ).toThrow('must be non-negative')
    },
  )
})
