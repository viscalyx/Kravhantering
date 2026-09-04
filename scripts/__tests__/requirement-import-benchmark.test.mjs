import { describe, expect, it } from 'vitest'
import {
  assertBoundedBenchmarkEvidence,
  classifyDatabaseOutcome,
  createScreeningMatrix,
  summarizeDurations,
} from '../lib/requirement-import-benchmark.mjs'

describe('requirement import benchmark helpers', () => {
  it('builds the complete REST and MCP screening matrix', () => {
    const matrix = createScreeningMatrix()

    expect(matrix).toHaveLength(40)
    expect(matrix[0]).toEqual({
      destination: 'requirements_library',
      rowCount: 1,
      rowShape: 'light',
      source: 'rest',
    })
    expect(matrix.at(-1)).toEqual({
      destination: 'requirements_specification',
      rowCount: 500,
      rowShape: 'maximum-related',
      source: 'mcp',
    })
    expect(new Set(matrix.map(entry => JSON.stringify(entry))).size).toBe(40)
  })

  it('reports nearest-rank transaction-duration statistics', () => {
    expect(summarizeDurations([8, 1, 5, 3, 13])).toEqual({
      maximumMs: 13,
      p50Ms: 5,
      p95Ms: 13,
    })
  })

  it.each([
    [{ number: 1205 }, 'deadlock'],
    [{ originalError: { number: 1222 } }, 'lock_timeout'],
    [
      new Error('Failed to acquire MCP import-validation quota lock'),
      'application_lock_timeout',
    ],
    [{ code: 'ETIMEOUT' }, 'statement_timeout'],
    [new Error('unrelated failure'), 'failure'],
  ])('classifies bounded database outcomes', (error, expected) => {
    expect(classifyDatabaseOutcome(error)).toBe(expected)
  })

  it('rejects evidence containing sensitive identifiers or payload fields', () => {
    expect(() =>
      assertBoundedBenchmarkEvidence({
        destinationId: 42,
        operation: 'rest-library-import',
      }),
    ).toThrow('destinationId')
    expect(() =>
      assertBoundedBenchmarkEvidence({
        operation: 'rest-library-import',
        sqlText: 'SELECT secret',
      }),
    ).toThrow('sqlText')
  })

  it('accepts aggregate timings and bounded lock evidence', () => {
    expect(() =>
      assertBoundedBenchmarkEvidence({
        failureCounts: {
          deadlock: 0,
          failure: 0,
          lock_timeout: 0,
          statement_timeout: 0,
        },
        lockEvidence: [{ maximumWaitMs: 18, samples: 4, waitType: 'LCK_M_U' }],
        operation: 'rest-library-import',
        rowCount: 500,
      }),
    ).not.toThrow()
  })
})
