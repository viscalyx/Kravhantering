import { EntitySchema } from 'typeorm'

export interface UiTerminologyEntity {
  definitePluralEn: string
  definitePluralSv: string
  id: number
  key: string
  pluralEn: string
  pluralSv: string
  singularEn: string
  singularSv: string
  updatedAt: Date
}

export const uiTerminologyEntity = new EntitySchema<UiTerminologyEntity>({
  name: 'UiTerminology',
  tableName: 'ui_terminology',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    key: { name: 'key', type: 'nvarchar', length: 450 },
    singularSv: { name: 'singular_sv', type: 'nvarchar', length: 'MAX' },
    pluralSv: { name: 'plural_sv', type: 'nvarchar', length: 'MAX' },
    definitePluralSv: {
      name: 'definite_plural_sv',
      type: 'nvarchar',
      length: 'MAX',
    },
    singularEn: { name: 'singular_en', type: 'nvarchar', length: 'MAX' },
    pluralEn: { name: 'plural_en', type: 'nvarchar', length: 'MAX' },
    definitePluralEn: {
      name: 'definite_plural_en',
      type: 'nvarchar',
      length: 'MAX',
    },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [{ name: 'uq_ui_terminology_key', columns: ['key'] }],
})
