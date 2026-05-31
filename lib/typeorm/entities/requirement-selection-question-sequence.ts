import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'

export interface RequirementSelectionQuestionSequenceEntity {
  area: RequirementAreaEntity
  areaId: number
  nextSequence: number
}

export const requirementSelectionQuestionSequenceEntity =
  new EntitySchema<RequirementSelectionQuestionSequenceEntity>({
    name: 'RequirementSelectionQuestionSequence',
    tableName: 'requirement_selection_question_sequences',
    columns: {
      areaId: {
        name: 'area_id',
        primary: true,
        type: 'int',
      },
      nextSequence: {
        default: 1,
        name: 'next_sequence',
        type: 'int',
      },
    },
    relations: {
      area: {
        type: 'one-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_question_sequences_area_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
