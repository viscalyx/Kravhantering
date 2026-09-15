import { EntitySchema } from 'typeorm'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { SpecificationAgreementEntity } from '@/lib/typeorm/entities/specification-agreement'
import type { SpecificationAgreementItemEntity } from '@/lib/typeorm/entities/specification-agreement-item'
import type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'

export interface RequirementsSpecificationItemEntity {
  bindingCreatedByHsaId: string | null
  createdAt: Date
  id: number
  needsReference: SpecificationNeedsReferenceEntity | null
  needsReferenceSnapshot: string | null
  note: string | null
  originAgreementItem: SpecificationAgreementItemEntity | null
  owningAgreement: SpecificationAgreementEntity | null
  requirement: RequirementEntity
  requirementsSpecification: RequirementsSpecificationEntity
  requirementVersion: RequirementVersionEntity
  specificationItemStatus: SpecificationItemStatusEntity
  statusUpdatedAt: Date | null
  validFrom: Date
  validUntil: Date | null
}

export const requirementsSpecificationItemEntity =
  new EntitySchema<RequirementsSpecificationItemEntity>({
    name: 'RequirementsSpecificationItem',
    tableName: 'requirements_specification_items',
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
      createdAt: { name: 'created_at', type: 'datetime2' },
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
    },
    indices: [
      {
        name: 'idx_requirements_specification_items_origin_agreement_item_id',
        columns: ['originAgreementItem'],
      },
      {
        name: 'uq_requirements_specification_items_specification_requirement',
        columns: ['requirementsSpecification', 'requirement'],
        unique: true,
        where: '[valid_until] IS NULL',
      },
      {
        name: 'idx_requirements_specification_items_specification_item_status_id',
        columns: ['specificationItemStatus'],
      },
      {
        name: 'idx_requirements_specification_items_requirement_id',
        columns: ['requirement'],
      },
      {
        name: 'idx_requirements_specification_items_requirements_specification_id',
        columns: ['requirementsSpecification'],
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
            'fk_requirements_specification_items_origin_agreement_item_id',
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
            'fk_requirements_specification_items_owning_agreement_id',
        },
      },
      requirementsSpecification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        joinColumn: {
          name: 'requirements_specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specification_items_requirements_specification_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirement: {
        type: 'many-to-one',
        target: 'Requirement',
        joinColumn: {
          name: 'requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specification_items_requirement_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        joinColumn: {
          name: 'requirement_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specification_items_requirement_version_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      needsReference: {
        type: 'many-to-one',
        target: 'SpecificationNeedsReference',
        joinColumn: [
          {
            name: 'requirements_specification_id',
            referencedColumnName: 'specificationId',
            foreignKeyConstraintName:
              'fk_requirements_specification_items_requirements_specification_id_needs_reference_id',
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
            'fk_requirements_specification_items_specification_item_status_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
