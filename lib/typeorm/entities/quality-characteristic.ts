import { EntitySchema } from 'typeorm'
import type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'

export interface QualityCharacteristicEntity {
  id: number
  nameEn: string
  nameSv: string
  parent: QualityCharacteristicEntity | null
  requirementType: RequirementTypeEntity
}

export const qualityCharacteristicEntity =
  new EntitySchema<QualityCharacteristicEntity>({
    name: 'QualityCharacteristic',
    tableName: 'quality_characteristics',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      nameSv: { name: 'name_sv', type: 'nvarchar', length: 'MAX' },
      nameEn: { name: 'name_en', type: 'nvarchar', length: 'MAX' },
    },
    indices: [
      {
        name: 'idx_quality_characteristics_parent_id',
        columns: ['parent'],
      },
      {
        name: 'idx_quality_characteristics_requirement_type_id',
        columns: ['requirementType'],
      },
    ],
    relations: {
      requirementType: {
        type: 'many-to-one',
        target: 'RequirementType',
        joinColumn: {
          name: 'requirement_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_quality_characteristics_requirement_type_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
      },
      parent: {
        type: 'many-to-one',
        target: 'QualityCharacteristic',
        joinColumn: {
          name: 'parent_id',
          referencedColumnName: 'id',
          // Note: no FK constraint exists in the database for this column;
          // only an index. Navigation is supported, but the relation is not
          // enforced at the database level.
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
    },
  })
