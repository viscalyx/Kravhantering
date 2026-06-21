import { EntitySchema } from 'typeorm'
import type { RfiQuestionEntity } from '@/lib/typeorm/entities/rfi-question'

export interface RfiQuestionVersionEntity {
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  expectedAnswerFormat: string | null
  helpText: string | null
  id: number
  isActive: boolean
  question: RfiQuestionEntity
  questionText: string
  rfiQuestionId: number
  updatedAt: Date
  versionNumber: number
}

export const rfiQuestionVersionEntity =
  new EntitySchema<RfiQuestionVersionEntity>({
    name: 'RfiQuestionVersion',
    tableName: 'rfi_question_versions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      rfiQuestionId: { name: 'rfi_question_id', type: 'int' },
      versionNumber: { name: 'version_number', type: 'int' },
      questionText: {
        length: 'MAX',
        name: 'question_text',
        type: 'nvarchar',
      },
      helpText: {
        length: 'MAX',
        name: 'help_text',
        nullable: true,
        type: 'nvarchar',
      },
      expectedAnswerFormat: {
        length: 'MAX',
        name: 'expected_answer_format',
        nullable: true,
        type: 'nvarchar',
      },
      isActive: { default: false, name: 'is_active', type: 'bit' },
      createdByHsaId: {
        length: 64,
        name: 'created_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      createdByDisplayName: {
        length: 'MAX',
        name: 'created_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    uniques: [
      {
        columns: ['rfiQuestionId', 'versionNumber'],
        name: 'uq_rfi_question_versions_question_version',
      },
    ],
    indices: [
      {
        columns: ['createdByHsaId'],
        name: 'idx_rfi_question_versions_created_by_hsa_id',
      },
    ],
    relations: {
      question: {
        type: 'many-to-one',
        target: 'RfiQuestion',
        joinColumn: {
          name: 'rfi_question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_rfi_question_versions_rfi_question_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
