const UP_STATEMENTS = [
  'ALTER TABLE [norm_references] ADD [is_archived] bit NOT NULL CONSTRAINT [df_norm_references_is_archived] DEFAULT 0;',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_norm_references_is_archived') ALTER TABLE [norm_references] DROP CONSTRAINT [df_norm_references_is_archived];",
  'ALTER TABLE [norm_references] DROP COLUMN [is_archived];',
]

export class NormReferencesArchived1716800000000 {
  name = 'NormReferencesArchived1716800000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) {
      await queryRunner.query(statement)
    }
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) {
      await queryRunner.query(statement)
    }
  }
}

export default NormReferencesArchived1716800000000
