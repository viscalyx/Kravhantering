import { EntitySchema } from 'typeorm'
import type { PackageItemStatusEntity } from '@/lib/typeorm/entities/package-item-status'
import type { PackageNeedsReferenceEntity } from '@/lib/typeorm/entities/package-needs-reference'
import type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import type { RiskLevelEntity } from '@/lib/typeorm/entities/risk-level'

export interface PackageLocalRequirementEntity {
  acceptanceCriteria: string | null
  createdAt: Date
  description: string
  id: number
  isTestingRequired: boolean
  needsReference: PackageNeedsReferenceEntity | null
  note: string | null
  package: RequirementPackageEntity
  packageItemStatus: PackageItemStatusEntity | null
  qualityCharacteristic: QualityCharacteristicEntity | null
  requirementArea: RequirementAreaEntity | null
  requirementCategory: RequirementCategoryEntity | null
  requirementType: RequirementTypeEntity | null
  riskLevel: RiskLevelEntity | null
  sequenceNumber: number
  statusUpdatedAt: Date | null
  uniqueId: string
  updatedAt: Date
  verificationMethod: string | null
}

export const packageLocalRequirementEntity =
  new EntitySchema<PackageLocalRequirementEntity>({
    name: 'PackageLocalRequirement',
    tableName: 'package_local_requirements',
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
        name: 'uq_package_local_requirements_package_id_sequence_number',
        columns: ['package', 'sequenceNumber'],
      },
      {
        name: 'uq_package_local_requirements_package_id_unique_id',
        columns: ['package', 'uniqueId'],
      },
    ],
    indices: [
      {
        name: 'idx_package_local_requirements_package_id',
        columns: ['package'],
      },
      {
        name: 'idx_package_local_requirements_package_item_status_id',
        columns: ['packageItemStatus'],
      },
      {
        name: 'idx_package_local_requirements_requirement_area_id',
        columns: ['requirementArea'],
      },
    ],
    relations: {
      package: {
        type: 'many-to-one',
        target: 'RequirementPackage',
        joinColumn: {
          name: 'package_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_package_local_requirements_package_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
      },
      requirementArea: {
        type: 'many-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'requirement_area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_requirement_area_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      requirementCategory: {
        type: 'many-to-one',
        target: 'RequirementCategory',
        joinColumn: {
          name: 'requirement_category_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_requirement_category_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      requirementType: {
        type: 'many-to-one',
        target: 'RequirementType',
        joinColumn: {
          name: 'requirement_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_requirement_type_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      qualityCharacteristic: {
        type: 'many-to-one',
        target: 'QualityCharacteristic',
        joinColumn: {
          name: 'quality_characteristic_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_quality_characteristic_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      riskLevel: {
        type: 'many-to-one',
        target: 'RiskLevel',
        joinColumn: {
          name: 'risk_level_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_risk_level_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      needsReference: {
        type: 'many-to-one',
        target: 'PackageNeedsReference',
        joinColumn: [
          {
            name: 'package_id',
            referencedColumnName: 'packageId',
            foreignKeyConstraintName:
              'fk_package_local_requirements_package_id_needs_reference_id',
          },
          {
            name: 'needs_reference_id',
            referencedColumnName: 'id',
          },
        ],
        nullable: true,
        onDelete: 'NO ACTION',
      },
      packageItemStatus: {
        type: 'many-to-one',
        target: 'PackageItemStatus',
        joinColumn: {
          name: 'package_item_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirements_package_item_status_id',
        },
        nullable: true,
        onDelete: 'SET NULL',
      },
    },
  })
