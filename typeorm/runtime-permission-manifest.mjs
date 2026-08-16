import { createHash } from 'node:crypto'

export const SQL_SERVER_RUNTIME_ROLE = 'kravhantering_runtime'
export const RUNTIME_PERMISSION_MANIFEST_VERSION = '2026.08.14.2'

const CRUD = Object.freeze(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
const READ_CREATE = Object.freeze(['SELECT', 'INSERT'])
const READ_CREATE_DELETE = Object.freeze(['SELECT', 'INSERT', 'DELETE'])
const READ_UPDATE = Object.freeze(['SELECT', 'UPDATE'])

/**
 * Authoritative runtime database contract for this release. Every object is
 * fully qualified and every operation is explicit so new tables receive no
 * access until this manifest changes.
 */
export const RUNTIME_PERMISSION_MANIFEST_AT_0054 = Object.freeze(
  [
    {
      object: 'dbo.access_review_items',
      permissions: READ_CREATE,
      updateColumns: [
        'decision',
        'decided_at',
        'decided_by_hsa_id',
        'decided_by_display_name',
        'comment',
        'principal_hsa_id',
        'principal_display_name',
      ],
    },
    {
      object: 'dbo.access_review_runs',
      permissions: READ_CREATE,
      updateColumns: [
        'status',
        'completed_at',
        'completed_by_hsa_id',
        'completed_by_display_name',
        'created_by_hsa_id',
        'created_by_display_name',
        'reviewer_hsa_id',
        'reviewer_display_name',
        'updated_at',
      ],
    },
    {
      object: 'dbo.action_audit_events',
      permissions: READ_CREATE,
      updateColumns: ['actor_hsa_id', 'actor_display_name'],
    },
    { object: 'dbo.ai_safety_rule_terms', permissions: CRUD },
    { object: 'dbo.ai_safety_rules', permissions: CRUD },
    {
      object: 'dbo.ai_settings',
      permissions: ['SELECT'],
      updateColumns: [
        'ai_safety_forensic_logging_enabled',
        'ai_safety_rule_cache_ttl_seconds',
        'mcp_import_max_rows',
        'mcp_import_validation_ttl_minutes',
        'mcp_max_request_bytes',
        'requirement_generation_enabled',
        'updated_at',
      ],
    },
    { object: 'dbo.application_settings', permissions: READ_UPDATE },
    { object: 'dbo.archiving_retention_exceptions', permissions: CRUD },
    {
      object: 'dbo.archiving_retention_policies',
      permissions: ['SELECT'],
      updateColumns: ['last_run_at', 'updated_at'],
    },
    { object: 'dbo.archiving_retention_runs', permissions: READ_CREATE },
    { object: 'dbo.deviations', permissions: CRUD },
    { object: 'dbo.hsa_id_prefixes', permissions: CRUD },
    { object: 'dbo.improvement_suggestions', permissions: CRUD },
    { object: 'dbo.migrations', permissions: ['SELECT'] },
    { object: 'dbo.norm_references', permissions: CRUD },
    { object: 'dbo.priority_levels', permissions: CRUD },
    { object: 'dbo.quality_characteristics', permissions: ['SELECT'] },
    {
      object: 'dbo.requirement_area_co_authors',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.requirement_areas', permissions: CRUD },
    { object: 'dbo.requirement_categories', permissions: CRUD },
    {
      object: 'dbo.requirement_import_validation_sessions',
      permissions: CRUD,
    },
    { object: 'dbo.requirement_list_column_defaults', permissions: CRUD },
    {
      object: 'dbo.requirement_package_co_authors',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.requirement_packages', permissions: CRUD },
    { object: 'dbo.requirement_responsibility_people', permissions: CRUD },
    {
      object: 'dbo.requirement_selection_answer_packages',
      permissions: READ_CREATE_DELETE,
    },
    {
      object: 'dbo.requirement_selection_answer_requirements',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.requirement_selection_answers', permissions: CRUD },
    {
      object: 'dbo.requirement_selection_question_sequences',
      permissions: CRUD,
    },
    {
      object: 'dbo.requirement_selection_question_visibility_conditions',
      permissions: CRUD,
    },
    {
      object: 'dbo.requirement_selection_question_visibility_groups',
      permissions: CRUD,
    },
    { object: 'dbo.requirement_selection_questions', permissions: CRUD },
    { object: 'dbo.requirement_status_transitions', permissions: ['SELECT'] },
    { object: 'dbo.requirement_statuses', permissions: CRUD },
    { object: 'dbo.requirement_types', permissions: CRUD },
    {
      object: 'dbo.requirement_version_norm_references',
      permissions: READ_CREATE_DELETE,
    },
    {
      object: 'dbo.requirement_version_requirement_packages',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.requirement_versions', permissions: CRUD },
    { object: 'dbo.requirements', permissions: CRUD },
    { object: 'dbo.requirements_specification_items', permissions: CRUD },
    { object: 'dbo.requirements_specifications', permissions: CRUD },
    { object: 'dbo.rfi_question_sequences', permissions: CRUD },
    { object: 'dbo.rfi_question_suggestions', permissions: CRUD },
    {
      object: 'dbo.rfi_question_version_requirement_packages',
      permissions: READ_CREATE_DELETE,
    },
    {
      object: 'dbo.rfi_question_version_requirement_selection_questions',
      permissions: READ_CREATE_DELETE,
    },
    {
      object: 'dbo.rfi_question_version_requirements',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.rfi_question_versions', permissions: CRUD },
    { object: 'dbo.rfi_questions', permissions: CRUD },
    { object: 'dbo.specification_co_authors', permissions: READ_CREATE_DELETE },
    {
      object: 'dbo.specification_governance_object_types',
      permissions: CRUD,
    },
    {
      object: 'dbo.specification_implementation_types',
      permissions: CRUD,
    },
    { object: 'dbo.specification_item_statuses', permissions: CRUD },
    { object: 'dbo.specification_lifecycle_statuses', permissions: CRUD },
    {
      object: 'dbo.specification_local_requirement_deviations',
      permissions: CRUD,
    },
    {
      object: 'dbo.specification_local_requirement_norm_references',
      permissions: READ_CREATE_DELETE,
    },
    { object: 'dbo.specification_local_requirements', permissions: CRUD },
    {
      object: 'dbo.specification_needs_references',
      permissions: READ_CREATE_DELETE,
    },
    {
      object: 'dbo.specification_requirement_selection_answers',
      permissions: CRUD,
    },
    { object: 'dbo.specification_rfi_lists', permissions: CRUD },
    { object: 'dbo.specification_rfi_question_items', permissions: CRUD },
  ].map(entry =>
    Object.freeze({
      ...entry,
      permissions: Object.freeze([...entry.permissions]),
      ...(entry.updateColumns
        ? { updateColumns: Object.freeze([...entry.updateColumns]) }
        : {}),
    }),
  ),
)

export const RUNTIME_PERMISSION_MANIFEST = Object.freeze(
  RUNTIME_PERMISSION_MANIFEST_AT_0054.flatMap(entry => {
    const currentEntry =
      entry.object === 'dbo.ai_settings'
        ? Object.freeze({
            ...entry,
            updateColumns: Object.freeze([
              ...entry.updateColumns.filter(
                column => column !== 'ai_safety_forensic_logging_enabled',
              ),
              'mcp_import_max_active_sessions_per_destination',
              'mcp_import_max_active_sessions_per_principal',
              'mcp_import_max_creations_per_window',
              'mcp_import_max_reserved_bytes',
            ]),
          })
        : entry
    if (entry.object === 'dbo.ai_safety_rule_terms') {
      return [
        Object.freeze({
          object: 'dbo.ai_forensic_capture_windows',
          permissions: CRUD,
        }),
        Object.freeze({
          object: 'dbo.ai_forensic_evidence_events',
          permissions: READ_CREATE_DELETE,
        }),
        currentEntry,
      ]
    }
    return entry.object === 'dbo.requirement_import_validation_sessions'
      ? [
          Object.freeze({
            object: 'dbo.requirement_import_validation_rate_buckets',
            permissions: CRUD,
          }),
          currentEntry,
        ]
      : [currentEntry]
  }),
)

export const RUNTIME_PERMISSION_MANIFEST_DIGEST = createHash('sha256')
  .update(
    JSON.stringify({
      permissions: RUNTIME_PERMISSION_MANIFEST,
      version: RUNTIME_PERMISSION_MANIFEST_VERSION,
    }),
    'utf8',
  )
  .digest('hex')

function quoteIdentifier(value) {
  return `[${value.replaceAll(']', ']]')}]`
}

function objectParts(objectName) {
  const [schema, table, ...rest] = objectName.split('.')
  if (!schema || !table || rest.length > 0) {
    throw new Error(`Invalid runtime permission object: ${objectName}`)
  }
  return { schema, table }
}

function permissionSql(entry, verb) {
  const { schema, table } = objectParts(entry.object)
  return `${verb} ${entry.permissions.join(', ')} ON OBJECT::${quoteIdentifier(schema)}.${quoteIdentifier(table)} ${verb === 'GRANT' ? 'TO' : 'FROM'} ${quoteIdentifier(SQL_SERVER_RUNTIME_ROLE)};`
}

function updateSql(entry, verb) {
  if (!entry.updateColumns?.length) return null
  const { schema, table } = objectParts(entry.object)
  const columns = entry.updateColumns.map(quoteIdentifier).join(', ')
  return `${verb} UPDATE (${columns}) ON OBJECT::${quoteIdentifier(schema)}.${quoteIdentifier(table)} ${verb === 'GRANT' ? 'TO' : 'FROM'} ${quoteIdentifier(SQL_SERVER_RUNTIME_ROLE)};`
}

export function buildRuntimeRoleCreateSql() {
  return `IF EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE [name] = N'${SQL_SERVER_RUNTIME_ROLE}' AND [type] <> N'R'
  )
    THROW 51021, 'Cannot provision ${SQL_SERVER_RUNTIME_ROLE}: a non-role database principal uses that name.', 1;

  IF DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}') IS NULL
    CREATE ROLE [${SQL_SERVER_RUNTIME_ROLE}] AUTHORIZATION [dbo];`
}

export function buildRuntimePermissionReconcileSql(
  manifest = RUNTIME_PERMISSION_MANIFEST,
) {
  const expectedObjectChecks = manifest
    .map(entry => {
      const { schema, table } = objectParts(entry.object)
      return `IF OBJECT_ID(N'${schema}.${table}', N'U') IS NULL
    THROW 51022, 'Runtime permission manifest object is missing: ${schema}.${table}.', 1;`
    })
    .join('\n  ')
  const explicitRevokes = manifest
    .flatMap(entry => [
      permissionSql(entry, 'REVOKE'),
      updateSql(entry, 'REVOKE'),
    ])
    .filter(Boolean)
    .join('\n  ')
  const grants = manifest
    .flatMap(entry => [
      permissionSql(entry, 'GRANT'),
      updateSql(entry, 'GRANT'),
    ])
    .filter(Boolean)
    .join('\n  ')

  return `${buildRuntimeRoleCreateSql()}

  ${expectedObjectChecks}

  DECLARE @runtimePermissionSql nvarchar(max) = N'';
  SELECT @runtimePermissionSql += CASE permissions.class
    WHEN 0 THEN N'REVOKE ' + permissions.permission_name + N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 1 THEN N'REVOKE ' + permissions.permission_name +
      CASE WHEN permissions.minor_id > 0
        THEN N' (' + QUOTENAME(COL_NAME(permissions.major_id, permissions.minor_id)) + N')'
        ELSE N'' END +
      N' ON OBJECT::' + QUOTENAME(OBJECT_SCHEMA_NAME(permissions.major_id)) +
      N'.' + QUOTENAME(OBJECT_NAME(permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 3 THEN N'REVOKE ' + permissions.permission_name + N' ON SCHEMA::' +
      QUOTENAME(SCHEMA_NAME(permissions.major_id)) + N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 4 THEN N'REVOKE ' + permissions.permission_name + N' ON ' +
      CASE principals.[type]
        WHEN N'R' THEN N'ROLE::'
        WHEN N'A' THEN N'APPLICATION ROLE::'
        ELSE N'USER::'
      END + QUOTENAME(principals.[name]) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 5 THEN N'REVOKE ' + permissions.permission_name + N' ON ASSEMBLY::' +
      QUOTENAME((SELECT assemblies.[name] FROM sys.assemblies AS assemblies WHERE assemblies.assembly_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 6 THEN N'REVOKE ' + permissions.permission_name + N' ON TYPE::' +
      QUOTENAME(SCHEMA_NAME(types.schema_id)) + N'.' + QUOTENAME(types.[name]) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 10 THEN N'REVOKE ' + permissions.permission_name +
      N' ON XML SCHEMA COLLECTION::' + QUOTENAME(SCHEMA_NAME(xml_collections.schema_id)) +
      N'.' + QUOTENAME(xml_collections.[name]) + N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 15 THEN N'REVOKE ' + permissions.permission_name + N' ON MESSAGE TYPE::' +
      QUOTENAME((SELECT message_types.[name] FROM sys.service_message_types AS message_types WHERE message_types.message_type_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 16 THEN N'REVOKE ' + permissions.permission_name + N' ON CONTRACT::' +
      QUOTENAME((SELECT contracts.[name] FROM sys.service_contracts AS contracts WHERE contracts.service_contract_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 17 THEN N'REVOKE ' + permissions.permission_name + N' ON SERVICE::' +
      QUOTENAME((SELECT services.[name] FROM sys.services AS services WHERE services.service_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 18 THEN N'REVOKE ' + permissions.permission_name +
      N' ON REMOTE SERVICE BINDING::' +
      QUOTENAME((SELECT bindings.[name] FROM sys.remote_service_bindings AS bindings WHERE bindings.remote_service_binding_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 19 THEN N'REVOKE ' + permissions.permission_name + N' ON ROUTE::' +
      QUOTENAME((SELECT routes.[name] FROM sys.routes AS routes WHERE routes.route_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 23 THEN N'REVOKE ' + permissions.permission_name + N' ON FULLTEXT CATALOG::' +
      QUOTENAME((SELECT catalogs.[name] FROM sys.fulltext_catalogs AS catalogs WHERE catalogs.fulltext_catalog_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 24 THEN N'REVOKE ' + permissions.permission_name + N' ON SYMMETRIC KEY::' +
      QUOTENAME((SELECT symmetric_keys.[name] FROM sys.symmetric_keys AS symmetric_keys WHERE symmetric_keys.symmetric_key_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 25 THEN N'REVOKE ' + permissions.permission_name + N' ON CERTIFICATE::' +
      QUOTENAME((SELECT certificates.[name] FROM sys.certificates AS certificates WHERE certificates.certificate_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 26 THEN N'REVOKE ' + permissions.permission_name + N' ON ASYMMETRIC KEY::' +
      QUOTENAME((SELECT asymmetric_keys.[name] FROM sys.asymmetric_keys AS asymmetric_keys WHERE asymmetric_keys.asymmetric_key_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 29 THEN N'REVOKE ' + permissions.permission_name + N' ON FULLTEXT STOPLIST::' +
      QUOTENAME((SELECT stoplists.[name] FROM sys.fulltext_stoplists AS stoplists WHERE stoplists.stoplist_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 31 THEN N'REVOKE ' + permissions.permission_name +
      N' ON SEARCH PROPERTY LIST::' +
      QUOTENAME((SELECT property_lists.[name] FROM sys.registered_search_property_lists AS property_lists WHERE property_lists.property_list_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 32 THEN N'REVOKE ' + permissions.permission_name +
      N' ON DATABASE SCOPED CREDENTIAL::' +
      QUOTENAME((SELECT credentials.[name] FROM sys.database_scoped_credentials AS credentials WHERE credentials.credential_id = permissions.major_id)) +
      N' FROM [${SQL_SERVER_RUNTIME_ROLE}];'
    WHEN 34 THEN N'EXEC sp_executesql N''DECLARE @sql nvarchar(max);
      SELECT @sql = N''''REVOKE ' + permissions.permission_name +
      N' ON EXTERNAL LANGUAGE::'''' + QUOTENAME([name]) +
      N'''' FROM [${SQL_SERVER_RUNTIME_ROLE}];''''
      FROM sys.external_languages WHERE external_language_id = @id;
      EXEC sp_executesql @sql;'', N''@id int'', @id = ' +
      CONVERT(nvarchar(11), permissions.major_id) + N';'
    ELSE N'THROW 51023, ''Runtime role contains an unsupported direct permission class.'', 1;'
  END
  FROM sys.database_permissions AS permissions
  LEFT JOIN sys.database_principals AS principals
    ON permissions.class = 4 AND permissions.major_id = principals.principal_id
  LEFT JOIN sys.types AS types
    ON permissions.class = 6 AND permissions.major_id = types.user_type_id
  LEFT JOIN sys.xml_schema_collections AS xml_collections
    ON permissions.class = 10 AND permissions.major_id = xml_collections.xml_collection_id
  WHERE permissions.grantee_principal_id = DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}');
  EXEC sp_executesql @runtimePermissionSql;

  IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}')
  )
    THROW 51023, 'Runtime role contains an unsupported direct permission that could not be reconciled.', 1;

  ${explicitRevokes}

  ${grants}`
}

export function buildRuntimeRoleDropSql() {
  return `IF DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}') IS NOT NULL
  BEGIN
    DECLARE @runtimeRoleSql nvarchar(max) = N'';
    SELECT @runtimeRoleSql += N'ALTER ROLE [${SQL_SERVER_RUNTIME_ROLE}] DROP MEMBER ' +
      QUOTENAME(principals.[name]) + N';'
    FROM sys.database_role_members AS members
    INNER JOIN sys.database_principals AS principals
      ON members.member_principal_id = principals.principal_id
    WHERE members.role_principal_id = DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}');
    EXEC sp_executesql @runtimeRoleSql;

    SET @runtimeRoleSql = N'';
    SELECT @runtimeRoleSql += N'ALTER ROLE ' + QUOTENAME(roles.[name]) +
      N' DROP MEMBER [${SQL_SERVER_RUNTIME_ROLE}];'
    FROM sys.database_role_members AS members
    INNER JOIN sys.database_principals AS roles
      ON members.role_principal_id = roles.principal_id
    WHERE members.member_principal_id = DATABASE_PRINCIPAL_ID(N'${SQL_SERVER_RUNTIME_ROLE}');
    EXEC sp_executesql @runtimeRoleSql;
    DROP ROLE [${SQL_SERVER_RUNTIME_ROLE}];
  END`
}
