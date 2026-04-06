import { relations } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// ─── Owners ─────────────────────────────────────────────────────────────────

export const owners = sqliteTable(
  'owners',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [uniqueIndex('uq_owners_email').on(table.email)],
)

// ─── Requirement Areas ───────────────────────────────────────────────────────

export const requirementAreas = sqliteTable(
  'requirement_areas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: integer('owner_id').references(() => owners.id),
    nextSequence: integer('next_sequence').notNull().default(1),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [uniqueIndex('uq_requirement_areas_prefix').on(table.prefix)],
)

export const requirementAreasRelations = relations(
  requirementAreas,
  ({ one, many }) => ({
    owner: one(owners, {
      fields: [requirementAreas.ownerId],
      references: [owners.id],
    }),
    requirements: many(requirements),
  }),
)

// ─── Requirement Categories ──────────────────────────────────────────────────

export const requirementCategories = sqliteTable(
  'requirement_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
  },
  table => [
    uniqueIndex('uq_requirement_categories_name_sv').on(table.nameSv),
    uniqueIndex('uq_requirement_categories_name_en').on(table.nameEn),
  ],
)

// ─── Requirement Types ───────────────────────────────────────────────────────

export const requirementTypes = sqliteTable(
  'requirement_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
  },
  table => [
    uniqueIndex('uq_requirement_types_name_sv').on(table.nameSv),
    uniqueIndex('uq_requirement_types_name_en').on(table.nameEn),
  ],
)

export const requirementTypesRelations = relations(
  requirementTypes,
  ({ many }) => ({
    qualityCharacteristics: many(qualityCharacteristics),
  }),
)

// ─── Quality Characteristics (ISO/IEC 25010:2023) ───────────────────────────

export const qualityCharacteristics = sqliteTable(
  'quality_characteristics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
    requirementTypeId: integer('requirement_type_id')
      .notNull()
      .references(() => requirementTypes.id),
    parentId: integer('parent_id'),
  },
  table => [
    index('idx_quality_characteristics_requirement_type_id').on(
      table.requirementTypeId,
    ),
    index('idx_quality_characteristics_parent_id').on(table.parentId),
  ],
)

export const qualityCharacteristicsRelations = relations(
  qualityCharacteristics,
  ({ one, many }) => ({
    requirementType: one(requirementTypes, {
      fields: [qualityCharacteristics.requirementTypeId],
      references: [requirementTypes.id],
    }),
    parent: one(qualityCharacteristics, {
      fields: [qualityCharacteristics.parentId],
      references: [qualityCharacteristics.id],
      relationName: 'parentChild',
    }),
    children: many(qualityCharacteristics, {
      relationName: 'parentChild',
    }),
  }),
)

// ─── Requirement Statuses ────────────────────────────────────────────────────

export const requirementStatuses = sqliteTable(
  'requirement_statuses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    color: text('color').notNull(),
    isSystem: integer('is_system', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    uniqueIndex('uq_requirement_statuses_name_sv').on(table.nameSv),
    uniqueIndex('uq_requirement_statuses_name_en').on(table.nameEn),
  ],
)

export const requirementStatusesRelations = relations(
  requirementStatuses,
  ({ many }) => ({
    versions: many(requirementVersions),
    transitionsFrom: many(requirementStatusTransitions, {
      relationName: 'fromStatus',
    }),
    transitionsTo: many(requirementStatusTransitions, {
      relationName: 'toStatus',
    }),
  }),
)

// ─── Requirement Status Transitions ──────────────────────────────────────────

export const requirementStatusTransitions = sqliteTable(
  'requirement_status_transitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromStatusId: integer('from_requirement_status_id')
      .notNull()
      .references(() => requirementStatuses.id),
    toStatusId: integer('to_requirement_status_id')
      .notNull()
      .references(() => requirementStatuses.id),
  },
  table => [
    uniqueIndex('uq_requirement_status_transitions_from_to').on(
      table.fromStatusId,
      table.toStatusId,
    ),
  ],
)

export const requirementStatusTransitionsRelations = relations(
  requirementStatusTransitions,
  ({ one }) => ({
    fromStatus: one(requirementStatuses, {
      fields: [requirementStatusTransitions.fromStatusId],
      references: [requirementStatuses.id],
      relationName: 'fromStatus',
    }),
    toStatus: one(requirementStatuses, {
      fields: [requirementStatusTransitions.toStatusId],
      references: [requirementStatuses.id],
      relationName: 'toStatus',
    }),
  }),
)

// ─── Requirements (stable identity) ─────────────────────────────────────────

export const requirements = sqliteTable(
  'requirements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uniqueId: text('unique_id').notNull(),
    requirementAreaId: integer('requirement_area_id')
      .notNull()
      .references(() => requirementAreas.id),
    sequenceNumber: integer('sequence_number').notNull(),
    isArchived: integer('is_archived', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('uq_requirements_unique_id').on(table.uniqueId),
    index('idx_requirements_requirement_area_id').on(table.requirementAreaId),
    index('idx_requirements_is_archived').on(table.isArchived),
  ],
)

export const requirementsRelations = relations(
  requirements,
  ({ one, many }) => ({
    area: one(requirementAreas, {
      fields: [requirements.requirementAreaId],
      references: [requirementAreas.id],
    }),
    versions: many(requirementVersions),
    packageItems: many(requirementPackageItems),
  }),
)

// ─── Requirement Versions (full snapshot per version) ────────────────────────

export const requirementVersions = sqliteTable(
  'requirement_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requirementId: integer('requirement_id')
      .notNull()
      .references(() => requirements.id),
    versionNumber: integer('version_number').notNull(),
    description: text('description').notNull(),
    acceptanceCriteria: text('acceptance_criteria'),
    requirementCategoryId: integer('requirement_category_id').references(
      () => requirementCategories.id,
    ),
    requirementTypeId: integer('requirement_type_id').references(
      () => requirementTypes.id,
    ),
    qualityCharacteristicId: integer('quality_characteristic_id').references(
      () => qualityCharacteristics.id,
    ),
    statusId: integer('requirement_status_id')
      .notNull()
      .references(() => requirementStatuses.id),
    // requirement_status_id: 1=Utkast, 2=Granskning, 3=Publicerad, 4=Arkiverad
    requiresTesting: integer('is_testing_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    verificationMethod: text('verification_method'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    editedAt: text('edited_at'),
    publishedAt: text('published_at'),
    archivedAt: text('archived_at'),
    archiveInitiatedAt: text('archive_initiated_at'),
    createdBy: text('created_by'),
  },
  table => [
    index('idx_requirement_versions_requirement_id').on(table.requirementId),
    uniqueIndex('uq_requirement_versions_requirement_id_version_number').on(
      table.requirementId,
      table.versionNumber,
    ),
  ],
)

export const requirementVersionsRelations = relations(
  requirementVersions,
  ({ one, many }) => ({
    requirement: one(requirements, {
      fields: [requirementVersions.requirementId],
      references: [requirements.id],
    }),
    status: one(requirementStatuses, {
      fields: [requirementVersions.statusId],
      references: [requirementStatuses.id],
    }),
    category: one(requirementCategories, {
      fields: [requirementVersions.requirementCategoryId],
      references: [requirementCategories.id],
    }),
    type: one(requirementTypes, {
      fields: [requirementVersions.requirementTypeId],
      references: [requirementTypes.id],
    }),
    qualityCharacteristic: one(qualityCharacteristics, {
      fields: [requirementVersions.qualityCharacteristicId],
      references: [qualityCharacteristics.id],
    }),
    versionScenarios: many(requirementVersionUsageScenarios),
    versionNormReferences: many(requirementVersionNormReferences),
  }),
)

// ─── Usage Scenarios ────────────────────────────────────────────────────────

export const usageScenarios = sqliteTable('usage_scenarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nameSv: text('name_sv').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionSv: text('description_sv'),
  descriptionEn: text('description_en'),
  ownerId: integer('owner_id').references(() => owners.id),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const usageScenariosRelations = relations(
  usageScenarios,
  ({ one, many }) => ({
    owner: one(owners, {
      fields: [usageScenarios.ownerId],
      references: [owners.id],
    }),
    versionScenarios: many(requirementVersionUsageScenarios),
  }),
)

// ─── Requirement Version ↔ Usage Scenario (join table) ──────────────────────

export const requirementVersionUsageScenarios = sqliteTable(
  'requirement_version_usage_scenarios',
  {
    requirementVersionId: integer('requirement_version_id')
      .notNull()
      .references(() => requirementVersions.id),
    usageScenarioId: integer('usage_scenario_id')
      .notNull()
      .references(() => usageScenarios.id),
  },
  table => [
    primaryKey({
      name: 'pk_requirement_version_usage_scenarios',
      columns: [table.requirementVersionId, table.usageScenarioId],
    }),
    index('idx_requirement_version_usage_scenarios_usage_scenario_id').on(
      table.usageScenarioId,
    ),
  ],
)

export const requirementVersionUsageScenariosRelations = relations(
  requirementVersionUsageScenarios,
  ({ one }) => ({
    version: one(requirementVersions, {
      fields: [requirementVersionUsageScenarios.requirementVersionId],
      references: [requirementVersions.id],
    }),
    scenario: one(usageScenarios, {
      fields: [requirementVersionUsageScenarios.usageScenarioId],
      references: [usageScenarios.id],
    }),
  }),
)

// ─── Norm References ────────────────────────────────────────────────────────

export const normReferences = sqliteTable(
  'norm_references',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    normReferenceId: text('norm_reference_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    reference: text('reference').notNull(),
    version: text('version'),
    issuer: text('issuer').notNull(),
    uri: text('uri'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('uq_norm_references_norm_reference_id').on(
      table.normReferenceId,
    ),
  ],
)

export const normReferencesRelations = relations(
  normReferences,
  ({ many }) => ({
    versionNormReferences: many(requirementVersionNormReferences),
  }),
)

// ─── Requirement Version ↔ Norm Reference (join table) ──────────────────────

export const requirementVersionNormReferences = sqliteTable(
  'requirement_version_norm_references',
  {
    requirementVersionId: integer('requirement_version_id').notNull(),
    normReferenceId: integer('norm_reference_id').notNull(),
  },
  table => [
    primaryKey({
      name: 'pk_requirement_version_norm_references',
      columns: [table.requirementVersionId, table.normReferenceId],
    }),
    index('idx_requirement_version_norm_references_norm_reference_id').on(
      table.normReferenceId,
    ),
    foreignKey({
      name: 'fk_requirement_version_norm_references_requirement_version_id',
      columns: [table.requirementVersionId],
      foreignColumns: [requirementVersions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_requirement_version_norm_references_norm_reference_id',
      columns: [table.normReferenceId],
      foreignColumns: [normReferences.id],
    }),
  ],
)

export const requirementVersionNormReferencesRelations = relations(
  requirementVersionNormReferences,
  ({ one }) => ({
    version: one(requirementVersions, {
      fields: [requirementVersionNormReferences.requirementVersionId],
      references: [requirementVersions.id],
    }),
    normReference: one(normReferences, {
      fields: [requirementVersionNormReferences.normReferenceId],
      references: [normReferences.id],
    }),
  }),
)

// ─── Package Responsibility Areas (taxonomy) ────────────────────────────────

export const packageResponsibilityAreas = sqliteTable(
  'package_responsibility_areas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
  },
  table => [
    uniqueIndex('uq_package_responsibility_areas_name_sv').on(table.nameSv),
    uniqueIndex('uq_package_responsibility_areas_name_en').on(table.nameEn),
  ],
)

// ─── Package Implementation Types (taxonomy) ─────────────────────────────────

export const packageImplementationTypes = sqliteTable(
  'package_implementation_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
  },
  table => [
    uniqueIndex('uq_package_implementation_types_name_sv').on(table.nameSv),
    uniqueIndex('uq_package_implementation_types_name_en').on(table.nameEn),
  ],
)

// ─── Package Lifecycle Statuses (taxonomy) ────────────────────────────────────

export const packageLifecycleStatuses = sqliteTable(
  'package_lifecycle_statuses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameSv: text('name_sv').notNull(),
    nameEn: text('name_en').notNull(),
  },
  table => [
    uniqueIndex('uq_package_lifecycle_statuses_name_sv').on(table.nameSv),
    uniqueIndex('uq_package_lifecycle_statuses_name_en').on(table.nameEn),
  ],
)

// ─── Requirement Packages ────────────────────────────────────────────────────

export const requirementPackages = sqliteTable(
  'requirement_packages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uniqueId: text('unique_id').notNull(),
    name: text('name').notNull(),
    packageResponsibilityAreaId: integer(
      'package_responsibility_area_id',
    ).references(() => packageResponsibilityAreas.id),
    packageImplementationTypeId: integer(
      'package_implementation_type_id',
    ).references(() => packageImplementationTypes.id),
    packageLifecycleStatusId: integer('package_lifecycle_status_id').references(
      () => packageLifecycleStatuses.id,
    ),
    businessNeedsReference: text('business_needs_reference'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('uq_requirement_packages_unique_id').on(table.uniqueId),
  ],
)

export const requirementPackagesRelations = relations(
  requirementPackages,
  ({ one, many }) => ({
    responsibilityArea: one(packageResponsibilityAreas, {
      fields: [requirementPackages.packageResponsibilityAreaId],
      references: [packageResponsibilityAreas.id],
    }),
    implementationType: one(packageImplementationTypes, {
      fields: [requirementPackages.packageImplementationTypeId],
      references: [packageImplementationTypes.id],
    }),
    lifecycleStatus: one(packageLifecycleStatuses, {
      fields: [requirementPackages.packageLifecycleStatusId],
      references: [packageLifecycleStatuses.id],
    }),
    items: many(requirementPackageItems),
    needsReferences: many(packageNeedsReferences),
  }),
)

// ─── Package Needs References ─────────────────────────────────────────────────

export const packageNeedsReferences = sqliteTable(
  'package_needs_references',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    packageId: integer('package_id')
      .notNull()
      .references(() => requirementPackages.id),
    text: text('text').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('uq_package_needs_references_package_id_id').on(
      table.packageId,
      table.id,
    ),
    uniqueIndex('uq_package_needs_references_package_text').on(
      table.packageId,
      table.text,
    ),
  ],
)

export const packageNeedsReferencesRelations = relations(
  packageNeedsReferences,
  ({ one, many }) => ({
    package: one(requirementPackages, {
      fields: [packageNeedsReferences.packageId],
      references: [requirementPackages.id],
    }),
    items: many(requirementPackageItems),
  }),
)

// ─── Requirement Package Items ───────────────────────────────────────────────

export const requirementPackageItems = sqliteTable(
  'requirement_package_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    packageId: integer('requirement_package_id')
      .notNull()
      .references(() => requirementPackages.id),
    requirementId: integer('requirement_id')
      .notNull()
      .references(() => requirements.id),
    requirementVersionId: integer('requirement_version_id')
      .notNull()
      .references(() => requirementVersions.id),
    needsReferenceId: integer('needs_reference_id'),
    unused1: text('unused_1'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    index('idx_requirement_package_items_requirement_package_id').on(
      table.packageId,
    ),
    index('idx_requirement_package_items_requirement_id').on(
      table.requirementId,
    ),
    uniqueIndex('uq_requirement_package_items_package_requirement').on(
      table.packageId,
      table.requirementId,
    ),
    foreignKey({
      columns: [table.packageId, table.needsReferenceId],
      foreignColumns: [
        packageNeedsReferences.packageId,
        packageNeedsReferences.id,
      ],
      name: 'fk_requirement_package_items_requirement_package_id_needs_reference_id',
    }),
  ],
)

export const requirementPackageItemsRelations = relations(
  requirementPackageItems,
  ({ one }) => ({
    package: one(requirementPackages, {
      fields: [requirementPackageItems.packageId],
      references: [requirementPackages.id],
    }),
    requirement: one(requirements, {
      fields: [requirementPackageItems.requirementId],
      references: [requirements.id],
    }),
    version: one(requirementVersions, {
      fields: [requirementPackageItems.requirementVersionId],
      references: [requirementVersions.id],
    }),
    needsReference: one(packageNeedsReferences, {
      fields: [
        requirementPackageItems.packageId,
        requirementPackageItems.needsReferenceId,
      ],
      references: [packageNeedsReferences.packageId, packageNeedsReferences.id],
    }),
  }),
)

// ─── UI Terminology ──────────────────────────────────────────────────────────

export const uiTerminology = sqliteTable(
  'ui_terminology',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    singularSv: text('singular_sv').notNull(),
    pluralSv: text('plural_sv').notNull(),
    definitePluralSv: text('definite_plural_sv').notNull(),
    singularEn: text('singular_en').notNull(),
    pluralEn: text('plural_en').notNull(),
    definitePluralEn: text('definite_plural_en').notNull(),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [uniqueIndex('uq_ui_terminology_key').on(table.key)],
)

// ─── Requirement List Column Defaults ────────────────────────────────────────

export const requirementListColumnDefaults = sqliteTable(
  'requirement_list_column_defaults',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    columnId: text('column_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    isDefaultVisible: integer('is_default_visible', { mode: 'boolean' })
      .notNull()
      .default(true),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('uq_requirement_list_column_defaults_column_id').on(
      table.columnId,
    ),
    uniqueIndex('uq_requirement_list_column_defaults_sort_order').on(
      table.sortOrder,
    ),
  ],
)
