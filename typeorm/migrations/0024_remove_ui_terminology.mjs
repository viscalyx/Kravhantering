const UP_STATEMENTS = [
  "IF OBJECT_ID(N'ui_terminology', N'U') IS NOT NULL DROP TABLE [ui_terminology];",
]

const DOWN_STATEMENTS = [
  'CREATE TABLE [ui_terminology] (\n  [id] int IDENTITY(1,1) NOT NULL,\n  [key] nvarchar(450) NOT NULL,\n  [singular_sv] nvarchar(max) NOT NULL,\n  [plural_sv] nvarchar(max) NOT NULL,\n  [definite_plural_sv] nvarchar(max) NOT NULL,\n  [singular_en] nvarchar(max) NOT NULL,\n  [plural_en] nvarchar(max) NOT NULL,\n  [definite_plural_en] nvarchar(max) NOT NULL,\n  [updated_at] datetime2(3) NOT NULL,\n  CONSTRAINT [pk_ui_terminology] PRIMARY KEY ([id])\n);',
  'CREATE UNIQUE INDEX [uq_ui_terminology_key] ON [ui_terminology] ([key]);',
]

export class RemoveUiTerminology1716700000000 {
  name = 'RemoveUiTerminology1716700000000'

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

export default RemoveUiTerminology1716700000000
