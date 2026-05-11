import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'

export interface DeviationEntity {
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
  specificationItem: RequirementsSpecificationItemEntity
  updatedAt: Date | null
}

export const deviationEntity = new EntitySchema<DeviationEntity>({
  name: 'Deviation',
  tableName: 'deviations',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    motivation: { name: 'motivation', type: 'nvarchar', length: 'MAX' },
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
    isReviewRequested: {
      name: 'is_review_requested',
      type: 'bit',
      default: false,
    },
  },
  indices: [
    {
      name: 'idx_deviations_specification_item_id',
      columns: ['specificationItem'],
    },
    {
      name: 'idx_deviations_created_by_hsa_id',
      columns: ['createdByHsaId'],
    },
    {
      name: 'idx_deviations_decided_by_hsa_id',
      columns: ['decidedByHsaId'],
    },
  ],
  relations: {
    specificationItem: {
      type: 'many-to-one',
      target: 'RequirementsSpecificationItem',
      joinColumn: {
        name: 'specification_item_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_deviations_specification_item_id',
      },
      nullable: false,
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    },
  },
})
