# Integration Contracts

Field-level contracts for REST and MCP responses. Use these tables
as the expected-field ground truth when auditing scrutiny areas 8–10.

Authoritative source: `quality/RUN_INTEGRATION_TESTS.md` and
`lib/requirements/types.ts`.

## REST: `RequirementDetailResponse`

Source: `lib/requirements/types.ts`

| Field | Type | Notes |
|---|---|---|
| `area` | `RequirementDetailAreaResponse \| null` | Area metadata |
| `createdAt` | `string` | ISO timestamp |
| `id` | `number` | Internal requirement id |
| `isArchived` | `boolean` | Archive flag |
| `packageCount` | `number` | Linked packages |
| `uniqueId` | `string` | Public id e.g. `IDN0001` |
| `versions` | `RequirementVersionDetail[]` | Full history |

## REST: `RequirementDetailAreaResponse`

Source: `lib/requirements/types.ts`

| Field | Type | Notes |
|---|---|---|
| `id` | `number` | Area id |
| `name` | `string` | Area name |
| `ownerId` | `number \| null` | Optional owner id |
| `ownerName` | `string \| null` | Owner display name |
| `prefix` | `string` | Public id prefix |

## REST: `RequirementVersionDetail`

Source: `lib/requirements/types.ts`

| Field | Type | Notes |
|---|---|---|
| `acceptanceCriteria` | `string \| null` | Acceptance text |
| `archivedAt` | `string \| null` | Archive timestamp |
| `archiveInitiatedAt` | `string \| null` | Archiving-review timestamp |
| `category` | `RequirementLocalizedEntity \| null` | Category |
| `createdAt` | `string` | Version create timestamp |
| `createdBy` | `string \| null` | Actor id |
| `description` | `string \| null` | Requirement text |
| `editedAt` | `string \| null` | Last edit timestamp |
| `id` | `number` | Version id |
| `ownerName` | `string \| null` | Area owner name |
| `publishedAt` | `string \| null` | Publish timestamp |
| `qualityCharacteristic` | `RequirementLocalizedEntity \| null` | Quality |
| `requiresTesting` | `boolean` | Testing flag |
| `riskLevel` | `RiskLevelSummary \| null` | Risk summary |
| `status` | `number` | Lifecycle status id |
| `statusColor` | `string \| null` | UI color |
| `statusNameEn` | `string \| null` | English status |
| `statusNameSv` | `string \| null` | Swedish status |
| `type` | `RequirementLocalizedEntity \| null` | Type |
| `verificationMethod` | `string \| null` | Test method |
| `versionNormReferences` | `RequirementVersionNormReference[]` | Norm refs |
| `versionNumber` | `number` | Version sequence |
| `versionScenarios` | `RequirementVersionScenario[]` | Scenarios |

## REST: Package Detail `/api/requirement-packages/[id]`

Source: `app/api/requirement-packages/[id]/route.ts`

| Field | Type | Notes |
|---|---|---|
| `businessNeedsReference` | `string \| null` | Business note |
| `createdAt` | `string` | ISO timestamp |
| `id` | `number` | Package id |
| `implementationType` | `{ id, nameSv, nameEn } \| null` | Taxonomy |
| `lifecycleStatus` | `{ id, nameSv, nameEn } \| null` | Taxonomy |
| `localRequirementNextSequence` | `number` | Next local seq |
| `name` | `string` | Package name |
| `packageImplementationTypeId` | `number \| null` | FK |
| `packageLifecycleStatusId` | `number \| null` | FK |
| `packageResponsibilityAreaId` | `number \| null` | FK |
| `responsibilityArea` | `{ id, nameSv, nameEn } \| null` | Taxonomy |
| `uniqueId` | `string` | Slug e.g. `ETJANSTPLATT` |
| `updatedAt` | `string` | ISO timestamp |

## REST: Package Items `/api/requirement-packages/[id]/items`

Source: `app/api/requirement-packages/[id]/items/route.ts`

Top-level: `{ items: RequirementRow[] }`

### `RequirementRow` fields

| Field | Type | Notes |
|---|---|---|
| `area` | `{ name: string } \| null` | Area summary |
| `deviationCount` | `number` | Route enrichment |
| `hasApprovedDeviation` | `boolean` | Route enrichment |
| `hasPendingDeviation` | `boolean` | Route enrichment |
| `id` | `number` | Req id or negative local id |
| `isArchived` | `boolean` | Archive flag |
| `isPackageLocal` | `boolean` | Kind discriminator |
| `itemRef` | `lib:N` or `local:N` | Stable ref |
| `kind` | `library` or `packageLocal` | Item kind |
| `needsReference` | `string \| null` | Needs text |
| `needsReferenceId` | `number \| null` | FK |
| `normReferenceIds` | `string[]` | Norm ids |
| `packageItemId` | `number` | Library rows |
| `packageItemStatusColor` | `string \| null` | Status color |
| `packageItemStatusDescriptionEn` | `string \| null` | English desc |
| `packageItemStatusDescriptionSv` | `string \| null` | Swedish desc |
| `packageItemStatusId` | `number \| null` | Status id |
| `packageItemStatusNameEn` | `string \| null` | English status |
| `packageItemStatusNameSv` | `string \| null` | Swedish status |
| `packageLocalRequirementId` | `number` | Package-local rows |
| `uniqueId` | `string` | Req or local id |
| `usageScenarioIds` | `number[]` | Scenario ids |
| `version` | `object` | Published snapshot |

## MCP: `GetRequirementOutputSchema`

Source: `lib/mcp/server.ts`

| Field | Type | Notes |
|---|---|---|
| `message` | `string` | Human-readable output |
| `requirement` | `record<string, unknown>` | Structured payload |
| `requirementResourceUri` | `string` | `requirements://` URI |
| `requirementViewUri` | `string` | `ui://` URI |
| `version` | `record<string, unknown>` | For `view: "version"` |
| `versions` | `record<string, unknown>[]` | For `view: "history"` |
