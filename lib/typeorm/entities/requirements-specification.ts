import { EntitySchema } from 'typeorm'
import type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
import type { SpecificationResponsibilityAreaEntity } from '@/lib/typeorm/entities/specification-responsibility-area'

export interface RequirementsSpecificationEntity {
  businessNeedsReference: string | null
  canResponsibleGenerateAi: boolean
  createdAt: Date
  id: number
  localRequirementNextSequence: number
  name: string
  responsibleDisplayName: string | null
  responsibleHsaId: string | null
  specificationImplementationType: SpecificationImplementationTypeEntity | null
  specificationLifecycleStatus: SpecificationLifecycleStatusEntity | null
  specificationResponsibilityArea: SpecificationResponsibilityAreaEntity | null
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
        length: 64,
        nullable: true,
      },
      responsibleDisplayName: {
        name: 'responsible_display_name',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      canResponsibleGenerateAi: {
        name: 'can_responsible_generate_ai',
        type: 'bit',
        default: false,
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
      specificationResponsibilityArea: {
        type: 'many-to-one',
        target: 'SpecificationResponsibilityArea',
        joinColumn: {
          name: 'specification_responsibility_area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirements_specifications_specification_responsibility_area_id',
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
    },
  })
