import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'

export interface SpecificationNeedsReferenceEntity {
  createdAt: Date
  description: string | null
  id: number
  specification: RequirementsSpecificationEntity
  specificationId: number
  text: string
  updatedAt: Date
}

export const specificationNeedsReferenceEntity =
  new EntitySchema<SpecificationNeedsReferenceEntity>({
    name: 'SpecificationNeedsReference',
    tableName: 'specification_needs_references',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      specificationId: { name: 'specification_id', type: 'int' },
      text: { name: 'text', type: 'nvarchar', length: 450 },
      description: {
        name: 'description',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    uniques: [
      {
        name: 'uq_specification_needs_references_specification_id_id',
        columns: ['specificationId', 'id'],
      },
      {
        name: 'uq_specification_needs_references_specification_text',
        columns: ['specificationId', 'text'],
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
            'fk_specification_needs_references_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
