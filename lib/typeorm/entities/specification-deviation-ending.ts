import { EntitySchema } from 'typeorm'
import type { DeviationEntity } from '@/lib/typeorm/entities/deviation'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { SpecificationAgreementEntity } from '@/lib/typeorm/entities/specification-agreement'
import type { SpecificationAgreementItemEntity } from '@/lib/typeorm/entities/specification-agreement-item'
import type { SpecificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'

export interface SpecificationDeviationEndingEntity {
  agreement: SpecificationAgreementEntity | null
  agreementItem: SpecificationAgreementItemEntity | null
  agreementReference: string | null
  cancelledAt: Date | null
  cancelledByHsaId: string | null
  deviation: DeviationEntity | null
  endedAt: Date | null
  id: number
  localDeviation: SpecificationLocalRequirementDeviationEntity | null
  plannedEffectiveDate: string
  recordedAt: Date
  recordedByHsaId: string | null
  specification: RequirementsSpecificationEntity
}

export const specificationDeviationEndingEntity =
  new EntitySchema<SpecificationDeviationEndingEntity>({
    name: 'SpecificationDeviationEnding',
    tableName: 'specification_deviation_endings',
    columns: {
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      agreementReference: {
        name: 'agreement_reference',
        nullable: true,
        type: 'nvarchar',
        length: 450,
      },
      plannedEffectiveDate: { name: 'planned_effective_date', type: 'date' },
      recordedAt: { name: 'recorded_at', type: 'datetime2' },
      recordedByHsaId: {
        name: 'recorded_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      cancelledAt: { name: 'cancelled_at', type: 'datetime2', nullable: true },
      cancelledByHsaId: {
        name: 'cancelled_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      endedAt: { name: 'ended_at', type: 'datetime2', nullable: true },
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
            'fk_specification_deviation_endings_specification_id',
        },
      },
      agreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: true,
        onDelete: 'SET NULL',
        joinColumn: {
          name: 'agreement_id',
          foreignKeyConstraintName:
            'fk_specification_deviation_endings_agreement_id',
        },
      },
      agreementItem: {
        type: 'many-to-one',
        target: 'SpecificationAgreementItem',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'agreement_item_id',
          foreignKeyConstraintName:
            'fk_specification_deviation_endings_agreement_item_id',
        },
      },
      deviation: {
        type: 'many-to-one',
        target: 'Deviation',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'deviation_id',
          foreignKeyConstraintName:
            'fk_specification_deviation_endings_deviation_id',
        },
      },
      localDeviation: {
        type: 'many-to-one',
        target: 'SpecificationLocalRequirementDeviation',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'local_deviation_id',
          foreignKeyConstraintName:
            'fk_specification_deviation_endings_local_deviation_id',
        },
      },
    },
    indices: [
      {
        name: 'idx_specification_deviation_endings_agreement_id',
        columns: ['agreement'],
      },
    ],
    checks: [
      {
        name: 'chk_specification_deviation_endings_case',
        expression:
          '([deviation_id] IS NOT NULL AND [local_deviation_id] IS NULL) OR ([deviation_id] IS NULL AND [local_deviation_id] IS NOT NULL)',
      },
    ],
  })
