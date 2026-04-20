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
        try {
          await queryRunner.query(statement)
        } catch (error) {
          const details =
            error instanceof Error ? error.message : String(error)
          throw new Error(
            `InitialSqlServerSchema1713720000000 failed while executing SQL:\n${statement}\n\n${details}`,
          )
        }
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
        try {
          await queryRunner.query(statement)
        } catch (error) {
          const details =
            error instanceof Error ? error.message : String(error)
          throw new Error(
            `InitialSqlServerSchema1713720000000 failed while rolling back SQL:\n${statement}\n\n${details}`,
          )
        }
      }
    } finally {
      sqlite.close()
    }
  }
}

export default InitialSqlServerSchema1713720000000
