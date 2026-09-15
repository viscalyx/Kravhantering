import { EntitySchema } from 'typeorm'
import type { PriorityLevelEntity } from '@/lib/typeorm/entities/priority-level'
import type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { SpecificationAgreementEntity } from '@/lib/typeorm/entities/specification-agreement'
import type { SpecificationAgreementItemEntity } from '@/lib/typeorm/entities/specification-agreement-item'
import type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'

export interface SpecificationLocalRequirementEntity {
  acceptanceCriteria: string | null
  bindingCreatedByHsaId: string | null
  createdAt: Date
  description: string
  id: number
  isVerifiable: boolean
  needsReference: SpecificationNeedsReferenceEntity | null
  needsReferenceSnapshot: string | null
  note: string | null
  originAgreementItem: SpecificationAgreementItemEntity | null
  owningAgreement: SpecificationAgreementEntity | null
  priorityLevel: PriorityLevelEntity | null
  qualityCharacteristic: QualityCharacteristicEntity | null
  requirementCategory: RequirementCategoryEntity | null
  requirementType: RequirementTypeEntity | null
  sequenceNumber: number
  sourceRequirementVersion: RequirementVersionEntity | null
  specification: RequirementsSpecificationEntity
  specificationItemStatus: SpecificationItemStatusEntity
  statusUpdatedAt: Date | null
  uniqueId: string
  updatedAt: Date
  validFrom: Date
  validUntil: Date | null
  verificationMethod: string | null
}

export const specificationLocalRequirementEntity =
  new EntitySchema<SpecificationLocalRequirementEntity>({
    name: 'SpecificationLocalRequirement',
    tableName: 'specification_local_requirements',
    columns: {
      validFrom: {
        name: 'valid_from',
        type: 'datetime2',
        default: () => 'SYSUTCDATETIME()',
      },
      validUntil: { name: 'valid_until', type: 'datetime2', nullable: true },
      bindingCreatedByHsaId: {
        name: 'binding_created_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      needsReferenceSnapshot: {
        name: 'needs_reference_snapshot',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      uniqueId: { name: 'unique_id', type: 'nvarchar', length: 450 },
      sequenceNumber: { name: 'sequence_number', type: 'int' },
      description: { name: 'description', type: 'nvarchar', length: 'MAX' },
      acceptanceCriteria: {
        name: 'acceptance_criteria',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      isVerifiable: {
        name: 'is_verifiable',
        type: 'bit',
        default: false,
      },
      verificationMethod: {
        name: 'verification_method',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      note: {
        name: 'note',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      statusUpdatedAt: {
        name: 'status_updated_at',
        type: 'datetime2',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        name: 'idx_specification_local_requirements_origin_agreement_item_id',
        columns: ['originAgreementItem'],
      },
      {
        name: 'uq_specification_local_requirements_specification_id_sequence_number',
        columns: ['specification', 'sequenceNumber'],
        unique: true,
        where: '[valid_until] IS NULL',
      },
      {
        name: 'uq_specification_local_requirements_specification_id_unique_id',
        columns: ['specification', 'uniqueId'],
        unique: true,
        where: '[valid_until] IS NULL',
      },
      {
        name: 'idx_specification_local_requirements_specification_id',
        columns: ['specification'],
      },
      {
        name: 'idx_specification_local_requirements_specification_item_status_id',
        columns: ['specificationItemStatus'],
      },
    ],
    relations: {
      originAgreementItem: {
        type: 'many-to-one',
        target: 'SpecificationAgreementItem',
        nullable: true,
        onDelete: 'SET NULL',
        joinColumn: {
          name: 'origin_agreement_item_id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_origin_agreement_item_id',
        },
      },
      owningAgreement: {
        type: 'many-to-one',
        target: 'SpecificationAgreement',
        nullable: true,
        onDelete: 'SET NULL',
        joinColumn: {
          name: 'owning_agreement_id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_owning_agreement_id',
        },
      },
      sourceRequirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        nullable: true,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'source_requirement_version_id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_source_requirement_version_id',
        },
      },
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        joinColumn: {
          name: 'specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      requirementCategory: {
        type: 'many-to-one',
        target: 'RequirementCategory',
        joinColumn: {
          name: 'requirement_category_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_requirement_category_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirementType: {
        type: 'many-to-one',
        target: 'RequirementType',
        joinColumn: {
          name: 'requirement_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_requirement_type_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      qualityCharacteristic: {
        type: 'many-to-one',
        target: 'QualityCharacteristic',
        joinColumn: {
          name: 'quality_characteristic_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_quality_characteristic_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      priorityLevel: {
        type: 'many-to-one',
        target: 'PriorityLevel',
        joinColumn: {
          name: 'priority_level_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_priority_level_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      needsReference: {
        type: 'many-to-one',
        target: 'SpecificationNeedsReference',
        joinColumn: [
          {
            name: 'specification_id',
            referencedColumnName: 'specificationId',
            foreignKeyConstraintName:
              'fk_specification_local_requirements_specification_id_needs_reference_id',
          },
          {
            name: 'needs_reference_id',
            referencedColumnName: 'id',
          },
        ],
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      specificationItemStatus: {
        type: 'many-to-one',
        target: 'SpecificationItemStatus',
        joinColumn: {
          name: 'specification_item_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_specification_item_status_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
