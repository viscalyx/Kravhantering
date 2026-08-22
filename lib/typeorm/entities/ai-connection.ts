import { EntitySchema } from 'typeorm'

export type AiConnectionLifecycleStatus =
  | 'active'
  | 'draft'
  | 'retired'
  | 'suspended'
  | 'verification_required'

export type AiConnectionAuthenticationType =
  | 'mtls'
  | 'none'
  | 'oauth2_client_credentials'
  | 'static_secret'

export interface AiConnectionEntity {
  adapterKey: string
  adapterVersion: string
  administrationName: string
  agentRuntimeKey: string | null
  agentRuntimeVersion: string | null
  authenticationType: AiConnectionAuthenticationType
  configurationVersion: number
  createdAt: Date
  dataPolicySummary: string
  description: string | null
  egressPolicyKey: string
  endpointUrl: string
  id: string
  lifecycleStatus: AiConnectionLifecycleStatus
  maximumConcurrency: number
  publicName: string
  revisionToken: string
  tlsPolicyKey: string
  updatedAt: Date
}

export const aiConnectionEntity = new EntitySchema<AiConnectionEntity>({
  name: 'AiConnection',
  tableName: 'ai_connections',
  columns: {
    id: {
      default: () => 'NEWID()',
      name: 'id',
      primary: true,
      type: 'uniqueidentifier',
    },
    administrationName: {
      length: 200,
      name: 'administration_name',
      type: 'nvarchar',
    },
    publicName: { length: 200, name: 'public_name', type: 'nvarchar' },
    description: {
      length: 'MAX',
      name: 'description',
      nullable: true,
      type: 'nvarchar',
    },
    adapterKey: { length: 100, name: 'adapter_key', type: 'nvarchar' },
    adapterVersion: {
      length: 100,
      name: 'adapter_version',
      type: 'nvarchar',
    },
    endpointUrl: { length: 2048, name: 'endpoint_url', type: 'nvarchar' },
    authenticationType: {
      length: 40,
      name: 'authentication_type',
      type: 'nvarchar',
    },
    tlsPolicyKey: {
      length: 100,
      name: 'tls_policy_key',
      type: 'nvarchar',
    },
    egressPolicyKey: {
      length: 100,
      name: 'egress_policy_key',
      type: 'nvarchar',
    },
    agentRuntimeKey: {
      length: 100,
      name: 'agent_runtime_key',
      nullable: true,
      type: 'nvarchar',
    },
    agentRuntimeVersion: {
      length: 100,
      name: 'agent_runtime_version',
      nullable: true,
      type: 'nvarchar',
    },
    dataPolicySummary: {
      length: 1000,
      name: 'data_policy_summary',
      type: 'nvarchar',
    },
    lifecycleStatus: {
      length: 40,
      name: 'lifecycle_status',
      type: 'nvarchar',
    },
    configurationVersion: {
      default: 1,
      name: 'configuration_version',
      type: 'int',
    },
    maximumConcurrency: {
      default: 4,
      name: 'maximum_concurrency',
      type: 'int',
    },
    createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
    updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
    revisionToken: {
      default: () => 'NEWID()',
      name: 'revision_token',
      type: 'uniqueidentifier',
    },
  },
  indices: [
    {
      columns: ['administrationName'],
      name: 'uq_ai_connections_administration_name',
      unique: true,
    },
    {
      columns: ['lifecycleStatus'],
      name: 'idx_ai_connections_lifecycle_status',
    },
  ],
  checks: [
    {
      expression:
        "[lifecycle_status] IN (N'draft', N'verification_required', N'active', N'suspended', N'retired')",
      name: 'chk_ai_connections_lifecycle_status',
    },
    {
      expression:
        "[authentication_type] IN (N'none', N'static_secret', N'oauth2_client_credentials', N'mtls')",
      name: 'chk_ai_connections_authentication_type',
    },
    {
      expression: '[configuration_version] >= 1',
      name: 'chk_ai_connections_configuration_version',
    },
    {
      expression: '[maximum_concurrency] BETWEEN 1 AND 100',
      name: 'chk_ai_connections_maximum_concurrency',
    },
    {
      expression:
        '([agent_runtime_key] IS NULL AND [agent_runtime_version] IS NULL) OR ([agent_runtime_key] IS NOT NULL AND [agent_runtime_version] IS NOT NULL)',
      name: 'chk_ai_connections_agent_runtime',
    },
  ],
})
