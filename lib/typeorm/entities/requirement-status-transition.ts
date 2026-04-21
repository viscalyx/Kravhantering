import { EntitySchema } from 'typeorm'
import type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'

export interface RequirementStatusTransitionEntity {
  fromRequirementStatus: RequirementStatusEntity
  id: number
  toRequirementStatus: RequirementStatusEntity
}

export const requirementStatusTransitionEntity =
  new EntitySchema<RequirementStatusTransitionEntity>({
    name: 'RequirementStatusTransition',
    tableName: 'requirement_status_transitions',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
    },
    uniques: [
      {
        name: 'uq_requirement_status_transitions_from_to',
        columns: ['fromRequirementStatus', 'toRequirementStatus'],
      },
    ],
    relations: {
      fromRequirementStatus: {
        type: 'many-to-one',
        target: 'RequirementStatus',
        joinColumn: {
          name: 'from_requirement_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_status_transitions_from_requirement_status_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
      },
      toRequirementStatus: {
        type: 'many-to-one',
        target: 'RequirementStatus',
        joinColumn: {
          name: 'to_requirement_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_status_transitions_to_requirement_status_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
      },
    },
  })
