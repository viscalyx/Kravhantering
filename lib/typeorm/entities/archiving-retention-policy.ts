import { EntitySchema } from 'typeorm'

export type ArchivingRetentionPolicyAction = 'delete'

export interface ArchivingRetentionPolicyEntity {
  action: ArchivingRetentionPolicyAction
  ageDays: number
  createdAt: Date
  decisionReference: string | null
  id: number
  informationSet: string
  isEnabled: boolean
  lastRunAt: Date | null
  policyKey: string
  statusCondition: string
  updatedAt: Date
}

export const archivingRetentionPolicyEntity =
  new EntitySchema<ArchivingRetentionPolicyEntity>({
    name: 'ArchivingRetentionPolicy',
    tableName: 'archiving_retention_policies',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      policyKey: { length: 120, name: 'policy_key', type: 'nvarchar' },
      informationSet: {
        length: 450,
        name: 'information_set',
        type: 'nvarchar',
      },
      action: { length: 32, name: 'action', type: 'nvarchar' },
      ageDays: { name: 'age_days', type: 'int' },
      statusCondition: {
        length: 450,
        name: 'status_condition',
        type: 'nvarchar',
      },
      isEnabled: {
        default: false,
        name: 'is_enabled',
        type: 'bit',
      },
      decisionReference: {
        length: 450,
        name: 'decision_reference',
        nullable: true,
        type: 'nvarchar',
      },
      lastRunAt: { name: 'last_run_at', nullable: true, type: 'datetime2' },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
    },
    indices: [
      {
        columns: ['isEnabled'],
        name: 'idx_archiving_retention_policies_enabled',
      },
    ],
    uniques: [
      {
        columns: ['policyKey'],
        name: 'uq_archiving_retention_policies_policy_key',
      },
    ],
  })
