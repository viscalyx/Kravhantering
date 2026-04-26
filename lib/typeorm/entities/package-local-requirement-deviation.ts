import { EntitySchema } from 'typeorm'
import type { PackageLocalRequirementEntity } from '@/lib/typeorm/entities/package-local-requirement'

export interface PackageLocalRequirementDeviationEntity {
  createdAt: Date
  createdBy: string | null
  decidedAt: Date | null
  decidedBy: string | null
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: boolean
  motivation: string
  packageLocalRequirement: PackageLocalRequirementEntity
  updatedAt: Date | null
}

export const packageLocalRequirementDeviationEntity =
  new EntitySchema<PackageLocalRequirementDeviationEntity>({
    name: 'PackageLocalRequirementDeviation',
    tableName: 'package_local_requirement_deviations',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      motivation: { name: 'motivation', type: 'nvarchar', length: 'MAX' },
      isReviewRequested: {
        name: 'is_review_requested',
        type: 'bit',
        default: false,
      },
      decision: { name: 'decision', type: 'int', nullable: true },
      decisionMotivation: {
        name: 'decision_motivation',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      decidedBy: {
        name: 'decided_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      decidedAt: { name: 'decided_at', type: 'datetime2', nullable: true },
      createdBy: {
        name: 'created_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2', nullable: true },
    },
    indices: [
      {
        name: 'idx_package_local_requirement_deviations_package_local_requirement_id',
        columns: ['packageLocalRequirement'],
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
            'fk_package_local_requirement_deviations_package_local_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
