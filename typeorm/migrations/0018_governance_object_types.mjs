const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_responsibility_area_id') ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_specification_responsibility_area_id];",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_responsibility_areas_name_en' AND object_id = OBJECT_ID(N'specification_responsibility_areas')) DROP INDEX [uq_specification_responsibility_areas_name_en] ON [specification_responsibility_areas];",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_responsibility_areas_name_sv' AND object_id = OBJECT_ID(N'specification_responsibility_areas')) DROP INDEX [uq_specification_responsibility_areas_name_sv] ON [specification_responsibility_areas];",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_specification_responsibility_areas') ALTER TABLE [specification_responsibility_areas] DROP CONSTRAINT [pk_specification_responsibility_areas];",
  "IF COL_LENGTH(N'requirements_specifications', N'specification_responsibility_area_id') IS NOT NULL AND COL_LENGTH(N'requirements_specifications', N'specification_governance_object_type_id') IS NULL EXEC sp_rename N'requirements_specifications.specification_responsibility_area_id', N'specification_governance_object_type_id', N'COLUMN';",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND OBJECT_ID(N'specification_governance_object_types', N'U') IS NULL EXEC sp_rename N'specification_responsibility_areas', N'specification_governance_object_types';",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_specification_governance_object_types') ALTER TABLE [specification_governance_object_types] ADD CONSTRAINT [pk_specification_governance_object_types] PRIMARY KEY ([id]);",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_governance_object_types_name_en' AND object_id = OBJECT_ID(N'specification_governance_object_types')) CREATE UNIQUE INDEX [uq_specification_governance_object_types_name_en] ON [specification_governance_object_types] ([name_en]);",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_governance_object_types_name_sv' AND object_id = OBJECT_ID(N'specification_governance_object_types')) CREATE UNIQUE INDEX [uq_specification_governance_object_types_name_sv] ON [specification_governance_object_types] ([name_sv]);",
  "IF COL_LENGTH(N'requirements_specifications', N'specification_governance_object_type_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_governance_object_type_id') ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_specification_governance_object_type_id] FOREIGN KEY ([specification_governance_object_type_id]) REFERENCES [specification_governance_object_types] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
  "DELETE FROM [ui_terminology] WHERE [key] = N'responsibilityArea' AND EXISTS (SELECT 1 FROM [ui_terminology] WHERE [key] = N'governanceObjectType');",
  "UPDATE [ui_terminology] SET [key] = N'governanceObjectType', [singular_sv] = CASE WHEN [singular_sv] = N'Verksamhetsobjekt' THEN N'Styrningsobjektstyp' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Verksamhetsobjekt' THEN N'Styrningsobjektstyper' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Verksamhetsobjekten' THEN N'Styrningsobjektstyperna' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Business object' THEN N'Governance object type' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Business objects' THEN N'Governance object types' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Business objects' THEN N'Governance object types' ELSE [definite_plural_en] END WHERE [key] = N'responsibilityArea';",
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_governance_object_type_id') ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_specification_governance_object_type_id];",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_governance_object_types_name_en' AND object_id = OBJECT_ID(N'specification_governance_object_types')) DROP INDEX [uq_specification_governance_object_types_name_en] ON [specification_governance_object_types];",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_governance_object_types_name_sv' AND object_id = OBJECT_ID(N'specification_governance_object_types')) DROP INDEX [uq_specification_governance_object_types_name_sv] ON [specification_governance_object_types];",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_specification_governance_object_types') ALTER TABLE [specification_governance_object_types] DROP CONSTRAINT [pk_specification_governance_object_types];",
  "IF COL_LENGTH(N'requirements_specifications', N'specification_governance_object_type_id') IS NOT NULL AND COL_LENGTH(N'requirements_specifications', N'specification_responsibility_area_id') IS NULL EXEC sp_rename N'requirements_specifications.specification_governance_object_type_id', N'specification_responsibility_area_id', N'COLUMN';",
  "IF OBJECT_ID(N'specification_governance_object_types', N'U') IS NOT NULL AND OBJECT_ID(N'specification_responsibility_areas', N'U') IS NULL EXEC sp_rename N'specification_governance_object_types', N'specification_responsibility_areas';",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_specification_responsibility_areas') ALTER TABLE [specification_responsibility_areas] ADD CONSTRAINT [pk_specification_responsibility_areas] PRIMARY KEY ([id]);",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_responsibility_areas_name_en' AND object_id = OBJECT_ID(N'specification_responsibility_areas')) CREATE UNIQUE INDEX [uq_specification_responsibility_areas_name_en] ON [specification_responsibility_areas] ([name_en]);",
  "IF OBJECT_ID(N'specification_responsibility_areas', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_specification_responsibility_areas_name_sv' AND object_id = OBJECT_ID(N'specification_responsibility_areas')) CREATE UNIQUE INDEX [uq_specification_responsibility_areas_name_sv] ON [specification_responsibility_areas] ([name_sv]);",
  "IF COL_LENGTH(N'requirements_specifications', N'specification_responsibility_area_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_responsibility_area_id') ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_specification_responsibility_area_id] FOREIGN KEY ([specification_responsibility_area_id]) REFERENCES [specification_responsibility_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
  "DELETE FROM [ui_terminology] WHERE [key] = N'governanceObjectType' AND EXISTS (SELECT 1 FROM [ui_terminology] WHERE [key] = N'responsibilityArea');",
  "UPDATE [ui_terminology] SET [key] = N'responsibilityArea', [singular_sv] = CASE WHEN [singular_sv] = N'Styrningsobjektstyp' THEN N'Verksamhetsobjekt' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Styrningsobjektstyper' THEN N'Verksamhetsobjekt' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Styrningsobjektstyperna' THEN N'Verksamhetsobjekten' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Governance object type' THEN N'Business object' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Governance object types' THEN N'Business objects' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Governance object types' THEN N'Business objects' ELSE [definite_plural_en] END WHERE [key] = N'governanceObjectType';",
]

export class GovernanceObjectTypes1716000000000 {
  name = 'GovernanceObjectTypes1716000000000'
  async up(queryRunner) {
    for (const sql of UP_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
  async down(queryRunner) {
    for (const sql of DOWN_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
}
export default GovernanceObjectTypes1716000000000
