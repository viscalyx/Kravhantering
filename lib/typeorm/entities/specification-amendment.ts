import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from './requirements-specification'

export interface SpecificationAmendmentEntity {
  agreementReference: string
  cancellationReason: string | null
  cancelledAt: Date | null
  cancelledByHsaId: string | null
  changesJson: string
  createdAt: Date
  createdByHsaId: string | null
  decidedAt: Date | null
  decidedByHsaId: string | null
  effectiveAt: Date | null
  effectiveDate: Date
  id: number
  reason: string
  replacesAmendment: SpecificationAmendmentEntity | null
  specification: RequirementsSpecificationEntity
}
export const specificationAmendmentEntity =
  new EntitySchema<SpecificationAmendmentEntity>({
    name: 'SpecificationAmendment',
    tableName: 'specification_amendments',
    columns: {
      cancelledAt: { name: 'cancelled_at', type: 'datetime2', nullable: true },
      cancelledByHsaId: {
        name: 'cancelled_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      cancellationReason: {
        name: 'cancellation_reason',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      reason: { name: 'reason', type: 'nvarchar', length: 'MAX' },
      agreementReference: {
        name: 'agreement_reference',
        type: 'nvarchar',
        length: 2000,
      },
      effectiveDate: { name: 'effective_date', type: 'date' },
      effectiveAt: { name: 'effective_at', type: 'datetime2', nullable: true },
      createdAt: { name: 'created_at', type: 'datetime2' },
      createdByHsaId: {
        name: 'created_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      decidedAt: { name: 'decided_at', type: 'datetime2', nullable: true },
      decidedByHsaId: {
        name: 'decided_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      changesJson: { name: 'changes_json', type: 'nvarchar', length: 'MAX' },
    },
    indices: [
      {
        name: 'idx_specification_amendments_specification_id',
        columns: ['specification'],
      },
    ],
    relations: {
      replacesAmendment: {
        type: 'many-to-one',
        target: 'SpecificationAmendment',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'replaces_amendment_id',
          foreignKeyConstraintName:
            'fk_specification_amendments_replaces_amendment_id',
        },
      },
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        nullable: false,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_id',
          foreignKeyConstraintName:
            'fk_specification_amendments_specification_id',
        },
      },
    },
  })
