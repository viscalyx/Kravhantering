import { EntitySchema } from 'typeorm'
import type { SpecificationAgreementEntity } from '@/lib/typeorm/entities/specification-agreement'

export interface SpecificationAgreementCorrectionEntity {
  agreement: SpecificationAgreementEntity
  correctedAt: Date
  correctedByDisplayName: string | null
  correctedByHsaId: string | null
  id: number
  newAgreementReference: string
  newDescription: string | null
  newEffectiveDate: string
  oldAgreementReference: string
  oldDescription: string | null
  oldEffectiveDate: string
}

export const specificationAgreementCorrectionEntity =
  new EntitySchema<SpecificationAgreementCorrectionEntity>({
    name: 'SpecificationAgreementCorrection',
    tableName: 'specification_agreement_corrections',
    columns: {
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      oldAgreementReference: {
        name: 'old_agreement_reference',
        type: 'nvarchar',
        length: 450,
      },
      newAgreementReference: {
        name: 'new_agreement_reference',
        type: 'nvarchar',
        length: 450,
      },
      oldEffectiveDate: { name: 'old_effective_date', type: 'date' },
      newEffectiveDate: { name: 'new_effective_date', type: 'date' },
      oldDescription: {
        name: 'old_description',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      newDescription: {
        name: 'new_description',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      correctedAt: { name: 'corrected_at', type: 'datetime2' },
      correctedByHsaId: {
        name: 'corrected_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      correctedByDisplayName: {
        name: 'corrected_by_display_name',
        type: 'nvarchar',
        length: 512,
        nullable: true,
      },
    },
    relations: {
      agreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: false,
        onDelete: 'CASCADE',
        joinColumn: {
          name: 'agreement_id',
          foreignKeyConstraintName:
            'fk_specification_agreement_corrections_agreement_id',
        },
      },
    },
    indices: [
      {
        name: 'idx_specification_agreement_corrections_agreement_id',
        columns: ['agreement'],
      },
    ],
  })
