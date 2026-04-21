import { EntitySchema } from 'typeorm'
import type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'

export interface RequirementVersionNormReferenceEntity {
  normReference: NormReferenceEntity
  normReferenceId: number
  requirementVersion: RequirementVersionEntity
  requirementVersionId: number
}

export const requirementVersionNormReferenceEntity =
  new EntitySchema<RequirementVersionNormReferenceEntity>({
    name: 'RequirementVersionNormReference',
    tableName: 'requirement_version_norm_references',
    columns: {
      requirementVersionId: {
        name: 'requirement_version_id',
        type: 'int',
        primary: true,
      },
      normReferenceId: {
        name: 'norm_reference_id',
        type: 'int',
        primary: true,
      },
    },
    indices: [
      {
        name: 'idx_requirement_version_norm_references_norm_reference_id',
        columns: ['normReferenceId'],
      },
    ],
    relations: {
      requirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        joinColumn: {
          name: 'requirement_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_version_norm_references_requirement_version_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
      },
      normReference: {
        type: 'many-to-one',
        target: 'NormReference',
        joinColumn: {
          name: 'norm_reference_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_version_norm_references_norm_reference_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
      },
    },
  })
