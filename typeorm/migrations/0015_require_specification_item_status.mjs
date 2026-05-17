const UP_STATEMENTS = [
  `IF EXISTS (
  SELECT 1 FROM [requirements_specification_items]
  WHERE [specification_item_status_id] IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM [specification_item_statuses]
  WHERE [id] = 1
)
  THROW 51000, N'Cannot require requirements_specification_items.specification_item_status_id: default Included status id 1 is missing.', 1;`,
  `IF EXISTS (
  SELECT 1 FROM [specification_local_requirements]
  WHERE [specification_item_status_id] IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM [specification_item_statuses]
  WHERE [id] = 1
)
  THROW 51000, N'Cannot require specification_local_requirements.specification_item_status_id: default Included status id 1 is missing.', 1;`,
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specification_items_specification_item_status_id') ALTER TABLE [requirements_specification_items] DROP CONSTRAINT [fk_requirements_specification_items_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_specification_item_status_id') ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [fk_specification_local_requirements_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirements_specification_items_specification_item_status_id' AND object_id = OBJECT_ID(N'requirements_specification_items')) DROP INDEX [idx_requirements_specification_items_specification_item_status_id] ON [requirements_specification_items];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirements_specification_item_status_id' AND object_id = OBJECT_ID(N'specification_local_requirements')) DROP INDEX [idx_specification_local_requirements_specification_item_status_id] ON [specification_local_requirements];",
  'UPDATE [requirements_specification_items] SET [specification_item_status_id] = 1 WHERE [specification_item_status_id] IS NULL;',
  'UPDATE [specification_local_requirements] SET [specification_item_status_id] = 1 WHERE [specification_item_status_id] IS NULL;',
  'ALTER TABLE [requirements_specification_items] ALTER COLUMN [specification_item_status_id] int NOT NULL;',
  'ALTER TABLE [specification_local_requirements] ALTER COLUMN [specification_item_status_id] int NOT NULL;',
  "IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirements_specification_items_specification_item_status_id' AND parent_object_id = OBJECT_ID(N'requirements_specification_items')) ALTER TABLE [requirements_specification_items] ADD CONSTRAINT [df_requirements_specification_items_specification_item_status_id] DEFAULT (1) FOR [specification_item_status_id];",
  "IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_specification_local_requirements_specification_item_status_id' AND parent_object_id = OBJECT_ID(N'specification_local_requirements')) ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [df_specification_local_requirements_specification_item_status_id] DEFAULT (1) FOR [specification_item_status_id];",
  'CREATE INDEX [idx_requirements_specification_items_specification_item_status_id] ON [requirements_specification_items] ([specification_item_status_id]);',
  'CREATE INDEX [idx_specification_local_requirements_specification_item_status_id] ON [specification_local_requirements] ([specification_item_status_id]);',
  'ALTER TABLE [requirements_specification_items] ADD CONSTRAINT [fk_requirements_specification_items_specification_item_status_id] FOREIGN KEY ([specification_item_status_id]) REFERENCES [specification_item_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  'ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_specification_item_status_id] FOREIGN KEY ([specification_item_status_id]) REFERENCES [specification_item_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specification_items_specification_item_status_id') ALTER TABLE [requirements_specification_items] DROP CONSTRAINT [fk_requirements_specification_items_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_specification_item_status_id') ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [fk_specification_local_requirements_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirements_specification_items_specification_item_status_id' AND parent_object_id = OBJECT_ID(N'requirements_specification_items')) ALTER TABLE [requirements_specification_items] DROP CONSTRAINT [df_requirements_specification_items_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_specification_local_requirements_specification_item_status_id' AND parent_object_id = OBJECT_ID(N'specification_local_requirements')) ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [df_specification_local_requirements_specification_item_status_id];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirements_specification_items_specification_item_status_id' AND object_id = OBJECT_ID(N'requirements_specification_items')) DROP INDEX [idx_requirements_specification_items_specification_item_status_id] ON [requirements_specification_items];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirements_specification_item_status_id' AND object_id = OBJECT_ID(N'specification_local_requirements')) DROP INDEX [idx_specification_local_requirements_specification_item_status_id] ON [specification_local_requirements];",
  'ALTER TABLE [requirements_specification_items] ALTER COLUMN [specification_item_status_id] int NULL;',
  'ALTER TABLE [specification_local_requirements] ALTER COLUMN [specification_item_status_id] int NULL;',
  'CREATE INDEX [idx_requirements_specification_items_specification_item_status_id] ON [requirements_specification_items] ([specification_item_status_id]);',
  'CREATE INDEX [idx_specification_local_requirements_specification_item_status_id] ON [specification_local_requirements] ([specification_item_status_id]);',
  'ALTER TABLE [requirements_specification_items] ADD CONSTRAINT [fk_requirements_specification_items_specification_item_status_id] FOREIGN KEY ([specification_item_status_id]) REFERENCES [specification_item_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  'ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_specification_item_status_id] FOREIGN KEY ([specification_item_status_id]) REFERENCES [specification_item_statuses] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;',
]

export class RequireSpecificationItemStatus1716200000000 {
  name = 'RequireSpecificationItemStatus1716200000000'

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

export default RequireSpecificationItemStatus1716200000000
