import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'

export interface RfiQuestionEntity {
  archivedAt: Date | null
  area: RequirementAreaEntity
  areaId: number
  createdAt: Date
  id: number
  isArchived: boolean
  questionCode: string
  sortOrder: number
  updatedAt: Date
}

export const rfiQuestionEntity = new EntitySchema<RfiQuestionEntity>({
  name: 'RfiQuestion',
  tableName: 'rfi_questions',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'int',
    },
    areaId: { name: 'area_id', type: 'int' },
    questionCode: { length: 64, name: 'question_code', type: 'nvarchar' },
    sortOrder: { default: 0, name: 'sort_order', type: 'int' },
    isArchived: { default: false, name: 'is_archived', type: 'bit' },
    archivedAt: { name: 'archived_at', nullable: true, type: 'datetime2' },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [
    {
      columns: ['questionCode'],
      name: 'uq_rfi_questions_question_code',
    },
  ],
  indices: [
    {
      columns: ['areaId', 'sortOrder'],
      name: 'idx_rfi_questions_area_sort_order',
    },
    {
      columns: ['isArchived', 'archivedAt'],
      name: 'idx_rfi_questions_is_archived',
    },
  ],
  relations: {
    area: {
      type: 'many-to-one',
      target: 'RequirementArea',
      joinColumn: {
        name: 'area_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_rfi_questions_area_id',
      },
      nullable: false,
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  },
})
