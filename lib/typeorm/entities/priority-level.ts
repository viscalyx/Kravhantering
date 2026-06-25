import { EntitySchema } from 'typeorm'

export interface PriorityLevelEntity {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

export const priorityLevelEntity = new EntitySchema<PriorityLevelEntity>({
  name: 'PriorityLevel',
  tableName: 'priority_levels',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    code: { name: 'code', type: 'nvarchar', length: 16 },
    nameSv: { name: 'name_sv', type: 'nvarchar', length: 450 },
    nameEn: { name: 'name_en', type: 'nvarchar', length: 450 },
    descriptionSv: { name: 'description_sv', type: 'nvarchar', length: 'MAX' },
    descriptionEn: { name: 'description_en', type: 'nvarchar', length: 'MAX' },
    assessmentCriteriaSv: {
      name: 'assessment_criteria_sv',
      type: 'nvarchar',
      length: 'MAX',
    },
    assessmentCriteriaEn: {
      name: 'assessment_criteria_en',
      type: 'nvarchar',
      length: 'MAX',
    },
    sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    color: { name: 'color', type: 'nvarchar', length: 'MAX' },
    iconName: {
      name: 'icon_name',
      type: 'nvarchar',
      length: 64,
      nullable: true,
    },
  },
  uniques: [
    { name: 'uq_priority_levels_code', columns: ['code'] },
    { name: 'uq_priority_levels_name_en', columns: ['nameEn'] },
    { name: 'uq_priority_levels_name_sv', columns: ['nameSv'] },
  ],
})
