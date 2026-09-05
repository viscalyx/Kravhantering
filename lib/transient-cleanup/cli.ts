import 'reflect-metadata'
import { readFile } from 'node:fs/promises'
import { createSqlServerDataSource } from '../typeorm/sqlserver-config'
import { parseCleanupCompatibilityContract } from './compatibility'
import { createTransientCleanupTargets } from './registry'
import type { TransientCleanupQueryExecutor } from './requirement-import-validation-sessions'
import {
  runTransientStateCleanup,
  type TransientCleanupLogEvent,
  type TransientCleanupTarget,
} from './runner'
import { cleanupSchemaFingerprint } from './schema'

const DEFAULT_BACKLOG_TARGET = 0
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_WORK_LIMIT = 1000

interface CleanupConnection {
  destroy(): Promise<void>
  executor: TransientCleanupQueryExecutor
}

type CleanupEnv = Partial<NodeJS.ProcessEnv>

export interface TransientCleanupCommandDependencies {
  connect?: () => Promise<CleanupConnection>
  createTargets?: (
    executor: TransientCleanupQueryExecutor,
  ) => TransientCleanupTarget[]
  env?: CleanupEnv
  readContract?: (path: string) => Promise<unknown>
  write?: (line: string) => void
}

interface CleanupCommandConfig {
  backlogTarget: number
  batchSize: number
  workLimit: number
}

interface SafeCommandEvent {
  channel: 'transient-cleanup'
  deleted_rows: number
  duration_ms: number
  event:
    | 'transient_cleanup.run.completed'
    | 'transient_cleanup.target.completed'
  expired_row_count: number | null
  expired_stored_bytes: number | null
  failure_code?: 'runner_execution_failed' | 'target_execution_failed'
  kind: string
  level: 'error' | 'info'
  oldest_expired_age_ms: number | null
  operation: 'transient_state_cleanup'
  outcome: 'failure' | 'success' | 'not_applicable'
  remaining_expired_row_count: number | null
  timestamp: string
}

function parseInteger(
  env: CleanupEnv,
  key: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[key]?.trim()
  if (!raw) return defaultValue
  if (!/^\d+$/u.test(raw)) throw new Error('invalid cleanup configuration')
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error('invalid cleanup configuration')
  }
  return value
}

function readConfig(env: CleanupEnv): CleanupCommandConfig {
  return {
    backlogTarget: parseInteger(
      env,
      'TRANSIENT_CLEANUP_BACKLOG_TARGET',
      DEFAULT_BACKLOG_TARGET,
      0,
      1_000_000,
    ),
    batchSize: parseInteger(
      env,
      'TRANSIENT_CLEANUP_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      500,
    ),
    workLimit: parseInteger(
      env,
      'TRANSIENT_CLEANUP_WORK_LIMIT',
      DEFAULT_WORK_LIMIT,
      1,
      100_000,
    ),
  }
}

async function connect(): Promise<CleanupConnection> {
  const dataSource = createSqlServerDataSource({ entities: [], logging: false })
  await dataSource.initialize()
  return { destroy: () => dataSource.destroy(), executor: dataSource }
}

function safeEvent(event: TransientCleanupLogEvent): SafeCommandEvent {
  return {
    channel: 'transient-cleanup',
    deleted_rows: event.deletedRows,
    duration_ms: event.durationMs,
    event: event.event,
    expired_row_count: event.expiredRowCount,
    expired_stored_bytes: event.expiredStoredBytes,
    ...(event.failureCode ? { failure_code: event.failureCode } : {}),
    kind: event.kind,
    level: event.outcome === 'failure' ? 'error' : 'info',
    oldest_expired_age_ms: event.oldestExpiredAgeMs,
    operation: event.operation,
    outcome: event.outcome,
    remaining_expired_row_count: event.remainingExpiredRowCount,
    timestamp: new Date().toISOString(),
  }
}

function runnerFailureEvent(): SafeCommandEvent {
  return {
    channel: 'transient-cleanup',
    deleted_rows: 0,
    duration_ms: 0,
    event: 'transient_cleanup.run.completed',
    expired_row_count: null,
    expired_stored_bytes: null,
    failure_code: 'runner_execution_failed',
    kind: 'all',
    level: 'error',
    oldest_expired_age_ms: null,
    operation: 'transient_state_cleanup',
    outcome: 'failure',
    remaining_expired_row_count: null,
    timestamp: new Date().toISOString(),
  }
}

export async function runTransientCleanupCommand(
  args: readonly string[],
  dependencies: TransientCleanupCommandDependencies = {},
): Promise<number> {
  const write = dependencies.write ?? (line => console.info(line))
  if (args.length === 1 && args[0] === '--help') {
    write(
      'Usage: node transient-cleanup/lib/transient-cleanup/cli.js [--contract <path> | --validate-contract <path> | --compatibility-evidence]',
    )
    return 0
  }
  const readContract =
    dependencies.readContract ??
    (async (file: string) => JSON.parse(await readFile(file, 'utf8')))
  if (args.length === 2 && args[0] === '--validate-contract') {
    try {
      parseCleanupCompatibilityContract(await readContract(args[1]))
      write(
        JSON.stringify({
          event: 'transient_cleanup.contract.verified',
          outcome: 'success',
        }),
      )
      return 0
    } catch {
      write(JSON.stringify(runnerFailureEvent()))
      return 1
    }
  }
  const collectingEvidence =
    args.length === 1 && args[0] === '--compatibility-evidence'
  const contractPath =
    args.length === 2 && args[0] === '--contract' ? args[1] : undefined
  if (args.length > 0 && !collectingEvidence && !contractPath) {
    write(JSON.stringify(runnerFailureEvent()))
    return 1
  }

  let connection: CleanupConnection | null = null
  let exitCode = 1
  try {
    const config = readConfig(dependencies.env ?? process.env)
    connection = await (dependencies.connect ?? connect)()
    let schemaVersion: string | undefined
    let schemaFingerprint: string | undefined
    if (collectingEvidence || contractPath) {
      const rows = await connection.executor.query<{ name: string }[]>(
        'SELECT TOP (1) name FROM dbo.migrations ORDER BY id DESC',
      )
      schemaVersion = rows[0]?.name
      if (!schemaVersion || !/^[a-zA-Z0-9]{1,200}$/.test(schemaVersion)) {
        throw new Error('unknown cleanup schema')
      }
      schemaFingerprint = await cleanupSchemaFingerprint(connection.executor)
    }
    const contract = contractPath
      ? parseCleanupCompatibilityContract(await readContract(contractPath))
      : undefined
    const verifiedSchema = contract?.verification.find(
      schema => schema.schemaVersion === schemaVersion,
    )
    if (
      contract &&
      (!verifiedSchema ||
        verifiedSchema.schemaFingerprint !== schemaFingerprint)
    )
      throw new Error('unverified cleanup schema')
    const targets = (
      dependencies.createTargets ?? createTransientCleanupTargets
    )(connection.executor)
    if (verifiedSchema) {
      for (const target of targets) {
        const isApplicable = target.isApplicable
        const expected = verifiedSchema.targets.find(
          item => item.kind === target.kind,
        )
        target.isApplicable = async () => {
          const applicable = isApplicable ? await isApplicable() : true
          if (!expected || applicable !== (expected.outcome === 'success')) {
            throw new Error('cleanup schema differs from verified release')
          }
          return applicable
        }
      }
    }
    const result = await runTransientStateCleanup(targets, {
      ...config,
      record: event => write(JSON.stringify(safeEvent(event))),
    })
    exitCode = result.outcome === 'success' ? 0 : 1
    if (collectingEvidence && exitCode === 0) {
      write(
        JSON.stringify({
          event: 'transient_cleanup.schema.verified',
          schemaVersion,
          schemaFingerprint,
          outcome: result.outcome,
          targets: result.targets.map(target => ({
            kind: target.kind,
            outcome: target.outcome,
          })),
        }),
      )
    }
  } catch {
    write(JSON.stringify(runnerFailureEvent()))
    exitCode = 1
  } finally {
    if (connection) {
      try {
        await connection.destroy()
      } catch {
        if (exitCode === 0) write(JSON.stringify(runnerFailureEvent()))
        exitCode = 1
      }
    }
  }
  return exitCode
}

export async function setTransientCleanupProcessExitCode(
  command: Promise<number>,
): Promise<void> {
  try {
    process.exitCode = await command
  } catch {
    process.exitCode = 1
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void setTransientCleanupProcessExitCode(
    runTransientCleanupCommand(process.argv.slice(2)),
  )
}
