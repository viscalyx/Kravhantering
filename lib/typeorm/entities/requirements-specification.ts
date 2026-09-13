import { EntitySchema } from 'typeorm'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'
import type { SpecificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
import type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'

export interface RequirementsSpecificationEntity {
  agreementDate: Date | null
  agreementEndDate: Date | null
  agreementEndReason: string | null
  agreementReason: string | null
  agreementReference: string | null
  assessedAt: Date | null
  assessedByHsaId: string | null
  assessmentReason: string | null
  businessNeedsReference: string | null
  createdAt: Date
  endedAt: Date | null
  endedByHsaId: string | null
  establishedAt: Date | null
  establishedByHsaId: string | null
  establishmentStatus: string
  id: number
  localRequirementNextSequence: number
  name: string
  originalContentJson: string | null
  responsibleHsaId: string
  responsiblePerson: RequirementResponsibilityPersonEntity
  specificationCode: string
  specificationGovernanceObjectType: SpecificationGovernanceObjectTypeEntity | null
  specificationImplementationType: SpecificationImplementationTypeEntity | null
  specificationLifecycleStatus: SpecificationLifecycleStatusEntity
  updatedAt: Date
}

export const requirementsSpecificationEntity =
  new EntitySchema<RequirementsSpecificationEntity>({
    name: 'RequirementsSpecification',
    tableName: 'requirements_specifications',
    columns: {
      assessedAt: { name: 'assessed_at', type: 'datetime2', nullable: true },
      assessedByHsaId: {
        name: 'assessed_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      assessmentReason: {
        name: 'assessment_reason',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      endedAt: { name: 'ended_at', type: 'datetime2', nullable: true },
      endedByHsaId: {
        name: 'ended_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      agreementEndDate: {
        name: 'agreement_end_date',
        type: 'date',
        nullable: true,
      },
      agreementEndReason: {
        name: 'agreement_end_reason',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      establishmentStatus: {
        name: 'establishment_status',
        type: 'nvarchar',
        length: 20,
        default: 'editable',
      },
      agreementReference: {
        name: 'agreement_reference',
        type: 'nvarchar',
        length: 2000,
        nullable: true,
      },
      agreementReason: {
        name: 'agreement_reason',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      agreementDate: { name: 'agreement_date', type: 'date', nullable: true },
      establishedAt: {
        name: 'established_at',
        type: 'datetime2',
        nullable: true,
      },
      establishedByHsaId: {
        name: 'established_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      originalContentJson: {
        name: 'original_content_json',
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
      updatedAt: { name: 'updated_at', type: 'datetime2' },
      businessNeedsReference: {
        name: 'business_needs_reference',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      specificationCode: {
        name: 'specification_code',
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
      },
    },
    uniques: [
      {
        name: 'uq_requirements_specifications_specification_code',
        columns: ['specificationCode'],
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
        nullable: false,
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
