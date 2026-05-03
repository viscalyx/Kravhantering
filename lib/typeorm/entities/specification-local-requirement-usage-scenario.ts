import { EntitySchema } from 'typeorm'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
import type { UsageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export interface SpecificationLocalRequirementUsageScenarioEntity {
  specificationLocalRequirement: SpecificationLocalRequirementEntity
  specificationLocalRequirementId: number
  usageScenario: UsageScenarioEntity
  usageScenarioId: number
}

export const specificationLocalRequirementUsageScenarioEntity =
  new EntitySchema<SpecificationLocalRequirementUsageScenarioEntity>({
    name: 'SpecificationLocalRequirementUsageScenario',
    tableName: 'specification_local_requirement_usage_scenarios',
    columns: {
      specificationLocalRequirementId: {
        name: 'specification_local_requirement_id',
        type: 'int',
        primary: true,
      },
      usageScenarioId: {
        name: 'usage_scenario_id',
        type: 'int',
        primary: true,
      },
    },
    indices: [
      {
        name: 'idx_specification_local_requirement_usage_scenarios_usage_scenario_id',
        columns: ['usageScenarioId'],
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
            'fk_specification_local_requirement_usage_scenarios_specification_local_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      usageScenario: {
        type: 'many-to-one',
        target: 'UsageScenario',
        joinColumn: {
          name: 'usage_scenario_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirement_usage_scenarios_usage_scenario_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
