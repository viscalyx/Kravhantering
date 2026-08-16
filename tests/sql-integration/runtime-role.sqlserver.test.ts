import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createArea,
  deleteArea,
  listAreas,
  updateArea,
} from '@/lib/dal/requirement-areas'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import {
  getSqlServerRuntimePermissionStatus,
  reconcileSqlServerRuntimePermissions,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  SQL_SERVER_RUNTIME_ROLE,
  seedSqlServerDatabase,
} from '@/scripts/db-sqlserver-admin.mjs'
import RuntimeRoleMigration from '@/typeorm/migrations/0054_runtime_role.mjs'
import { RUNTIME_PERMISSION_MANIFEST } from '@/typeorm/runtime-permission-manifest.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

const RUNTIME_LOGIN = 'kravhantering_runtime_test'
const RUNTIME_PASSWORD = 'RoleOnly!Passw0rd842'
const MIGRATION_LOGIN = 'kravhantering_migration_test'
const MIGRATION_PASSWORD = 'SchemaOnly!Passw0rd517'

function connectionStringFor(
  baseConnectionString: string,
  username: string,
  password: string,
  database?: string,
): string {
  const url = new URL(baseConnectionString)
  url.username = username
  url.password = password
  if (database) url.pathname = `/${encodeURIComponent(database)}`
  return url.toString()
}

describe('least-privilege SQL Server runtime role', () => {
  const adminConnectionString = resolveSqlIntegrationTestsUrl()
  const parsedAdminConnectionString = new URL(adminConnectionString)
  const adminUsername = decodeURIComponent(parsedAdminConnectionString.username)
  const adminPassword = decodeURIComponent(parsedAdminConnectionString.password)
  const integrationDatabase = decodeURIComponent(
    parsedAdminConnectionString.pathname.replace(/^\//u, ''),
  )
  const migrationProbeDatabase = `${integrationDatabase}_migration_identity`
  const migrationProbeAdminUrl = connectionStringFor(
    adminConnectionString,
    adminUsername,
    adminPassword,
    migrationProbeDatabase,
  )
  const migrationProbeUrl = connectionStringFor(
    adminConnectionString,
    MIGRATION_LOGIN,
    MIGRATION_PASSWORD,
    migrationProbeDatabase,
  )
  const masterDb = createAppDataSource({
    url: connectionStringFor(
      adminConnectionString,
      adminUsername,
      adminPassword,
      'master',
    ),
  })
  const adminDb = createAppDataSource({ url: adminConnectionString })
  const runtimeDb = createAppDataSource({
    url: connectionStringFor(
      adminConnectionString,
      RUNTIME_LOGIN,
      RUNTIME_PASSWORD,
    ),
  })
  const migrationDb = createAppDataSource({
    url: connectionStringFor(
      adminConnectionString,
      MIGRATION_LOGIN,
      MIGRATION_PASSWORD,
    ),
  })

  beforeAll(async () => {
    await masterDb.initialize()
    await adminDb.initialize()
    await masterDb.query(`
      IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'${RUNTIME_LOGIN}')
        ALTER LOGIN [${RUNTIME_LOGIN}] WITH PASSWORD = '${RUNTIME_PASSWORD}'
      ELSE
        CREATE LOGIN [${RUNTIME_LOGIN}] WITH PASSWORD = '${RUNTIME_PASSWORD}'

      IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'${MIGRATION_LOGIN}')
        ALTER LOGIN [${MIGRATION_LOGIN}] WITH PASSWORD = '${MIGRATION_PASSWORD}'
      ELSE
        CREATE LOGIN [${MIGRATION_LOGIN}] WITH PASSWORD = '${MIGRATION_PASSWORD}'
    `)
    await adminDb.query(`
      IF DATABASE_PRINCIPAL_ID(N'${RUNTIME_LOGIN}') IS NULL
        CREATE USER [${RUNTIME_LOGIN}] FOR LOGIN [${RUNTIME_LOGIN}]
      IF DATABASE_PRINCIPAL_ID(N'${MIGRATION_LOGIN}') IS NULL
        CREATE USER [${MIGRATION_LOGIN}] FOR LOGIN [${MIGRATION_LOGIN}]

      IF NOT EXISTS (
        SELECT 1
        FROM sys.database_role_members AS members
        INNER JOIN sys.database_principals AS roles
          ON roles.principal_id = members.role_principal_id
        INNER JOIN sys.database_principals AS principals
          ON principals.principal_id = members.member_principal_id
        WHERE roles.name = N'${SQL_SERVER_RUNTIME_ROLE}'
          AND principals.name = N'${RUNTIME_LOGIN}'
      )
        ALTER ROLE [${SQL_SERVER_RUNTIME_ROLE}] ADD MEMBER [${RUNTIME_LOGIN}]

      IF IS_ROLEMEMBER(N'db_datareader', N'${RUNTIME_LOGIN}') <> 1
        ALTER ROLE [db_datareader] ADD MEMBER [${RUNTIME_LOGIN}]
      IF IS_ROLEMEMBER(N'db_datawriter', N'${RUNTIME_LOGIN}') <> 1
        ALTER ROLE [db_datawriter] ADD MEMBER [${RUNTIME_LOGIN}]

      IF NOT EXISTS (
        SELECT 1
        FROM sys.database_role_members AS members
        INNER JOIN sys.database_principals AS roles
          ON roles.principal_id = members.role_principal_id
        INNER JOIN sys.database_principals AS principals
          ON principals.principal_id = members.member_principal_id
        WHERE roles.name = N'db_owner'
          AND principals.name = N'${MIGRATION_LOGIN}'
      )
        ALTER ROLE [db_owner] ADD MEMBER [${MIGRATION_LOGIN}]
    `)
    await runtimeDb.initialize()
    await migrationDb.initialize()
    await reconcileSqlServerRuntimePermissions(migrationDb, {
      expectedRuntimeUsers: [RUNTIME_LOGIN],
    })
  })

  afterAll(async () => {
    if (runtimeDb.isInitialized) await runtimeDb.destroy()
    if (migrationDb.isInitialized) await migrationDb.destroy()
    if (adminDb.isInitialized) {
      await adminDb.query(`
        IF OBJECT_ID(N'runtime_role_ddl_probe', N'U') IS NOT NULL
          DROP TABLE [runtime_role_ddl_probe]
        IF DATABASE_PRINCIPAL_ID(N'${RUNTIME_LOGIN}') IS NOT NULL
          DROP USER [${RUNTIME_LOGIN}]
        IF DATABASE_PRINCIPAL_ID(N'${MIGRATION_LOGIN}') IS NOT NULL
          DROP USER [${MIGRATION_LOGIN}]
      `)
      await adminDb.destroy()
    }
    if (masterDb.isInitialized) {
      await masterDb.query(`
        IF DB_ID(N'${migrationProbeDatabase}') IS NOT NULL
        BEGIN
          ALTER DATABASE [${migrationProbeDatabase}]
            SET SINGLE_USER WITH ROLLBACK IMMEDIATE
          DROP DATABASE [${migrationProbeDatabase}]
        END
        IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'${RUNTIME_LOGIN}')
          DROP LOGIN [${RUNTIME_LOGIN}]
        IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'${MIGRATION_LOGIN}')
          DROP LOGIN [${MIGRATION_LOGIN}]
      `)
      await masterDb.destroy()
    }
  })

  it('rolls back reconciliation when protected audit drift remains', async () => {
    try {
      await adminDb.query(`
        GRANT ALTER ON SCHEMA::[dbo] TO [${SQL_SERVER_RUNTIME_ROLE}]
        GRANT IMPERSONATE ON USER::[${MIGRATION_LOGIN}]
          TO [${SQL_SERVER_RUNTIME_ROLE}]
        ALTER ROLE [db_datareader] ADD MEMBER [${RUNTIME_LOGIN}]
        ALTER ROLE [db_datawriter] ADD MEMBER [${RUNTIME_LOGIN}]
        GRANT UPDATE ([decision]) ON OBJECT::[dbo].[action_audit_events]
          TO [${RUNTIME_LOGIN}]
      `)
      await expect(
        reconcileSqlServerRuntimePermissions(migrationDb, {
          expectedRuntimeUsers: [RUNTIME_LOGIN],
        }),
      ).rejects.toThrow(/prohibited effective runtime permissions/u)

      const restoredCustomRolePermissions = (await adminDb.query(
        `SELECT permissions.permission_name AS permissionName
         FROM sys.database_permissions AS permissions
         WHERE permissions.grantee_principal_id = DATABASE_PRINCIPAL_ID(@0)
           AND permissions.permission_name IN (N'ALTER', N'IMPERSONATE')
         ORDER BY permissions.permission_name`,
        [SQL_SERVER_RUNTIME_ROLE],
      )) as Array<{ permissionName: string }>
      expect(
        restoredCustomRolePermissions.map(
          ({ permissionName }) => permissionName,
        ),
      ).toEqual(['ALTER', 'IMPERSONATE'])
      const unchangedRuntimeMemberships = (await adminDb.query(
        `SELECT roles.[name]
         FROM sys.database_role_members AS members
         INNER JOIN sys.database_principals AS roles
           ON roles.principal_id = members.role_principal_id
         INNER JOIN sys.database_principals AS principals
           ON principals.principal_id = members.member_principal_id
         WHERE principals.[name] = @0
         ORDER BY roles.[name]`,
        [RUNTIME_LOGIN],
      )) as Array<{ name: string }>
      expect(unchangedRuntimeMemberships.map(({ name }) => name)).toEqual([
        'db_datareader',
        'db_datawriter',
        SQL_SERVER_RUNTIME_ROLE,
      ])

      await adminDb.query(`
        REVOKE UPDATE ([decision]) ON OBJECT::[dbo].[action_audit_events]
          FROM [${RUNTIME_LOGIN}]
      `)
      await expect(
        reconcileSqlServerRuntimePermissions(migrationDb, {
          expectedRuntimeUsers: [RUNTIME_LOGIN],
        }),
      ).resolves.toMatchObject({ compatible: true })
      await expect(
        reconcileSqlServerRuntimePermissions(migrationDb, {
          expectedRuntimeUsers: [RUNTIME_LOGIN],
        }),
      ).resolves.toMatchObject({ compatible: true })

      const status = await getSqlServerRuntimePermissionStatus(migrationDb, {
        expectedRuntimeUsers: [RUNTIME_LOGIN],
      })
      expect(status).toMatchObject({
        compatible: true,
        missingGrants: [],
        unexpectedGrants: [],
        unexpectedParentRoles: [],
      })
      const currentTables = (await adminDb.query(
        `SELECT schemas.[name] + N'.' + tables.[name] AS objectName
         FROM sys.tables AS tables
         INNER JOIN sys.schemas AS schemas ON tables.schema_id = schemas.schema_id
         WHERE schemas.[name] = N'dbo' AND tables.is_ms_shipped = 0`,
      )) as Array<{ objectName: string }>
      expect(
        RUNTIME_PERMISSION_MANIFEST.map(entry => entry.object).sort(),
      ).toEqual(currentTables.map(row => row.objectName).sort())

      await migrationDb.query(
        'CREATE TABLE [runtime_future_table_probe] ([id] int NOT NULL)',
      )
      await expect(
        runtimeDb.query('SELECT * FROM [runtime_future_table_probe]'),
      ).rejects.toThrow(/permission|denied/u)
      await migrationDb.query('DROP TABLE [runtime_future_table_probe]')
    } finally {
      await adminDb.query(`
        IF IS_ROLEMEMBER(N'db_datareader', N'${RUNTIME_LOGIN}') = 1
          ALTER ROLE [db_datareader] DROP MEMBER [${RUNTIME_LOGIN}]
        IF IS_ROLEMEMBER(N'db_datawriter', N'${RUNTIME_LOGIN}') = 1
          ALTER ROLE [db_datawriter] DROP MEMBER [${RUNTIME_LOGIN}]
        REVOKE UPDATE ([decision]) ON OBJECT::[dbo].[action_audit_events]
          FROM [${RUNTIME_LOGIN}]
        REVOKE ALTER ON SCHEMA::[dbo] FROM [${SQL_SERVER_RUNTIME_ROLE}]
        REVOKE IMPERSONATE ON USER::[${MIGRATION_LOGIN}]
          FROM [${SQL_SERVER_RUNTIME_ROLE}]
      `)
    }
  })

  it('reports object-scoped schema alteration independently', async () => {
    await adminDb.query(
      `GRANT ALTER ON OBJECT::[dbo].[requirements] TO [${RUNTIME_LOGIN}]`,
    )
    try {
      const status = await getSqlServerRuntimePermissionStatus(migrationDb, {
        expectedRuntimeUsers: [RUNTIME_LOGIN],
      })
      expect(status).toMatchObject({
        compatible: false,
        runtimeUsers: [
          {
            name: RUNTIME_LOGIN,
            prohibitedEffectivePermissions: expect.arrayContaining([
              'ALTER_SCHEMA_OBJECT',
            ]),
          },
        ],
      })
    } finally {
      await adminDb.query(
        `REVOKE ALTER ON OBJECT::[dbo].[requirements] FROM [${RUNTIME_LOGIN}]`,
      )
    }
  })

  it('reports database-user impersonation independently', async () => {
    await adminDb.query(
      `GRANT IMPERSONATE ON USER::[${MIGRATION_LOGIN}] TO [${RUNTIME_LOGIN}]`,
    )
    try {
      const status = await getSqlServerRuntimePermissionStatus(migrationDb, {
        expectedRuntimeUsers: [RUNTIME_LOGIN],
      })
      expect(status).toMatchObject({
        compatible: false,
        runtimeUsers: [
          {
            name: RUNTIME_LOGIN,
            prohibitedEffectivePermissions: expect.arrayContaining([
              'IMPERSONATE_DATABASE_USER',
            ]),
          },
        ],
      })
    } finally {
      await adminDb.query(
        `REVOKE IMPERSONATE ON USER::[${MIGRATION_LOGIN}] FROM [${RUNTIME_LOGIN}]`,
      )
    }
  })

  it('supports health and representative runtime data workflows using only the custom role', async () => {
    const memberships = (await adminDb.query(
      `SELECT roles.name
       FROM sys.database_role_members AS members
       INNER JOIN sys.database_principals AS roles
         ON roles.principal_id = members.role_principal_id
       INNER JOIN sys.database_principals AS principals
         ON principals.principal_id = members.member_principal_id
       WHERE principals.name = @0
       ORDER BY roles.name`,
      [RUNTIME_LOGIN],
    )) as Array<{ name: string }>
    expect(memberships.map(({ name }) => name)).toEqual([
      SQL_SERVER_RUNTIME_ROLE,
    ])

    await expect(runtimeDb.query('SELECT 1 AS ok')).resolves.toEqual([
      { ok: 1 },
    ])
    await expect(
      runtimeDb.query('SELECT TOP (1) [name] FROM [migrations]'),
    ).resolves.toHaveLength(1)

    const area = await createArea(runtimeDb, {
      description: 'Runtime role integration probe',
      name: 'Runtime role probe',
      ownerHsaId: 'SE5560000001-runtime',
      ownerPerson: {
        email: 'runtime.role@example.test',
        givenName: 'Runtime',
        hsaId: 'SE5560000001-runtime',
        middleName: null,
        surname: 'Role',
      },
      prefix: 'RTP',
    })
    expect((await listAreas(runtimeDb)).map(({ id }) => id)).toContain(area.id)
    await expect(
      updateArea(runtimeDb, area.id, { name: 'Updated runtime role probe' }),
    ).resolves.toMatchObject({
      id: area.id,
      name: 'Updated runtime role probe',
    })
    await expect(deleteArea(runtimeDb, area.id)).resolves.toBe(1)

    const auditRows = (await runtimeDb.query(
      `INSERT INTO action_audit_events (
         occurred_at, actor_hsa_id, actor_display_name, actor_kind,
         action, target_kind, decision
       )
       OUTPUT INSERTED.id AS id
       VALUES (SYSUTCDATETIME(), N'SE5560000001-runtime', N'Runtime Role',
         N'user', N'runtime.role.probe', N'test', N'allowed')`,
    )) as Array<{ id: string }>
    const auditId = auditRows[0]?.id
    await expect(
      runtimeDb.query(
        `UPDATE action_audit_events
         SET actor_hsa_id = NULL, actor_display_name = N'Raderad användare'
         WHERE id = @0`,
        [auditId],
      ),
    ).resolves.toBeUndefined()
    await expect(
      runtimeDb.query(
        `UPDATE action_audit_events SET action = N'changed' WHERE id = @0`,
        [auditId],
      ),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query('DELETE FROM action_audit_events WHERE id = @0', [
        auditId,
      ]),
    ).rejects.toThrow(/permission|denied/u)
    await adminDb.query('DELETE FROM action_audit_events WHERE id = @0', [
      auditId,
    ])

    const seededRetentionPolicies = (await adminDb.query(
      `INSERT INTO archiving_retention_policies (
         policy_key, information_set, action, age_days, status_condition,
         created_at, updated_at
       )
       OUTPUT INSERTED.id AS id
       VALUES (N'runtime-role-probe', N'Runtime role probe', N'delete', 1,
         N'probe', SYSUTCDATETIME(), SYSUTCDATETIME())`,
    )) as Array<{ id: number }>
    const seededRetentionPolicyId = seededRetentionPolicies[0]?.id
    const retentionPolicies = (await runtimeDb.query(
      `SELECT id FROM archiving_retention_policies WHERE id = @0`,
      [seededRetentionPolicyId],
    )) as Array<{ id: number }>
    const retentionPolicyId = retentionPolicies[0]?.id
    expect(retentionPolicyId).toBeTypeOf('number')
    await expect(
      runtimeDb.query(
        `UPDATE archiving_retention_policies
         SET last_run_at = last_run_at, updated_at = updated_at
         WHERE id = @0`,
        [retentionPolicyId],
      ),
    ).resolves.toBeUndefined()
    await expect(
      runtimeDb.query(
        `UPDATE archiving_retention_policies
         SET is_enabled = is_enabled WHERE id = @0`,
        [retentionPolicyId],
      ),
    ).rejects.toThrow(/permission|denied/u)
    const retentionRuns = (await runtimeDb.query(
      `INSERT INTO archiving_retention_runs (
         policy_id, started_at, completed_at, executed_by_display_name,
         preview_token
       )
       OUTPUT INSERTED.id AS id
       VALUES (@0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'Runtime Role',
         N'runtime-role-probe')`,
      [retentionPolicyId],
    )) as Array<{ id: number }>
    const retentionRunId = retentionRuns[0]?.id
    await expect(
      runtimeDb.query(
        `UPDATE archiving_retention_runs SET status = status WHERE id = @0`,
        [retentionRunId],
      ),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query('DELETE FROM archiving_retention_runs WHERE id = @0', [
        retentionRunId,
      ]),
    ).rejects.toThrow(/permission|denied/u)
    await adminDb.query('DELETE FROM archiving_retention_runs WHERE id = @0', [
      retentionRunId,
    ])
    await adminDb.query(
      'DELETE FROM archiving_retention_policies WHERE id = @0',
      [retentionPolicyId],
    )

    const reviewRuns = (await runtimeDb.query(
      `INSERT INTO access_review_runs (
         status, period_start, period_end, due_at, created_at, updated_at,
         created_by_display_name, reviewer_display_name
       )
       OUTPUT INSERTED.id AS id
       VALUES (N'draft', DATEADD(day, -2, SYSUTCDATETIME()),
         DATEADD(day, -1, SYSUTCDATETIME()), DATEADD(day, 1, SYSUTCDATETIME()),
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'Runtime Role', N'Reviewer')`,
    )) as Array<{ id: number }>
    const reviewRunId = reviewRuns[0]?.id
    await expect(
      runtimeDb.query(
        `UPDATE access_review_runs SET status = N'in_review',
         updated_at = SYSUTCDATETIME() WHERE id = @0`,
        [reviewRunId],
      ),
    ).resolves.toBeUndefined()
    await expect(
      runtimeDb.query(
        `UPDATE access_review_runs SET period_start = period_start
         WHERE id = @0`,
        [reviewRunId],
      ),
    ).rejects.toThrow(/permission|denied/u)
    const reviewItems = (await runtimeDb.query(
      `INSERT INTO access_review_items (
         run_id, source_key, source_table, principal_display_name, scope_type,
         scope_key, scope_label, permission_type, created_at
       )
       OUTPUT INSERTED.id AS id
       VALUES (@0, N'runtime-role-probe', N'probe', N'Runtime Role', N'area',
         N'probe', N'Probe', N'read', SYSUTCDATETIME())`,
      [reviewRunId],
    )) as Array<{ id: number }>
    const reviewItemId = reviewItems[0]?.id
    await expect(
      runtimeDb.query(
        `UPDATE access_review_items SET decision = N'approved',
         decided_at = SYSUTCDATETIME() WHERE id = @0`,
        [reviewItemId],
      ),
    ).resolves.toBeUndefined()
    await expect(
      runtimeDb.query(
        `UPDATE access_review_items SET source_key = source_key WHERE id = @0`,
        [reviewItemId],
      ),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query('DELETE FROM access_review_items WHERE id = @0', [
        reviewItemId,
      ]),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query('DELETE FROM access_review_runs WHERE id = @0', [
        reviewRunId,
      ]),
    ).rejects.toThrow(/permission|denied/u)
    await adminDb.query('DELETE FROM access_review_runs WHERE id = @0', [
      reviewRunId,
    ])
  })

  it('allows the migration identity and denies the runtime identity schema access', async () => {
    const migrationMemberships = (await adminDb.query(
      `SELECT roles.name
       FROM sys.database_role_members AS members
       INNER JOIN sys.database_principals AS roles
         ON roles.principal_id = members.role_principal_id
       INNER JOIN sys.database_principals AS principals
         ON principals.principal_id = members.member_principal_id
       WHERE principals.name = @0`,
      [MIGRATION_LOGIN],
    )) as Array<{ name: string }>
    expect(migrationMemberships.map(({ name }) => name)).toEqual(['db_owner'])

    await resetSqlServerDatabase(migrationProbeAdminUrl)
    const migrationProbeAdminDb = createAppDataSource({
      url: migrationProbeAdminUrl,
    })
    await migrationProbeAdminDb.initialize()
    try {
      await migrationProbeAdminDb.query(`
        CREATE USER [${MIGRATION_LOGIN}] FOR LOGIN [${MIGRATION_LOGIN}]
        ALTER ROLE [db_owner] ADD MEMBER [${MIGRATION_LOGIN}]
      `)
    } finally {
      await migrationProbeAdminDb.destroy()
    }

    const migrationResult = await runSqlServerMigrations(migrationProbeUrl)
    expect(migrationResult.migrationsApplied).toBeGreaterThan(50)
    expect(migrationResult.postMigration.observedHead?.name).toBe(
      migrationResult.postMigration.expectedHead?.name,
    )
    await expect(
      seedSqlServerDatabase(migrationProbeUrl, {
        configureReadonlyAccess: false,
        profile: 'required',
      }),
    ).resolves.toMatchObject({ insertedRows: expect.any(Number) })

    await expect(
      migrationDb.query(
        'CREATE TABLE [runtime_role_ddl_probe] ([id] int NOT NULL)',
      ),
    ).resolves.toBeUndefined()
    await expect(
      migrationDb.query('DROP TABLE [runtime_role_ddl_probe]'),
    ).resolves.toBeUndefined()
    await expect(
      runtimeDb.query(
        'CREATE TABLE [runtime_role_ddl_probe] ([id] int NOT NULL)',
      ),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query(
        `ALTER ROLE [db_datareader] ADD MEMBER [${RUNTIME_LOGIN}]`,
      ),
    ).rejects.toThrow(/permission|denied/u)
    await expect(
      runtimeDb.query('UPDATE [migrations] SET [name] = [name] WHERE 1 = 0'),
    ).rejects.toThrow(/permission|denied/u)
  })

  it('retains restored legacy memberships when rolling back the custom role', async () => {
    await adminDb.query(`
      ALTER ROLE [db_datareader] ADD MEMBER [${RUNTIME_LOGIN}]
      ALTER ROLE [db_datawriter] ADD MEMBER [${RUNTIME_LOGIN}]
    `)
    const migration = new RuntimeRoleMigration()
    await expect(migration.down(migrationDb)).resolves.toBeUndefined()

    const principals = (await adminDb.query(
      `SELECT [name], [type]
       FROM sys.database_principals
       WHERE [name] IN (@0, @1)
       ORDER BY [name]`,
      [RUNTIME_LOGIN, SQL_SERVER_RUNTIME_ROLE],
    )) as Array<{ name: string; type: string }>
    expect(principals).toEqual([{ name: RUNTIME_LOGIN, type: 'S' }])
    const memberships = (await adminDb.query(
      `SELECT roles.[name]
       FROM sys.database_role_members AS members
       INNER JOIN sys.database_principals AS roles
         ON roles.principal_id = members.role_principal_id
       INNER JOIN sys.database_principals AS principals
         ON principals.principal_id = members.member_principal_id
       WHERE principals.[name] = @0
       ORDER BY roles.[name]`,
      [RUNTIME_LOGIN],
    )) as Array<{ name: string }>
    expect(memberships.map(row => row.name)).toEqual([
      'db_datareader',
      'db_datawriter',
    ])

    await expect(runtimeDb.query('SELECT 1 AS ok')).resolves.toEqual([
      { ok: 1 },
    ])
    const rollbackArea = await createArea(runtimeDb, {
      description: 'Runtime role rollback probe',
      name: 'Runtime rollback probe',
      ownerHsaId: 'SE5560000001-rollback',
      ownerPerson: {
        email: 'runtime.rollback@example.test',
        givenName: 'Runtime',
        hsaId: 'SE5560000001-rollback',
        middleName: null,
        surname: 'Rollback',
      },
      prefix: 'RBP',
    })
    expect((await listAreas(runtimeDb)).map(({ id }) => id)).toContain(
      rollbackArea.id,
    )
    await expect(
      updateArea(runtimeDb, rollbackArea.id, {
        name: 'Updated runtime rollback probe',
      }),
    ).resolves.toMatchObject({
      id: rollbackArea.id,
      name: 'Updated runtime rollback probe',
    })
    await expect(deleteArea(runtimeDb, rollbackArea.id)).resolves.toBe(1)

    // Re-install the current role contract after exercising the historical
    // migration rollback. Later schema migrations may remove columns that the
    // immutable 0054 snapshot intentionally still names.
    await reconcileSqlServerRuntimePermissions(migrationDb, {
      expectedRuntimeUsers: [RUNTIME_LOGIN],
    })
    await adminDb.query(`
      ALTER ROLE [db_datareader] DROP MEMBER [${RUNTIME_LOGIN}]
      ALTER ROLE [db_datawriter] DROP MEMBER [${RUNTIME_LOGIN}]
    `)
  })
})
