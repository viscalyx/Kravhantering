import { EntitySchema } from 'typeorm'
import type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'

export interface SpecificationLocalRequirementNormReferenceEntity {
  normReference: NormReferenceEntity
  normReferenceId: number
  specificationLocalRequirement: SpecificationLocalRequirementEntity
  specificationLocalRequirementId: number
}

export const specificationLocalRequirementNormReferenceEntity =
  new EntitySchema<SpecificationLocalRequirementNormReferenceEntity>({
    name: 'SpecificationLocalRequirementNormReference',
    tableName: 'specification_local_requirement_norm_references',
    columns: {
      specificationLocalRequirementId: {
        name: 'specification_local_requirement_id',
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
        name: 'idx_specification_local_requirement_norm_references_norm_reference_id',
        columns: ['normReferenceId'],
      },
    ],
    relations: {
      specificationLocalRequirement: {
        type: 'many-to-one',
        target: 'SpecificationLocalRequirement',
        joinColumn: {
          name: 'specification_local_requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirement_norm_references_specification_local_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      normReference: {
        type: 'many-to-one',
        target: 'NormReference',
        joinColumn: {
          name: 'norm_reference_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirement_norm_references_norm_reference_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
