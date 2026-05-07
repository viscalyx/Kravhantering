import { EntitySchema } from 'typeorm'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'

export interface RequirementsSpecificationItemEntity {
  createdAt: Date
  id: number
  needsReference: SpecificationNeedsReferenceEntity | null
  note: string | null
  requirement: RequirementEntity
  requirementsSpecification: RequirementsSpecificationEntity
  requirementVersion: RequirementVersionEntity
  specificationItemStatus: SpecificationItemStatusEntity | null
  statusUpdatedAt: Date | null
  unused1: string | null
}

export const requirementsSpecificationItemEntity =
  new EntitySchema<RequirementsSpecificationItemEntity>({
    name: 'RequirementsSpecificationItem',
    tableName: 'requirements_specification_items',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      unused1: {
        name: 'unused_1',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
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
    uniques: [
      {
        name: 'uq_requirements_specification_items_specification_requirement',
        columns: ['requirementsSpecification', 'requirement'],
      },
    ],
    indices: [
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
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
