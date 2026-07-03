import { EntitySchema } from 'typeorm'
import type { PriorityLevelEntity } from '@/lib/typeorm/entities/priority-level'
import type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'

export interface RequirementVersionEntity {
  acceptanceCriteria: string | null
  archivedAt: Date | null
  archiveInitiatedAt: Date | null
  createdAt: Date
  createdBy: string | null
  createdByHsaId: string | null
  description: string
  editedAt: Date | null
  hasSpecificationItemHistory: boolean
  id: number
  isVerifiable: boolean
  priorityLevel: PriorityLevelEntity | null
  publishedAt: Date | null
  qualityCharacteristic: QualityCharacteristicEntity | null
  requirement: RequirementEntity
  requirementCategory: RequirementCategoryEntity | null
  requirementStatus: RequirementStatusEntity
  requirementType: RequirementTypeEntity | null
  revisionToken: string
  statusUpdatedAt: Date | null
  verificationMethod: string | null
  versionNumber: number
}

export const requirementVersionEntity =
  new EntitySchema<RequirementVersionEntity>({
    name: 'RequirementVersion',
    tableName: 'requirement_versions',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      revisionToken: {
        name: 'revision_token',
        type: 'uniqueidentifier',
        default: () => 'NEWID()',
      },
      versionNumber: { name: 'version_number', type: 'int' },
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
      createdAt: { name: 'created_at', type: 'datetime2' },
      editedAt: { name: 'edited_at', type: 'datetime2', nullable: true },
      publishedAt: { name: 'published_at', type: 'datetime2', nullable: true },
      archivedAt: { name: 'archived_at', type: 'datetime2', nullable: true },
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
      archiveInitiatedAt: {
        name: 'archive_initiated_at',
        type: 'datetime2',
        nullable: true,
      },
      statusUpdatedAt: {
        name: 'status_updated_at',
        type: 'datetime2',
        nullable: true,
      },
      hasSpecificationItemHistory: {
        default: false,
        name: 'has_specification_item_history',
        type: 'bit',
      },
    },
    uniques: [
      {
        name: 'uq_requirement_versions_requirement_id_version_number',
        columns: ['requirement', 'versionNumber'],
      },
      {
        name: 'uq_requirement_versions_revision_token',
        columns: ['revisionToken'],
      },
    ],
    indices: [
      {
        name: 'idx_requirement_versions_requirement_id',
        columns: ['requirement'],
      },
      {
        name: 'idx_requirement_versions_created_by_hsa_id',
        columns: ['createdByHsaId'],
      },
      {
        name: 'idx_requirement_versions_status_updated_at',
        columns: ['statusUpdatedAt'],
      },
      {
        name: 'idx_requirement_versions_has_specification_item_history',
        columns: ['hasSpecificationItemHistory'],
      },
      {
        name: 'uq_requirement_versions_archive_initiated_requirement_id',
        columns: ['requirement'],
        unique: true,
        where: '[archive_initiated_at] IS NOT NULL',
      },
      {
        name: 'uq_requirement_versions_published_requirement_id',
        columns: ['requirement'],
        unique: true,
        where: '[requirement_status_id] = 3',
      },
    ],
    relations: {
      requirement: {
        type: 'many-to-one',
        target: 'Requirement',
        joinColumn: {
          name: 'requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_requirement_versions_requirement_id',
        },
        nullable: false,
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
            'fk_requirement_versions_requirement_category_id',
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
            'fk_requirement_versions_requirement_type_id',
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
            'fk_requirement_versions_quality_characteristic_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirementStatus: {
        type: 'many-to-one',
        target: 'RequirementStatus',
        joinColumn: {
          name: 'requirement_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_versions_requirement_status_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      priorityLevel: {
        type: 'many-to-one',
        target: 'PriorityLevel',
        joinColumn: {
          name: 'priority_level_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_requirement_versions_priority_level_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
