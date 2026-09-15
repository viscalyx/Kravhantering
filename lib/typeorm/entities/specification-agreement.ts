import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'

export interface SpecificationAgreementEntity {
  activatedAt: Date | null
  agreementReference: string
  cancellationReason: string | null
  cancelledAt: Date | null
  cancelledByDisplayName: string | null
  cancelledByHsaId: string | null
  confirmedAt: Date | null
  confirmedByDisplayName: string | null
  confirmedByHsaId: string | null
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  description: string | null
  effectiveAt: Date | null
  effectiveDate: string
  endDate: string | null
  endedAt: Date | null
  endedByDisplayName: string | null
  endedByHsaId: string | null
  endReason: string | null
  id: number
  isCurrent: boolean
  isPending: boolean
  previousAgreement: SpecificationAgreementEntity | null
  replacedAt: Date | null
  specification: RequirementsSpecificationEntity
}

export const specificationAgreementEntity =
  new EntitySchema<SpecificationAgreementEntity>({
    name: 'SpecificationAgreement',
    tableName: 'specification_agreements',
    columns: {
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      agreementReference: {
        name: 'agreement_reference',
        type: 'nvarchar',
        length: 450,
      },
      effectiveDate: { name: 'effective_date', type: 'date' },
      description: {
        name: 'description',
        type: 'nvarchar',
        nullable: true,
        length: 'MAX',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      confirmedAt: { name: 'confirmed_at', type: 'datetime2', nullable: true },
      effectiveAt: { name: 'effective_at', type: 'datetime2', nullable: true },
      activatedAt: { name: 'activated_at', type: 'datetime2', nullable: true },
      replacedAt: { name: 'replaced_at', type: 'datetime2', nullable: true },
      cancelledAt: { name: 'cancelled_at', type: 'datetime2', nullable: true },
      endedAt: { name: 'ended_at', type: 'datetime2', nullable: true },
      createdByDisplayName: {
        name: 'created_by_display_name',
        type: 'nvarchar',
        length: 512,
        nullable: true,
      },
      createdByHsaId: {
        name: 'created_by_hsa_id',
        type: 'nvarchar',
        nullable: true,
        length: 64,
      },
      confirmedByDisplayName: {
        name: 'confirmed_by_display_name',
        type: 'nvarchar',
        length: 512,
        nullable: true,
      },
      confirmedByHsaId: {
        name: 'confirmed_by_hsa_id',
        type: 'nvarchar',
        nullable: true,
        length: 64,
      },
      cancelledByDisplayName: {
        name: 'cancelled_by_display_name',
        type: 'nvarchar',
        length: 512,
        nullable: true,
      },
      cancelledByHsaId: {
        name: 'cancelled_by_hsa_id',
        type: 'nvarchar',
        nullable: true,
        length: 64,
      },
      endedByDisplayName: {
        name: 'ended_by_display_name',
        type: 'nvarchar',
        length: 512,
        nullable: true,
      },
      endedByHsaId: {
        name: 'ended_by_hsa_id',
        type: 'nvarchar',
        nullable: true,
        length: 64,
      },
      cancellationReason: {
        name: 'cancellation_reason',
        type: 'nvarchar',
        nullable: true,
        length: 'MAX',
      },
      endDate: { name: 'end_date', type: 'date', nullable: true },
      endReason: {
        name: 'end_reason',
        type: 'nvarchar',
        nullable: true,
        length: 'MAX',
      },
      isPending: { name: 'is_pending', type: 'bit' },
      isCurrent: { name: 'is_current', type: 'bit' },
    },
    relations: {
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        nullable: false,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'specification_id',
          foreignKeyConstraintName:
            'fk_specification_agreements_specification_id',
        },
      },
      previousAgreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'previous_agreement_id',
          foreignKeyConstraintName:
            'fk_specification_agreements_previous_agreement_id',
        },
      },
    },
    indices: [
      {
        name: 'uq_specification_agreements_specification_reference',
        columns: ['specification', 'agreementReference'],
        unique: true,
      },
      {
        name: 'uq_specification_agreements_specification_date',
        columns: ['specification', 'effectiveDate'],
        unique: true,
        where: '[cancelled_at] IS NULL',
      },
      {
        name: 'uq_specification_agreements_pending',
        columns: ['specification'],
        unique: true,
        where: '[is_pending] = 1',
      },
      {
        name: 'uq_specification_agreements_current',
        columns: ['specification'],
        unique: true,
        where: '[is_current] = 1',
      },
    ],
  })
