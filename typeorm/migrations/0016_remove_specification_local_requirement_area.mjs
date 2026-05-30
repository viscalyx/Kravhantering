const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_requirement_area_id') ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [fk_specification_local_requirements_requirement_area_id];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirements_requirement_area_id' AND object_id = OBJECT_ID(N'specification_local_requirements')) DROP INDEX [idx_specification_local_requirements_requirement_area_id] ON [specification_local_requirements];",
  "IF COL_LENGTH(N'specification_local_requirements', N'requirement_area_id') IS NOT NULL ALTER TABLE [specification_local_requirements] DROP COLUMN [requirement_area_id];",
]

const DOWN_STATEMENTS = [
  "IF COL_LENGTH(N'specification_local_requirements', N'requirement_area_id') IS NULL ALTER TABLE [specification_local_requirements] ADD [requirement_area_id] int NULL;",
  "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirements_requirement_area_id' AND object_id = OBJECT_ID(N'specification_local_requirements')) CREATE INDEX [idx_specification_local_requirements_requirement_area_id] ON [specification_local_requirements] ([requirement_area_id]);",
  "IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_requirement_area_id') ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_requirement_area_id] FOREIGN KEY ([requirement_area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
]

export class RemoveSpecificationLocalRequirementArea1716300000000 {
  name = 'RemoveSpecificationLocalRequirementArea1716300000000'

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

export default RemoveSpecificationLocalRequirementArea1716300000000
