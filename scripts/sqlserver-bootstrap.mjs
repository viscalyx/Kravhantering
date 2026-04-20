import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'

export const LEGACY_MIGRATIONS_DIR = 'drizzle/migrations'
export const LEGACY_SEED_SQL_FILE = 'drizzle/seed.sql'

function quoteSqliteIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`
}

function quoteSqlServerIdentifier(name) {
  return `[${String(name).replaceAll(']', ']]')}]`
}

function escapeSqlServerStringLiteral(value) {
  return String(value).replaceAll("'", "''")
}

function stripWrappingParentheses(value) {
  let normalized = value.trim()

  while (
    normalized.startsWith('(') &&
    normalized.endsWith(')') &&
    normalized.length > 2
  ) {
    normalized = normalized.slice(1, -1).trim()
  }

  return normalized
}

export function splitLegacySqlStatements(sqlText) {
  return sqlText
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function readLegacyMigrationStatements(cwd = process.cwd()) {
  const migrationsDir = resolve(cwd, LEGACY_MIGRATIONS_DIR)
  const migrationFiles = readdirSync(migrationsDir)
    .filter(fileName => fileName.endsWith('.sql'))
    .sort()

  return migrationFiles.flatMap(fileName =>
    splitLegacySqlStatements(
      readFileSync(join(migrationsDir, fileName), 'utf8'),
    ),
  )
}

function readLegacySeedStatements(cwd = process.cwd()) {
  return splitLegacySqlStatements(
    readFileSync(resolve(cwd, LEGACY_SEED_SQL_FILE), 'utf8'),
  )
}

function executeLegacySqlStatements(sqlite, statements) {
  for (const statement of statements) {
    sqlite.exec(statement)
  }
}

export function createLegacySqliteSnapshot(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const includeSeed = options.includeSeed ?? false
  const sqlite = new BetterSqlite3(':memory:')

  sqlite.pragma('foreign_keys = ON')
  executeLegacySqlStatements(sqlite, readLegacyMigrationStatements(cwd))

  if (includeSeed) {
    executeLegacySqlStatements(sqlite, readLegacySeedStatements(cwd))
  }

  return sqlite
}

export function listLegacyTables(sqlite) {
  return sqlite
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '__drizzle_%'
        ORDER BY name
      `,
    )
    .all()
    .map(row => row.name)
}

function groupForeignKeys(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const existing = grouped.get(row.id) ?? {
      columns: [],
      onDelete: row.on_delete ?? 'NO ACTION',
      onUpdate: row.on_update ?? 'NO ACTION',
      referencedColumns: [],
      referencedTable: row.table,
    }

    existing.columns[row.seq] = row.from
    existing.referencedColumns[row.seq] = row.to
    grouped.set(row.id, existing)
  }

  return [...grouped.values()].map(group => ({
    columns: group.columns.filter(Boolean),
    onDelete: group.onDelete,
    onUpdate: group.onUpdate,
    referencedColumns: group.referencedColumns.filter(Boolean),
    referencedTable: group.referencedTable,
  }))
}

export function getLegacyTableMetadata(sqlite, tableNames = listLegacyTables(sqlite)) {
  return tableNames.map(tableName => {
    const tableInfo = sqlite
      .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`)
      .all()
    const foreignKeys = groupForeignKeys(
      sqlite
        .prepare(`PRAGMA foreign_key_list(${quoteSqliteIdentifier(tableName)})`)
        .all(),
    )
    const indexes = sqlite
      .prepare(`PRAGMA index_list(${quoteSqliteIdentifier(tableName)})`)
      .all()
      .filter(index => index.origin !== 'pk' && !index.name.startsWith('sqlite_autoindex'))
      .map(index => ({
        columns: sqlite
          .prepare(`PRAGMA index_info(${quoteSqliteIdentifier(index.name)})`)
          .all()
          .sort((left, right) => left.seqno - right.seqno)
          .map(column => column.name),
        name: index.name,
        unique: index.unique === 1,
      }))

    return {
      columns: tableInfo.map(column => ({
        defaultValue: column.dflt_value,
        name: column.name,
        notNull: column.notnull === 1,
        pkOrder: column.pk,
        type: column.type,
      })),
      foreignKeys,
      indexes,
      name: tableName,
      primaryKey: tableInfo
        .filter(column => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map(column => column.name),
    }
  })
}

export function sortLegacyTableMetadataForCreate(metadataList) {
  const metadataByName = new Map(metadataList.map(metadata => [metadata.name, metadata]))
  const dependencies = new Map(
    metadataList.map(metadata => [
      metadata.name,
      new Set(
        metadata.foreignKeys
          .map(foreignKey => foreignKey.referencedTable)
          .filter(
            referencedTable =>
              referencedTable !== metadata.name && metadataByName.has(referencedTable),
          ),
      ),
    ]),
  )
  const ordered = []
  const emitted = new Set()

  while (ordered.length < metadataList.length) {
    const next = metadataList.find(metadata => {
      if (emitted.has(metadata.name)) {
        return false
      }

      return [...(dependencies.get(metadata.name) ?? new Set())].every(dependency =>
        emitted.has(dependency),
      )
    })

    if (!next) {
      for (const metadata of metadataList) {
        if (!emitted.has(metadata.name)) {
          ordered.push(metadata)
          emitted.add(metadata.name)
        }
      }
      break
    }

    ordered.push(next)
    emitted.add(next.name)
  }

  return ordered
}

function isBooleanColumn(column) {
  const normalizedType = String(column.type ?? '').toLowerCase()
  const normalizedName = String(column.name).toLowerCase()
  const normalizedDefault =
    column.defaultValue == null
      ? ''
      : stripWrappingParentheses(String(column.defaultValue)).toLowerCase()

  return (
    normalizedType.includes('int') &&
    (normalizedName.startsWith('is_') ||
      normalizedName.startsWith('has_') ||
      normalizedName.startsWith('can_') ||
      normalizedDefault === 'true' ||
      normalizedDefault === 'false')
  )
}

function isDateTimeColumn(column) {
  const normalizedName = String(column.name).toLowerCase()
  const normalizedDefault =
    column.defaultValue == null
      ? ''
      : stripWrappingParentheses(String(column.defaultValue)).toLowerCase()

  return (
    normalizedName.endsWith('_at') ||
    normalizedDefault.includes('current_timestamp') ||
    normalizedDefault.includes('datetime') ||
    normalizedDefault.includes('strftime') ||
    normalizedDefault.includes("'now'")
  )
}

function getIndexedTextColumns(tableMetadata) {
  return new Set(
    tableMetadata.indexes.flatMap(index => index.columns).filter(Boolean),
  )
}

export function getSqlServerColumnType(column, tableMetadata) {
  const normalizedType = String(column.type ?? '').toLowerCase()
  const indexedTextColumns = getIndexedTextColumns(tableMetadata)

  if (normalizedType.includes('int')) {
    return isBooleanColumn(column) ? 'bit' : 'int'
  }

  if (isDateTimeColumn(column)) {
    return 'datetime2(3)'
  }

  if (indexedTextColumns.has(column.name)) {
    return 'nvarchar(450)'
  }

  return 'nvarchar(max)'
}

function formatSqlServerDefault(column, sqlServerType) {
  if (column.defaultValue == null) {
    return ''
  }

  const normalizedDefault = stripWrappingParentheses(String(column.defaultValue))
  const lowered = normalizedDefault.toLowerCase()

  if (sqlServerType === 'datetime2(3)') {
    if (
      lowered.includes('current_timestamp') ||
      lowered.includes('datetime') ||
      lowered.includes('strftime') ||
      lowered.includes("'now'")
    ) {
      return ' DEFAULT (SYSUTCDATETIME())'
    }

    return ` DEFAULT ('${escapeSqlServerStringLiteral(normalizedDefault.replace(/^'|'$/g, ''))}')`
  }

  if (sqlServerType === 'bit') {
    if (lowered === 'true') {
      return ' DEFAULT (1)'
    }

    if (lowered === 'false') {
      return ' DEFAULT (0)'
    }
  }

  if (sqlServerType === 'int' || sqlServerType === 'bit') {
    return ` DEFAULT (${normalizedDefault})`
  }

  const unquotedValue = normalizedDefault.replace(/^'|'$/g, '')
  return ` DEFAULT (N'${escapeSqlServerStringLiteral(unquotedValue)}')`
}

function createForeignKeyConstraint(tableName, foreignKey) {
  const name = `fk_${tableName}_${foreignKey.columns.join('_')}`
  const clauses = [
    `CONSTRAINT ${quoteSqlServerIdentifier(name)} FOREIGN KEY (${foreignKey.columns
      .map(quoteSqlServerIdentifier)
      .join(', ')}) REFERENCES ${quoteSqlServerIdentifier(foreignKey.referencedTable)} (${foreignKey.referencedColumns
      .map(quoteSqlServerIdentifier)
      .join(', ')})`,
  ]

  if (
    foreignKey.onDelete &&
    foreignKey.onDelete !== 'NO ACTION' &&
    foreignKey.onDelete !== 'RESTRICT'
  ) {
    clauses.push(`ON DELETE ${foreignKey.onDelete}`)
  }

  if (
    foreignKey.onUpdate &&
    foreignKey.onUpdate !== 'NO ACTION' &&
    foreignKey.onUpdate !== 'RESTRICT'
  ) {
    clauses.push(`ON UPDATE ${foreignKey.onUpdate}`)
  }

  return clauses.join(' ')
}

export function buildSqlServerCreateTableStatement(
  tableMetadata,
  options = {},
) {
  const includeForeignKeys = options.includeForeignKeys ?? true
  const primaryKeyColumns = tableMetadata.primaryKey
  const hasIdentityPrimaryKey =
    primaryKeyColumns.length === 1 &&
    String(
      tableMetadata.columns.find(column => column.name === primaryKeyColumns[0])?.type ?? '',
    )
      .toLowerCase()
      .includes('int')

  const columnDefinitions = tableMetadata.columns.map(column => {
    const sqlServerType = getSqlServerColumnType(column, tableMetadata)
    const isIdentity =
      hasIdentityPrimaryKey && column.name === primaryKeyColumns[0]
    const nullability = column.notNull || isIdentity ? 'NOT NULL' : 'NULL'

    return `  ${quoteSqlServerIdentifier(column.name)} ${sqlServerType}${isIdentity ? ' IDENTITY(1,1)' : ''} ${nullability}${isIdentity ? '' : formatSqlServerDefault(column, sqlServerType)}`
  })

  const constraints = []

  if (primaryKeyColumns.length > 0) {
    constraints.push(
      `  CONSTRAINT ${quoteSqlServerIdentifier(`pk_${tableMetadata.name}`)} PRIMARY KEY (${primaryKeyColumns
        .map(quoteSqlServerIdentifier)
      .join(', ')})`,
    )
  }

  if (includeForeignKeys) {
    for (const foreignKey of tableMetadata.foreignKeys) {
      constraints.push(
        `  ${createForeignKeyConstraint(tableMetadata.name, foreignKey)}`,
      )
    }
  }

  return `CREATE TABLE ${quoteSqlServerIdentifier(tableMetadata.name)} (\n${[...columnDefinitions, ...constraints].join(',\n')}\n);`
}

export function buildSqlServerAddForeignKeyStatements(metadataList) {
  const orderedMetadata = sortLegacyTableMetadataForCreate(metadataList)

  return orderedMetadata.flatMap(tableMetadata =>
    tableMetadata.foreignKeys.map(
      foreignKey =>
        `ALTER TABLE ${quoteSqlServerIdentifier(tableMetadata.name)} ADD ${createForeignKeyConstraint(
          tableMetadata.name,
          foreignKey,
        )};`,
    ),
  )
}

export function buildSqlServerSchemaStatements(metadataList) {
  const orderedMetadata = sortLegacyTableMetadataForCreate(metadataList)
  const createTableStatements = orderedMetadata.map(tableMetadata =>
    buildSqlServerCreateTableStatement(tableMetadata, {
      includeForeignKeys: false,
    }),
  )
  const indexStatements = orderedMetadata.flatMap(tableMetadata =>
    tableMetadata.indexes.map(index => {
      const uniquePrefix = index.unique ? 'UNIQUE ' : ''

      return `CREATE ${uniquePrefix}INDEX ${quoteSqlServerIdentifier(index.name)} ON ${quoteSqlServerIdentifier(tableMetadata.name)} (${index.columns
        .map(quoteSqlServerIdentifier)
        .join(', ')});`
    }),
  )
  const foreignKeyStatements = buildSqlServerAddForeignKeyStatements(metadataList)

  return [...createTableStatements, ...indexStatements, ...foreignKeyStatements]
}

export function buildSqlServerDropStatements(metadataList) {
  return [...sortLegacyTableMetadataForCreate(metadataList)]
    .reverse()
    .map(
      tableMetadata =>
        `IF OBJECT_ID(N'${escapeSqlServerStringLiteral(tableMetadata.name)}', N'U') IS NOT NULL DROP TABLE ${quoteSqlServerIdentifier(tableMetadata.name)};`,
    )
}

export function readLegacySeedRows(sqlite, tableMetadata) {
  const rows = sqlite
    .prepare(`SELECT * FROM ${quoteSqliteIdentifier(tableMetadata.name)}`)
    .all()

  return rows.map(row =>
    tableMetadata.columns.reduce((accumulator, column) => {
      accumulator[column.name] = row[column.name]
      return accumulator
    }, {}),
  )
}
