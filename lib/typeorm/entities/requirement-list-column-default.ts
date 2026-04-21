import { EntitySchema } from 'typeorm'

export interface RequirementListColumnDefaultEntity {
  columnId: string
  id: number
  isDefaultVisible: boolean
  sortOrder: number
  updatedAt: Date
}

export const requirementListColumnDefaultEntity =
  new EntitySchema<RequirementListColumnDefaultEntity>({
    name: 'RequirementListColumnDefault',
    tableName: 'requirement_list_column_defaults',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      columnId: { name: 'column_id', type: 'nvarchar', length: 450 },
      sortOrder: { name: 'sort_order', type: 'int' },
      isDefaultVisible: {
        name: 'is_default_visible',
        type: 'bit',
        default: true,
      },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    uniques: [
      {
        name: 'uq_requirement_list_column_defaults_column_id',
        columns: ['columnId'],
      },
      {
        name: 'uq_requirement_list_column_defaults_sort_order',
        columns: ['sortOrder'],
      },
    ],
  })
