import { describe, expect, it } from 'vitest'
import { priorityLevelEntity } from '@/lib/typeorm/entities/priority-level'
import { qualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import { requirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import { requirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import { requirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'

describe('classification entity metadata', () => {
  it.each([
    [
      requirementCategoryEntity,
      'RequirementCategory',
      'requirement_categories',
    ],
    [requirementTypeEntity, 'RequirementType', 'requirement_types'],
    [priorityLevelEntity, 'PriorityLevel', 'priority_levels'],
    [
      qualityCharacteristicEntity,
      'QualityCharacteristic',
      'quality_characteristics',
    ],
    [requirementStatusEntity, 'RequirementStatus', 'requirement_statuses'],
  ])('defines %s against its SQL Server table', (entity, name, tableName) => {
    expect(entity.options.name).toBe(name)
    expect(entity.options.tableName).toBe(tableName)
    expect(entity.options.columns?.id).toMatchObject({
      generated: 'increment',
      primary: true,
      type: 'int',
    })
  })

  it('defines quality characteristic ownership and hierarchy relations', () => {
    expect(qualityCharacteristicEntity.options.relations).toMatchObject({
      parent: {
        joinColumn: { name: 'parent_id', referencedColumnName: 'id' },
        nullable: true,
        target: 'QualityCharacteristic',
      },
      requirementType: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_quality_characteristics_requirement_type_id',
          name: 'requirement_type_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        target: 'RequirementType',
      },
    })
  })
})
