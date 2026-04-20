import {
  buildSqlServerDropStatements,
  buildSqlServerSchemaStatements,
  createLegacySqliteSnapshot,
  getLegacyTableMetadata,
} from '../../scripts/sqlserver-bootstrap.mjs'

export class InitialSqlServerSchema1713720000000 {
  name = 'InitialSqlServerSchema1713720000000'

  async up(queryRunner) {
    const sqlite = createLegacySqliteSnapshot()

    try {
      const metadata = getLegacyTableMetadata(sqlite)

      for (const statement of buildSqlServerSchemaStatements(metadata)) {
        await queryRunner.query(statement)
      }
    } finally {
      sqlite.close()
    }
  }

  async down(queryRunner) {
    const sqlite = createLegacySqliteSnapshot()

    try {
      const metadata = getLegacyTableMetadata(sqlite)

      for (const statement of buildSqlServerDropStatements(metadata)) {
        await queryRunner.query(statement)
      }
    } finally {
      sqlite.close()
    }
  }
}

export default InitialSqlServerSchema1713720000000
