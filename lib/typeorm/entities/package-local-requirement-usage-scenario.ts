import { EntitySchema } from 'typeorm'
import type { PackageLocalRequirementEntity } from '@/lib/typeorm/entities/package-local-requirement'
import type { UsageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export interface PackageLocalRequirementUsageScenarioEntity {
  packageLocalRequirement: PackageLocalRequirementEntity
  packageLocalRequirementId: number
  usageScenario: UsageScenarioEntity
  usageScenarioId: number
}

export const packageLocalRequirementUsageScenarioEntity =
  new EntitySchema<PackageLocalRequirementUsageScenarioEntity>({
    name: 'PackageLocalRequirementUsageScenario',
    tableName: 'package_local_requirement_usage_scenarios',
    columns: {
      packageLocalRequirementId: {
        name: 'package_local_requirement_id',
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
        name: 'idx_package_local_requirement_usage_scenarios_usage_scenario_id',
        columns: ['usageScenarioId'],
      },
    ],
    relations: {
      packageLocalRequirement: {
        type: 'many-to-one',
        target: 'PackageLocalRequirement',
        joinColumn: {
          name: 'package_local_requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirement_usage_scenarios_package_local_requirement_id',
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
            'fk_package_local_requirement_usage_scenarios_usage_scenario_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
