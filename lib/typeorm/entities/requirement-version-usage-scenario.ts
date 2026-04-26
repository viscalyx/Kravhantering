import { EntitySchema } from 'typeorm'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import type { UsageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export interface RequirementVersionUsageScenarioEntity {
  requirementVersion: RequirementVersionEntity
  requirementVersionId: number
  usageScenario: UsageScenarioEntity
  usageScenarioId: number
}

export const requirementVersionUsageScenarioEntity =
  new EntitySchema<RequirementVersionUsageScenarioEntity>({
    name: 'RequirementVersionUsageScenario',
    tableName: 'requirement_version_usage_scenarios',
    columns: {
      requirementVersionId: {
        name: 'requirement_version_id',
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
        name: 'idx_requirement_version_usage_scenarios_usage_scenario_id',
        columns: ['usageScenarioId'],
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
            'fk_requirement_version_usage_scenarios_requirement_version_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      usageScenario: {
        type: 'many-to-one',
        target: 'UsageScenario',
        joinColumn: {
          name: 'usage_scenario_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_version_usage_scenarios_usage_scenario_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
