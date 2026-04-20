import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildSqlServerCreateTableStatement,
  buildSqlServerDropStatements,
  buildSqlServerSchemaStatements,
  getLegacyTableMetadata,
  getSqlServerColumnType,
  listLegacyTables,
  readLegacySeedRows,
  sortLegacyTableMetadataForCreate,
  splitLegacySqlStatements,
} from '../sqlserver-bootstrap.mjs'

describe('sqlserver-bootstrap.mjs', () => {
  const sqliteHandles = []

  afterEach(() => {
    for (const sqlite of sqliteHandles) {
      sqlite.close()
    }
    sqliteHandles.length = 0
  })

  it('splits legacy SQL files on statement breakpoints', () => {
    expect(
      splitLegacySqlStatements(`
        CREATE TABLE one (id integer);
        --> statement-breakpoint
        CREATE TABLE two (id integer);
      `),
    ).toEqual([
      'CREATE TABLE one (id integer);',
      'CREATE TABLE two (id integer);',
    ])
  })

  it('extracts legacy metadata and orders tables by foreign key dependency', () => {
    const sqlite = new BetterSqlite3(':memory:')
    sqliteHandles.push(sqlite)

    sqlite.exec(`
      CREATE TABLE parents (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name_sv text NOT NULL
      );

      CREATE TABLE children (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        parent_id integer NOT NULL,
        is_active integer NOT NULL DEFAULT 0,
        created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_children_parent_id FOREIGN KEY (parent_id) REFERENCES parents(id)
      );

      CREATE UNIQUE INDEX uq_parents_name_sv ON parents(name_sv);
      CREATE INDEX idx_children_parent_id ON children(parent_id);

      INSERT INTO parents (id, name_sv) VALUES (1, 'Sakerhet');
      INSERT INTO children (id, parent_id, is_active) VALUES (2, 1, 1);
    `)

    const metadata = getLegacyTableMetadata(sqlite)

    expect(listLegacyTables(sqlite)).toEqual(['children', 'parents'])
    expect(sortLegacyTableMetadataForCreate(metadata).map(table => table.name)).toEqual([
      'parents',
      'children',
    ])

    const parentTable = metadata.find(table => table.name === 'parents')
    const childTable = metadata.find(table => table.name === 'children')

    expect(getSqlServerColumnType(parentTable.columns[1], parentTable)).toBe(
      'nvarchar(450)',
    )
    expect(getSqlServerColumnType(childTable.columns[2], childTable)).toBe('bit')
    expect(getSqlServerColumnType(childTable.columns[3], childTable)).toBe(
      'datetime2(3)',
    )

    expect(buildSqlServerCreateTableStatement(childTable)).toContain(
      'CONSTRAINT [fk_children_parent_id] FOREIGN KEY ([parent_id]) REFERENCES [parents] ([id])',
    )
    expect(buildSqlServerCreateTableStatement(childTable)).toContain(
      '[is_active] bit NOT NULL DEFAULT (0)',
    )

    const schemaStatements = buildSqlServerSchemaStatements(metadata)
    expect(schemaStatements[0]).toContain('CREATE TABLE [parents]')
    expect(schemaStatements[1]).toContain('CREATE TABLE [children]')
    expect(schemaStatements[2]).toContain(
      'CREATE UNIQUE INDEX [uq_parents_name_sv] ON [parents] ([name_sv]);',
    )
    expect(schemaStatements[3]).toContain(
      'CREATE INDEX [idx_children_parent_id] ON [children] ([parent_id]);',
    )

    expect(buildSqlServerDropStatements(metadata)).toEqual([
      "IF OBJECT_ID(N'children', N'U') IS NOT NULL DROP TABLE [children];",
      "IF OBJECT_ID(N'parents', N'U') IS NOT NULL DROP TABLE [parents];",
    ])

    expect(readLegacySeedRows(sqlite, parentTable)).toEqual([
      { id: 1, name_sv: 'Sakerhet' },
    ])
  })
})
