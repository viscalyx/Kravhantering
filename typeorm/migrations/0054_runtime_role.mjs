import {
  buildRuntimePermissionReconcileSql,
  buildRuntimeRoleDropSql,
  RUNTIME_PERMISSION_MANIFEST,
} from '../runtime-permission-manifest.mjs'

const MCP_QUOTA_COLUMNS = new Set([
  'mcp_import_max_active_sessions_per_destination',
  'mcp_import_max_active_sessions_per_principal',
  'mcp_import_max_creations_per_window',
  'mcp_import_max_reserved_bytes',
])
const RUNTIME_PERMISSION_MANIFEST_AT_0054 = RUNTIME_PERMISSION_MANIFEST.filter(
  entry => entry.object !== 'dbo.requirement_import_validation_rate_buckets',
).map(entry =>
  entry.object === 'dbo.ai_settings'
    ? {
        ...entry,
        updateColumns: entry.updateColumns.filter(
          column => !MCP_QUOTA_COLUMNS.has(column),
        ),
      }
    : entry,
)

const UP_STATEMENTS = [
  buildRuntimePermissionReconcileSql(RUNTIME_PERMISSION_MANIFEST_AT_0054),
]
const DOWN_STATEMENTS = [buildRuntimeRoleDropSql()]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RuntimeRole1720100000000 {
  name = 'RuntimeRole1720100000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default RuntimeRole1720100000000
