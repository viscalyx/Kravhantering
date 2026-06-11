import { EntitySchema } from 'typeorm'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'
import type { SpecificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
import type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'

export interface RequirementsSpecificationEntity {
  businessNeedsReference: string | null
  createdAt: Date
  id: number
  localRequirementNextSequence: number
  name: string
  responsibleHsaId: string | null
  responsiblePerson: RequirementResponsibilityPersonEntity | null
  specificationGovernanceObjectType: SpecificationGovernanceObjectTypeEntity | null
  specificationImplementationType: SpecificationImplementationTypeEntity | null
  specificationLifecycleStatus: SpecificationLifecycleStatusEntity | null
  uniqueId: string
  updatedAt: Date
}

export const requirementsSpecificationEntity =
  new EntitySchema<RequirementsSpecificationEntity>({
    name: 'RequirementsSpecification',
    tableName: 'requirements_specifications',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
      businessNeedsReference: {
        name: 'business_needs_reference',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      uniqueId: {
        name: 'unique_id',
        type: 'nvarchar',
        length: 450,
        default: '',
      },
      name: {
        name: 'name',
        type: 'nvarchar',
        length: 'MAX',
        default: '',
      },
      localRequirementNextSequence: {
        name: 'local_requirement_next_sequence',
        type: 'int',
        default: 1,
      },
      responsibleHsaId: {
        name: 'responsible_hsa_id',
        type: 'nvarchar',
        length: 31,
        nullable: true,
      },
    },
    uniques: [
      {
        name: 'uq_requirements_specifications_unique_id',
        columns: ['uniqueId'],
      },
    ],
    indices: [
      {
        name: 'idx_requirements_specifications_responsible_hsa_id',
        columns: ['responsibleHsaId'],
      },
    ],
    relations: {
      specificationGovernanceObjectType: {
        type: 'many-to-one',
        target: 'SpecificationGovernanceObjectType',
        joinColumn: {
          name: 'specification_governance_object_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specifications_specification_governance_object_type_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      specificationImplementationType: {
        type: 'many-to-one',
        target: 'SpecificationImplementationType',
        joinColumn: {
          name: 'specification_implementation_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specifications_specification_implementation_type_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      specificationLifecycleStatus: {
        type: 'many-to-one',
        target: 'SpecificationLifecycleStatus',
        joinColumn: {
          name: 'specification_lifecycle_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specifications_specification_lifecycle_status_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      responsiblePerson: {
        type: 'many-to-one',
        target: 'RequirementResponsibilityPerson',
        joinColumn: {
          name: 'responsible_hsa_id',
          referencedColumnName: 'hsaId',
          foreignKeyConstraintName:
            'fk_requirements_specifications_responsible_hsa_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
