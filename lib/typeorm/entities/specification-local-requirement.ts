import { EntitySchema } from 'typeorm'
import type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { RiskLevelEntity } from '@/lib/typeorm/entities/risk-level'
import type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'

export interface SpecificationLocalRequirementEntity {
  acceptanceCriteria: string | null
  createdAt: Date
  description: string
  id: number
  isTestingRequired: boolean
  needsReference: SpecificationNeedsReferenceEntity | null
  note: string | null
  qualityCharacteristic: QualityCharacteristicEntity | null
  requirementArea: RequirementAreaEntity | null
  requirementCategory: RequirementCategoryEntity | null
  requirementType: RequirementTypeEntity | null
  riskLevel: RiskLevelEntity | null
  sequenceNumber: number
  specification: RequirementsSpecificationEntity
  specificationItemStatus: SpecificationItemStatusEntity | null
  statusUpdatedAt: Date | null
  uniqueId: string
  updatedAt: Date
  verificationMethod: string | null
}

export const specificationLocalRequirementEntity =
  new EntitySchema<SpecificationLocalRequirementEntity>({
    name: 'SpecificationLocalRequirement',
    tableName: 'specification_local_requirements',
    columns: {
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
      isTestingRequired: {
        name: 'is_testing_required',
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
    uniques: [
      {
        name: 'uq_specification_local_requirements_specification_id_sequence_number',
        columns: ['specification', 'sequenceNumber'],
      },
      {
        name: 'uq_specification_local_requirements_specification_id_unique_id',
        columns: ['specification', 'uniqueId'],
      },
    ],
    indices: [
      {
        name: 'idx_specification_local_requirements_specification_id',
        columns: ['specification'],
      },
      {
        name: 'idx_specification_local_requirements_specification_item_status_id',
        columns: ['specificationItemStatus'],
      },
      {
        name: 'idx_specification_local_requirements_requirement_area_id',
        columns: ['requirementArea'],
      },
    ],
    relations: {
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
      requirementArea: {
        type: 'many-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'requirement_area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_requirement_area_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
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
      riskLevel: {
        type: 'many-to-one',
        target: 'RiskLevel',
        joinColumn: {
          name: 'risk_level_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirements_risk_level_id',
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
        nullable: true,
        onDelete: 'SET NULL',
        onUpdate: 'NO ACTION',
      },
    },
  })
