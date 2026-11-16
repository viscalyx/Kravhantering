import type { DataSource } from 'typeorm'
import { BUILD_TARGET } from '@/lib/runtime/build-target'
import {
  RUNTIME_PERMISSION_MANIFEST,
  RUNTIME_PERMISSION_MANIFEST_DIGEST,
} from '@/typeorm/runtime-permission-manifest.mjs'

type Executor = Pick<DataSource, 'query'>

export interface RuntimeSqlVerificationEvidence {
  databaseName: string
  databaseUser: string
  expectedUser: string
  loginName: string
  manifestDigest: string
  missingPermissions: number
  unexpectedPermissions: number
}

interface VerificationRow {
  canConnect: number
  databaseName: string
  databaseUser: string
  effectiveLogin: string
  loginName: string
  missing: string
  runtimeRole: number
  unexpected: string
}

export class RuntimeSqlVerificationError extends Error {
  constructor(
    readonly reason: string,
    readonly evidence: Partial<RuntimeSqlVerificationEvidence> = {},
  ) {
    super(reason)
    this.name = 'RuntimeSqlVerificationError'
  }
}

// One read-only batch observes the current session, without impersonation or
// acquiring an administrative connection. The manifest remains the grant owner.
const verificationSql = `
DECLARE @expected TABLE (objectName nvarchar(256), permissionName sysname, columnName sysname NULL);
INSERT INTO @expected
SELECT objectName, permissionName, columnName
FROM OPENJSON(@0) WITH (
  objectName nvarchar(256), permissionName sysname, columnName sysname
);
DECLARE @actual TABLE (scope nvarchar(16), objectName nvarchar(256), permissionName sysname, columnName sysname NULL);
INSERT INTO @actual
SELECT N'SERVER', N'', permission_name, NULL FROM sys.fn_my_permissions(NULL, N'SERVER')
UNION ALL
SELECT N'DATABASE', DB_NAME(), permission_name, NULL FROM sys.fn_my_permissions(NULL, N'DATABASE')
UNION ALL
SELECT N'SCHEMA', s.name, p.permission_name, NULL
FROM sys.schemas s CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name), N'SCHEMA') p
WHERE s.name NOT IN (N'sys', N'INFORMATION_SCHEMA')
UNION ALL
SELECT N'OBJECT', s.name + N'.' + o.name, p.permission_name, NULLIF(p.subentity_name, N'')
FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name) + N'.' + QUOTENAME(o.name), N'OBJECT') p
WHERE o.is_ms_shipped = 0 AND o.parent_object_id = 0
UNION ALL
SELECT N'USER', u.name, N'IMPERSONATE', NULL
FROM sys.database_principals u
WHERE u.type IN (N'S', N'U', N'G', N'E', N'X')
  AND u.principal_id <> USER_ID()
  AND HAS_PERMS_BY_NAME(QUOTENAME(u.name), N'USER', N'IMPERSONATE') = 1
UNION ALL
SELECT N'LOGIN', l.name, p.permissionName, NULL
FROM sys.server_principals l
CROSS JOIN (VALUES (N'IMPERSONATE'), (N'ALTER'), (N'CONTROL')) p(permissionName)
WHERE l.type IN (N'S', N'U', N'G', N'E', N'X')
  AND l.principal_id <> SUSER_ID()
  AND HAS_PERMS_BY_NAME(QUOTENAME(l.name), N'LOGIN', p.permissionName) = 1
UNION ALL
SELECT N'ROLE', r.name, p.permissionName, NULL
FROM sys.database_principals r
CROSS JOIN (VALUES (N'ALTER'), (N'CONTROL'), (N'TAKE OWNERSHIP')) p(permissionName)
WHERE r.type = N'R'
  AND HAS_PERMS_BY_NAME(QUOTENAME(r.name), N'ROLE', p.permissionName) = 1
UNION ALL
SELECT N'SERVER_ROLE', r.name, N'OWNERSHIP', NULL
FROM sys.server_principals r
JOIN sys.login_token t ON t.principal_id = r.owning_principal_id
WHERE r.type = N'R'
UNION ALL
SELECT N'DATABASE_GRANT', p.class_desc, p.permission_name, NULL
FROM sys.database_permissions p
JOIN sys.user_token t ON t.principal_id = p.grantee_principal_id
WHERE p.state IN (N'G', N'W') AND (p.class NOT IN (0, 1, 3) OR p.state = N'W')
UNION ALL
SELECT N'SERVER_GRANT', p.class_desc, p.permission_name, NULL
FROM sys.server_permissions p
JOIN sys.login_token t ON t.principal_id = p.grantee_principal_id
WHERE p.state IN (N'G', N'W')
  AND (p.class NOT IN (100, 101) OR p.state = N'W')
  AND NOT (p.class_desc = N'ENDPOINT' AND p.permission_name = N'CONNECT'
    AND t.name = N'public' AND p.state = N'G');
SELECT ORIGINAL_LOGIN() AS loginName, SUSER_SNAME() AS effectiveLogin,
  USER_NAME() AS databaseUser, DB_NAME() AS databaseName,
  IS_ROLEMEMBER(N'kravhantering_runtime') AS runtimeRole,
  COALESCE((SELECT objectName, permissionName, columnName FROM @expected e
   WHERE COALESCE(CASE WHEN columnName IS NULL
     THEN HAS_PERMS_BY_NAME(objectName, N'OBJECT', permissionName)
     ELSE HAS_PERMS_BY_NAME(objectName, N'OBJECT', permissionName, columnName, N'COLUMN') END, 0) <> 1
   FOR JSON PATH), N'[]') AS missing,
  COALESCE((SELECT scope, objectName, permissionName, columnName FROM @actual a
   WHERE NOT (
     (scope = N'SERVER' AND permissionName IN (N'CONNECT SQL', N'VIEW ANY DATABASE')) OR
     (scope = N'DATABASE' AND permissionName IN (N'CONNECT', N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION', N'VIEW ANY COLUMN MASTER KEY DEFINITION')) OR
     (scope = N'OBJECT' AND EXISTS (
       SELECT 1 FROM @expected e WHERE e.objectName = a.objectName
         AND e.permissionName = a.permissionName
         AND (e.columnName IS NULL OR e.columnName = a.columnName)
     ))
   ) FOR JSON PATH), N'[]') AS unexpected,
  (SELECT COUNT(*) FROM @actual WHERE scope = N'DATABASE' AND permissionName = N'CONNECT') AS canConnect;
`

const expectedPermissions = JSON.stringify(
  RUNTIME_PERMISSION_MANIFEST.flatMap(entry => [
    ...entry.permissions.map(permissionName => ({
      objectName: entry.object,
      permissionName,
    })),
    ...('updateColumns' in entry ? (entry.updateColumns ?? []) : []).map(
      columnName => ({
        objectName: entry.object,
        permissionName: 'UPDATE',
        columnName,
      }),
    ),
  ]),
)

export async function verifyRuntimeSqlConnection(
  db: Executor,
  expectedUser: string,
): Promise<RuntimeSqlVerificationEvidence> {
  if (!expectedUser.trim()) {
    throw new RuntimeSqlVerificationError('sql_runtime_identity_not_configured')
  }
  try {
    const rows = await db.query<VerificationRow[]>(verificationSql, [
      expectedPermissions,
    ])
    const row = rows?.[0]
    if (
      rows.length !== 1 ||
      !row ||
      !(
        ['loginName', 'effectiveLogin', 'databaseUser', 'databaseName'] as const
      ).every(key => typeof row[key] === 'string' && row[key].length > 0) ||
      ![0, 1].includes(row.runtimeRole) ||
      row.canConnect !== 1
    ) {
      throw new RuntimeSqlVerificationError(
        'sql_runtime_verification_unavailable',
      )
    }
    const missing: unknown = JSON.parse(row.missing)
    const unexpected: unknown = JSON.parse(row.unexpected)
    if (!Array.isArray(missing) || !Array.isArray(unexpected)) {
      throw new RuntimeSqlVerificationError(
        'sql_runtime_verification_unavailable',
      )
    }
    // Allowlist evidence fields; never forward driver errors, SQL or URLs.
    const evidence = {
      expectedUser,
      loginName: row.loginName,
      databaseUser: row.databaseUser,
      databaseName: row.databaseName,
      manifestDigest: RUNTIME_PERMISSION_MANIFEST_DIGEST,
      missingPermissions: missing.length,
      unexpectedPermissions: unexpected.length,
    }
    if (
      row.databaseUser !== expectedUser ||
      row.loginName !== row.effectiveLogin
    ) {
      throw new RuntimeSqlVerificationError(
        'sql_runtime_identity_mismatch',
        evidence,
      )
    }
    if (row.runtimeRole !== 1 || missing.length || unexpected.length) {
      throw new RuntimeSqlVerificationError(
        'sql_runtime_permissions_mismatch',
        evidence,
      )
    }
    return evidence
  } catch (error) {
    if (error instanceof RuntimeSqlVerificationError) throw error
    throw new RuntimeSqlVerificationError(
      'sql_runtime_verification_unavailable',
    )
  }
}

const verifiedConnections = new WeakMap<Executor, Map<string, Promise<void>>>()

export async function requireVerifiedRuntimeSqlConnection(
  db: Executor,
): Promise<void> {
  const expectedUser = process.env.DB_RUNTIME_USER?.trim() ?? ''
  if (BUILD_TARGET !== 'prod' && !expectedUser) return
  let identities = verifiedConnections.get(db)
  if (!identities) {
    identities = new Map()
    verifiedConnections.set(db, identities)
  }
  let verification = identities.get(expectedUser)
  if (!verification) {
    verification = verifyRuntimeSqlConnection(db, expectedUser).then(
      evidence => {
        console.info('[sql-runtime-verification] passed', evidence)
      },
    )
    identities.set(expectedUser, verification)
  }
  try {
    await verification
  } catch (error) {
    identities.delete(expectedUser)
    throw error
  }
}
