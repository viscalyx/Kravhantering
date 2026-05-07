import { EntitySchema } from 'typeorm'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'

export interface SpecificationLocalRequirementDeviationEntity {
  createdAt: Date
  createdBy: string | null
  decidedAt: Date | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: boolean
  motivation: string
  specificationLocalRequirement: SpecificationLocalRequirementEntity
  updatedAt: Date | null
}

export const specificationLocalRequirementDeviationEntity =
  new EntitySchema<SpecificationLocalRequirementDeviationEntity>({
    name: 'SpecificationLocalRequirementDeviation',
    tableName: 'specification_local_requirement_deviations',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      motivation: { name: 'motivation', type: 'nvarchar', length: 'MAX' },
      isReviewRequested: {
        name: 'is_review_requested',
        type: 'bit',
        default: false,
      },
      decision: { name: 'decision', type: 'int', nullable: true },
      decisionMotivation: {
        name: 'decision_motivation',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      decidedBy: {
        name: 'decided_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      decidedAt: { name: 'decided_at', type: 'datetime2', nullable: true },
      createdBy: {
        name: 'created_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2', nullable: true },
    },
    indices: [
      {
        name: 'idx_specification_local_requirement_deviations_specification_local_requirement_id',
        columns: ['specificationLocalRequirement'],
      },
    ],
    relations: {
      specificationLocalRequirement: {
        type: 'many-to-one',
        target: 'SpecificationLocalRequirement',
        joinColumn: {
          name: 'specification_local_requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirement_deviations_specification_local_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
