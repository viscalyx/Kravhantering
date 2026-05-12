import { EntitySchema } from 'typeorm'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'

export interface SpecificationLocalRequirementDeviationEntity {
  createdAt: Date
  createdBy: string | null
  createdByHsaId: string | null
  decidedAt: Date | null
  decidedBy: string | null
  decidedByHsaId: string | null
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
      decidedByHsaId: {
        name: 'decided_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      decidedAt: { name: 'decided_at', type: 'datetime2', nullable: true },
      createdBy: {
        name: 'created_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdByHsaId: {
        name: 'created_by_hsa_id',
        type: 'nvarchar',
        length: 64,
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
      {
        name: 'idx_specification_local_requirement_deviations_created_by_hsa_id',
        columns: ['createdByHsaId'],
      },
      {
        name: 'idx_specification_local_requirement_deviations_decided_by_hsa_id',
        columns: ['decidedByHsaId'],
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
