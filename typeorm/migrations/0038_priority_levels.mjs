const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_risk_level_id') ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [fk_specification_local_requirements_risk_level_id];",
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_risk_level_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_risk_level_id];",
  "IF COL_LENGTH(N'specification_local_requirements', N'risk_level_id') IS NOT NULL UPDATE [specification_local_requirements] SET [risk_level_id] = CASE [risk_level_id] WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 4 ELSE NULL END WHERE [risk_level_id] IS NOT NULL;",
  "IF COL_LENGTH(N'requirement_versions', N'risk_level_id') IS NOT NULL UPDATE [requirement_versions] SET [risk_level_id] = CASE [risk_level_id] WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 4 ELSE NULL END WHERE [risk_level_id] IS NOT NULL;",
  "IF OBJECT_ID(N'risk_levels', N'U') IS NOT NULL AND OBJECT_ID(N'priority_levels', N'U') IS NULL EXEC sp_rename N'risk_levels', N'priority_levels';",
  "IF COL_LENGTH(N'specification_local_requirements', N'risk_level_id') IS NOT NULL EXEC sp_rename N'specification_local_requirements.risk_level_id', N'priority_level_id', N'COLUMN';",
  "IF COL_LENGTH(N'requirement_versions', N'risk_level_id') IS NOT NULL EXEC sp_rename N'requirement_versions.risk_level_id', N'priority_level_id', N'COLUMN';",
  "IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_risk_levels') EXEC sp_rename N'pk_risk_levels', N'pk_priority_levels', N'OBJECT';",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_risk_levels_name_en' AND object_id = OBJECT_ID(N'priority_levels')) EXEC sp_rename N'priority_levels.uq_risk_levels_name_en', N'uq_priority_levels_name_en', N'INDEX';",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_risk_levels_name_sv' AND object_id = OBJECT_ID(N'priority_levels')) EXEC sp_rename N'priority_levels.uq_risk_levels_name_sv', N'uq_priority_levels_name_sv', N'INDEX';",
  "IF COL_LENGTH(N'priority_levels', N'code') IS NULL ALTER TABLE [priority_levels] ADD [code] nvarchar(16) NULL;",
  "IF COL_LENGTH(N'priority_levels', N'description_sv') IS NULL ALTER TABLE [priority_levels] ADD [description_sv] nvarchar(max) NULL;",
  "IF COL_LENGTH(N'priority_levels', N'description_en') IS NULL ALTER TABLE [priority_levels] ADD [description_en] nvarchar(max) NULL;",
  "IF COL_LENGTH(N'priority_levels', N'assessment_criteria_sv') IS NULL ALTER TABLE [priority_levels] ADD [assessment_criteria_sv] nvarchar(max) NULL;",
  "IF COL_LENGTH(N'priority_levels', N'assessment_criteria_en') IS NULL ALTER TABLE [priority_levels] ADD [assessment_criteria_en] nvarchar(max) NULL;",
  "IF COL_LENGTH(N'priority_levels', N'icon_name') IS NULL ALTER TABLE [priority_levels] ADD [icon_name] nvarchar(64) NULL;",
  'DELETE FROM [priority_levels];',
  'SET IDENTITY_INSERT [priority_levels] ON;',
  "INSERT INTO [priority_levels] ([id], [code], [name_sv], [name_en], [description_sv], [description_en], [assessment_criteria_sv], [assessment_criteria_en], [sort_order], [color], [icon_name]) VALUES (1, N'P1', N'Mycket låg', N'Very low', N'Kravet har liten eller marginell betydelse för verksamheten och dess mål. Det är i huvudsak ett tilläggs- eller framtidskrav och kan utan större konsekvenser skjutas upp eller utgå.', N'The requirement has little or marginal importance for the organization and its goals. It is mainly an add-on or future requirement and can be postponed or omitted without major consequences.', N'Marginell betydelse för verksamhetsmål, låg nytta, mycket låg risk vid uteblivet uppfyllande, liten betydelse för intressenter.', N'Marginal importance for business goals, low benefit, very low risk if not fulfilled, little importance for stakeholders.', 5, N'#6b7280', N'Circle'), (2, N'P2', N'Låg', N'Low', N'Kravet är önskvärt men har begränsad betydelse för verksamhetens mål, riskbild och centrala intressenters behov. Om kravet inte uppfylls blir konsekvenserna små och påverkan är huvudsakligen av förbättrings- eller kvalitetskaraktär.', N'The requirement is desirable but has limited importance for the organization''s goals, risk profile, and key stakeholder needs. If the requirement is not fulfilled, the consequences are small and the impact is mainly improvement- or quality-oriented.', N'Begränsad betydelse för verksamhetsmål, låg till måttlig nytta, låg risk vid uteblivet uppfyllande, begränsad påverkan på intressenter.', N'Limited importance for business goals, low to moderate benefit, low risk if not fulfilled, limited impact on stakeholders.', 4, N'#22c55e', N'ArrowDownLeft'), (3, N'P3', N'Medelhög', N'Medium high', N'Kravet är viktigt men inte avgörande. Det bidrar tydligt till verksamhetsnytta, kvalitet eller effektivitet, men ett uteblivet uppfyllande innebär främst hanterbara begränsningar, alternativa arbetssätt eller reducerad nytta.', N'The requirement is important but not decisive. It clearly contributes to business benefit, quality, or efficiency, but non-fulfilment mainly results in manageable limitations, alternative ways of working, or reduced benefit.', N'Tydlig men inte avgörande betydelse för verksamhetsmål, måttlig till hög nytta, hanterbar risk, märkbar men inte kritisk betydelse för intressenter.', N'Clear but not decisive importance for business goals, moderate to high benefit, manageable risk, noticeable but not critical importance for stakeholders.', 3, N'#eab308', N'CircleDot'), (4, N'P4', N'Hög', N'High', N'Kravet är mycket viktigt för att uppnå centrala mål och nyttor samt för att möta viktiga intressenters behov. Om kravet inte uppfylls uppstår betydande negativa konsekvenser, men lösningen kan i vissa fall ändå användas med begränsningar under en övergångsperiod.', N'The requirement is very important for achieving central goals and benefits and for meeting important stakeholder needs. If the requirement is not fulfilled, significant negative consequences arise, but in some cases the solution can still be used with limitations during a transition period.', N'Stor betydelse för verksamhetsmål, hög nytta, hög risk vid uteblivet uppfyllande, stor betydelse för viktiga intressenter.', N'High importance for business goals, high benefit, high risk if not fulfilled, high importance for important stakeholders.', 2, N'#f97316', N'AlertCircle'), (5, N'P5', N'Mycket hög', N'Very high', N'Kravet är kritiskt och måste uppfyllas för att verksamhetens mål, lagkrav, säkerhet, kontinuitet eller avgörande nyttor ska kunna säkerställas. Om kravet inte uppfylls medför det mycket stora konsekvenser, oacceptabla risker eller att lösningen inte kan tas i bruk.', N'The requirement is critical and must be fulfilled to ensure the organization''s goals, legal requirements, security, continuity, or decisive benefits. If the requirement is not fulfilled, it leads to very large consequences, unacceptable risks, or the solution cannot be put into use.', N'Avgörande betydelse för verksamhetsmål, mycket hög nytta, mycket hög risk vid uteblivet uppfyllande, mycket stor betydelse för centrala intressenter, eller direkt koppling till lag, säkerhet eller kontinuitet.', N'Decisive importance for business goals, very high benefit, very high risk if not fulfilled, very high importance for key stakeholders, or a direct connection to law, security, or continuity.', 1, N'#ef4444', N'AlertTriangle');",
  'SET IDENTITY_INSERT [priority_levels] OFF;',
  'ALTER TABLE [priority_levels] ALTER COLUMN [code] nvarchar(16) NOT NULL;',
  'ALTER TABLE [priority_levels] ALTER COLUMN [description_sv] nvarchar(max) NOT NULL;',
  'ALTER TABLE [priority_levels] ALTER COLUMN [description_en] nvarchar(max) NOT NULL;',
  'ALTER TABLE [priority_levels] ALTER COLUMN [assessment_criteria_sv] nvarchar(max) NOT NULL;',
  'ALTER TABLE [priority_levels] ALTER COLUMN [assessment_criteria_en] nvarchar(max) NOT NULL;',
  "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_code' AND object_id = OBJECT_ID(N'priority_levels')) CREATE UNIQUE INDEX [uq_priority_levels_code] ON [priority_levels] ([code]);",
  "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_name_en' AND object_id = OBJECT_ID(N'priority_levels')) CREATE UNIQUE INDEX [uq_priority_levels_name_en] ON [priority_levels] ([name_en]);",
  "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_name_sv' AND object_id = OBJECT_ID(N'priority_levels')) CREATE UNIQUE INDEX [uq_priority_levels_name_sv] ON [priority_levels] ([name_sv]);",
  "IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_priority_level_id') ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_priority_level_id] FOREIGN KEY ([priority_level_id]) REFERENCES [priority_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
  "IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_priority_level_id') ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_priority_level_id] FOREIGN KEY ([priority_level_id]) REFERENCES [priority_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_priority_level_id') ALTER TABLE [specification_local_requirements] DROP CONSTRAINT [fk_specification_local_requirements_priority_level_id];",
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_priority_level_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_priority_level_id];",
  "IF COL_LENGTH(N'specification_local_requirements', N'priority_level_id') IS NOT NULL AND EXISTS (SELECT 1 FROM [specification_local_requirements] WHERE [priority_level_id] IN (1, 5)) THROW 51038, 'Cannot roll back priority levels while specification-local requirements use P1 or P5 values.', 1;",
  "IF COL_LENGTH(N'requirement_versions', N'priority_level_id') IS NOT NULL AND EXISTS (SELECT 1 FROM [requirement_versions] WHERE [priority_level_id] IN (1, 5)) THROW 51038, 'Cannot roll back priority levels while requirement versions use P1 or P5 values.', 1;",
  "IF COL_LENGTH(N'specification_local_requirements', N'priority_level_id') IS NOT NULL UPDATE [specification_local_requirements] SET [priority_level_id] = CASE [priority_level_id] WHEN 2 THEN 1 WHEN 3 THEN 2 WHEN 4 THEN 3 ELSE NULL END WHERE [priority_level_id] IS NOT NULL;",
  "IF COL_LENGTH(N'requirement_versions', N'priority_level_id') IS NOT NULL UPDATE [requirement_versions] SET [priority_level_id] = CASE [priority_level_id] WHEN 2 THEN 1 WHEN 3 THEN 2 WHEN 4 THEN 3 ELSE NULL END WHERE [priority_level_id] IS NOT NULL;",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_code' AND object_id = OBJECT_ID(N'priority_levels')) DROP INDEX [uq_priority_levels_code] ON [priority_levels];",
  'DELETE FROM [priority_levels];',
  'SET IDENTITY_INSERT [priority_levels] ON;',
  "INSERT INTO [priority_levels] ([id], [name_sv], [name_en], [sort_order], [color], [icon_name], [code], [description_sv], [description_en], [assessment_criteria_sv], [assessment_criteria_en]) VALUES (1, N'Låg', N'Low', 1, N'#22c55e', N'ArrowDownLeft', N'P2', N'', N'', N'', N''), (2, N'Medel', N'Medium', 2, N'#eab308', N'AlertCircle', N'P3', N'', N'', N'', N''), (3, N'Hög', N'High', 3, N'#ef4444', N'AlertTriangle', N'P4', N'', N'', N'', N'');",
  'SET IDENTITY_INSERT [priority_levels] OFF;',
  "IF COL_LENGTH(N'priority_levels', N'assessment_criteria_en') IS NOT NULL ALTER TABLE [priority_levels] DROP COLUMN [assessment_criteria_en];",
  "IF COL_LENGTH(N'priority_levels', N'assessment_criteria_sv') IS NOT NULL ALTER TABLE [priority_levels] DROP COLUMN [assessment_criteria_sv];",
  "IF COL_LENGTH(N'priority_levels', N'description_en') IS NOT NULL ALTER TABLE [priority_levels] DROP COLUMN [description_en];",
  "IF COL_LENGTH(N'priority_levels', N'description_sv') IS NOT NULL ALTER TABLE [priority_levels] DROP COLUMN [description_sv];",
  "IF COL_LENGTH(N'priority_levels', N'code') IS NOT NULL ALTER TABLE [priority_levels] DROP COLUMN [code];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_name_en' AND object_id = OBJECT_ID(N'priority_levels')) EXEC sp_rename N'priority_levels.uq_priority_levels_name_en', N'uq_risk_levels_name_en', N'INDEX';",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_priority_levels_name_sv' AND object_id = OBJECT_ID(N'priority_levels')) EXEC sp_rename N'priority_levels.uq_priority_levels_name_sv', N'uq_risk_levels_name_sv', N'INDEX';",
  "IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'pk_priority_levels') EXEC sp_rename N'pk_priority_levels', N'pk_risk_levels', N'OBJECT';",
  "IF COL_LENGTH(N'specification_local_requirements', N'priority_level_id') IS NOT NULL EXEC sp_rename N'specification_local_requirements.priority_level_id', N'risk_level_id', N'COLUMN';",
  "IF COL_LENGTH(N'requirement_versions', N'priority_level_id') IS NOT NULL EXEC sp_rename N'requirement_versions.priority_level_id', N'risk_level_id', N'COLUMN';",
  "IF OBJECT_ID(N'priority_levels', N'U') IS NOT NULL AND OBJECT_ID(N'risk_levels', N'U') IS NULL EXEC sp_rename N'priority_levels', N'risk_levels';",
  "IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_local_requirements_risk_level_id') ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
  "IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_risk_level_id') ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;",
]

async function runStatements(queryRunner, statements) {
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index]
    if (statement === 'SET IDENTITY_INSERT [priority_levels] ON;') {
      await queryRunner.query(
        [statement, statements[index + 1], statements[index + 2]].join('\n'),
      )
      index += 2
      continue
    }

    await queryRunner.query(statement)
  }
}

export class PriorityLevels1718500000000 {
  name = 'PriorityLevels1718500000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default PriorityLevels1718500000000
