// Migration 0003: make ON DELETE / ON UPDATE actions explicit on every
// foreign-key constraint defined in 0001_initial_sqlserver.mjs.
//
// The TypeORM entities under lib/typeorm/entities declare onDelete and
// onUpdate on every relation. The baseline 0001 migration only emits an
// explicit ON DELETE clause for 9 of 41 FKs and never emits ON UPDATE.
// SQL Server defaults to NO ACTION for both when a clause is omitted, so
// runtime behavior is unchanged, but the migration SQL no longer matches
// the entity intent. This migration drops and recreates every FK with the
// explicit clauses that match the entity decorators.
//
// down() restores the baseline 0001 shape: the 32 previously implicit FKs
// are recreated without explicit clauses, and the 9 already-explicit FKs
// are recreated with their original ON DELETE clause only.

const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_item_status_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_item_status_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_item_status_id] FOREIGN KEY ([package_item_status_id]) REFERENCES [package_item_statuses] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_id] FOREIGN KEY ([package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_deviations_package_local_requirement_id') ALTER TABLE [package_local_requirement_deviations] DROP CONSTRAINT [fk_package_local_requirement_deviations_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_deviations] ADD CONSTRAINT [fk_package_local_requirement_deviations_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_norm_references_package_local_requirement_id') ALTER TABLE [package_local_requirement_norm_references] DROP CONSTRAINT [fk_package_local_requirement_norm_references_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_norm_references] ADD CONSTRAINT [fk_package_local_requirement_norm_references_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_improvement_suggestions_requirement_version_id') ALTER TABLE [improvement_suggestions] DROP CONSTRAINT [fk_improvement_suggestions_requirement_version_id];",
  'ALTER TABLE [improvement_suggestions] ADD CONSTRAINT [fk_improvement_suggestions_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_improvement_suggestions_requirement_id') ALTER TABLE [improvement_suggestions] DROP CONSTRAINT [fk_improvement_suggestions_requirement_id];",
  'ALTER TABLE [improvement_suggestions] ADD CONSTRAINT [fk_improvement_suggestions_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_deviations_package_item_id') ALTER TABLE [deviations] DROP CONSTRAINT [fk_deviations_package_item_id];",
  'ALTER TABLE [deviations] ADD CONSTRAINT [fk_deviations_package_item_id] FOREIGN KEY ([package_item_id]) REFERENCES [requirement_package_items] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_norm_references_requirement_version_id') ALTER TABLE [requirement_version_norm_references] DROP CONSTRAINT [fk_requirement_version_norm_references_requirement_version_id];",
  'ALTER TABLE [requirement_version_norm_references] ADD CONSTRAINT [fk_requirement_version_norm_references_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_usage_scenarios_package_local_requirement_id') ALTER TABLE [package_local_requirement_usage_scenarios] DROP CONSTRAINT [fk_package_local_requirement_usage_scenarios_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_usage_scenarios] ADD CONSTRAINT [fk_package_local_requirement_usage_scenarios_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_areas_owner_id') ALTER TABLE [requirement_areas] DROP CONSTRAINT [fk_requirement_areas_owner_id];",
  'ALTER TABLE [requirement_areas] ADD CONSTRAINT [fk_requirement_areas_owner_id] FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_implementation_type_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_implementation_type_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_implementation_type_id] FOREIGN KEY ([package_implementation_type_id]) REFERENCES [package_implementation_types] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_responsibility_area_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_responsibility_area_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_responsibility_area_id] FOREIGN KEY ([package_responsibility_area_id]) REFERENCES [package_responsibility_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_lifecycle_status_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_lifecycle_status_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_lifecycle_status_id] FOREIGN KEY ([package_lifecycle_status_id]) REFERENCES [package_lifecycle_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_needs_references_package_id') ALTER TABLE [package_needs_references] DROP CONSTRAINT [fk_package_needs_references_package_id];",
  'ALTER TABLE [package_needs_references] ADD CONSTRAINT [fk_package_needs_references_package_id] FOREIGN KEY ([package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_status_transitions_to_requirement_status_id') ALTER TABLE [requirement_status_transitions] DROP CONSTRAINT [fk_requirement_status_transitions_to_requirement_status_id];",
  'ALTER TABLE [requirement_status_transitions] ADD CONSTRAINT [fk_requirement_status_transitions_to_requirement_status_id] FOREIGN KEY ([to_requirement_status_id]) REFERENCES [requirement_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_status_transitions_from_requirement_status_id') ALTER TABLE [requirement_status_transitions] DROP CONSTRAINT [fk_requirement_status_transitions_from_requirement_status_id];",
  'ALTER TABLE [requirement_status_transitions] ADD CONSTRAINT [fk_requirement_status_transitions_from_requirement_status_id] FOREIGN KEY ([from_requirement_status_id]) REFERENCES [requirement_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_quality_characteristics_requirement_type_id') ALTER TABLE [quality_characteristics] DROP CONSTRAINT [fk_quality_characteristics_requirement_type_id];",
  'ALTER TABLE [quality_characteristics] ADD CONSTRAINT [fk_quality_characteristics_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_requirement_area_id') ALTER TABLE [requirements] DROP CONSTRAINT [fk_requirements_requirement_area_id];",
  'ALTER TABLE [requirements] ADD CONSTRAINT [fk_requirements_requirement_area_id] FOREIGN KEY ([requirement_area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_id_needs_reference_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_id_needs_reference_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_id_needs_reference_id] FOREIGN KEY ([package_id], [needs_reference_id]) REFERENCES [package_needs_references] ([package_id], [id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_risk_level_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_risk_level_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_quality_characteristic_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_quality_characteristic_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_quality_characteristic_id] FOREIGN KEY ([quality_characteristic_id]) REFERENCES [quality_characteristics] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_type_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_type_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_category_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_category_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_category_id] FOREIGN KEY ([requirement_category_id]) REFERENCES [requirement_categories] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_area_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_area_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_area_id] FOREIGN KEY ([requirement_area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_norm_references_norm_reference_id') ALTER TABLE [package_local_requirement_norm_references] DROP CONSTRAINT [fk_package_local_requirement_norm_references_norm_reference_id];",
  'ALTER TABLE [package_local_requirement_norm_references] ADD CONSTRAINT [fk_package_local_requirement_norm_references_norm_reference_id] FOREIGN KEY ([norm_reference_id]) REFERENCES [norm_references] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_status_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_status_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_status_id] FOREIGN KEY ([requirement_status_id]) REFERENCES [requirement_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_quality_characteristic_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_quality_characteristic_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_quality_characteristic_id] FOREIGN KEY ([quality_characteristic_id]) REFERENCES [quality_characteristics] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_type_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_type_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_category_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_category_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_category_id] FOREIGN KEY ([requirement_category_id]) REFERENCES [requirement_categories] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_risk_level_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_risk_level_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_package_id_needs_reference_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_package_id_needs_reference_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_package_id_needs_reference_id] FOREIGN KEY ([requirement_package_id], [needs_reference_id]) REFERENCES [package_needs_references] ([package_id], [id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_version_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_version_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_package_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_package_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_package_id] FOREIGN KEY ([requirement_package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_package_item_status_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_package_item_status_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_package_item_status_id] FOREIGN KEY ([package_item_status_id]) REFERENCES [package_item_statuses] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_norm_references_norm_reference_id') ALTER TABLE [requirement_version_norm_references] DROP CONSTRAINT [fk_requirement_version_norm_references_norm_reference_id];",
  'ALTER TABLE [requirement_version_norm_references] ADD CONSTRAINT [fk_requirement_version_norm_references_norm_reference_id] FOREIGN KEY ([norm_reference_id]) REFERENCES [norm_references] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_usage_scenarios_owner_id') ALTER TABLE [usage_scenarios] DROP CONSTRAINT [fk_usage_scenarios_owner_id];",
  'ALTER TABLE [usage_scenarios] ADD CONSTRAINT [fk_usage_scenarios_owner_id] FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_usage_scenarios_usage_scenario_id') ALTER TABLE [package_local_requirement_usage_scenarios] DROP CONSTRAINT [fk_package_local_requirement_usage_scenarios_usage_scenario_id];",
  'ALTER TABLE [package_local_requirement_usage_scenarios] ADD CONSTRAINT [fk_package_local_requirement_usage_scenarios_usage_scenario_id] FOREIGN KEY ([usage_scenario_id]) REFERENCES [usage_scenarios] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_usage_scenarios_usage_scenario_id') ALTER TABLE [requirement_version_usage_scenarios] DROP CONSTRAINT [fk_requirement_version_usage_scenarios_usage_scenario_id];",
  'ALTER TABLE [requirement_version_usage_scenarios] ADD CONSTRAINT [fk_requirement_version_usage_scenarios_usage_scenario_id] FOREIGN KEY ([usage_scenario_id]) REFERENCES [usage_scenarios] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_usage_scenarios_requirement_version_id') ALTER TABLE [requirement_version_usage_scenarios] DROP CONSTRAINT [fk_requirement_version_usage_scenarios_requirement_version_id];",
  'ALTER TABLE [requirement_version_usage_scenarios] ADD CONSTRAINT [fk_requirement_version_usage_scenarios_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_item_status_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_item_status_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_item_status_id] FOREIGN KEY ([package_item_status_id]) REFERENCES [package_item_statuses] ([id]) ON DELETE SET NULL;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_id] FOREIGN KEY ([package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_deviations_package_local_requirement_id') ALTER TABLE [package_local_requirement_deviations] DROP CONSTRAINT [fk_package_local_requirement_deviations_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_deviations] ADD CONSTRAINT [fk_package_local_requirement_deviations_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_norm_references_package_local_requirement_id') ALTER TABLE [package_local_requirement_norm_references] DROP CONSTRAINT [fk_package_local_requirement_norm_references_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_norm_references] ADD CONSTRAINT [fk_package_local_requirement_norm_references_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_improvement_suggestions_requirement_version_id') ALTER TABLE [improvement_suggestions] DROP CONSTRAINT [fk_improvement_suggestions_requirement_version_id];",
  'ALTER TABLE [improvement_suggestions] ADD CONSTRAINT [fk_improvement_suggestions_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE SET NULL;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_improvement_suggestions_requirement_id') ALTER TABLE [improvement_suggestions] DROP CONSTRAINT [fk_improvement_suggestions_requirement_id];",
  'ALTER TABLE [improvement_suggestions] ADD CONSTRAINT [fk_improvement_suggestions_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_deviations_package_item_id') ALTER TABLE [deviations] DROP CONSTRAINT [fk_deviations_package_item_id];",
  'ALTER TABLE [deviations] ADD CONSTRAINT [fk_deviations_package_item_id] FOREIGN KEY ([package_item_id]) REFERENCES [requirement_package_items] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_norm_references_requirement_version_id') ALTER TABLE [requirement_version_norm_references] DROP CONSTRAINT [fk_requirement_version_norm_references_requirement_version_id];",
  'ALTER TABLE [requirement_version_norm_references] ADD CONSTRAINT [fk_requirement_version_norm_references_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_usage_scenarios_package_local_requirement_id') ALTER TABLE [package_local_requirement_usage_scenarios] DROP CONSTRAINT [fk_package_local_requirement_usage_scenarios_package_local_requirement_id];",
  'ALTER TABLE [package_local_requirement_usage_scenarios] ADD CONSTRAINT [fk_package_local_requirement_usage_scenarios_package_local_requirement_id] FOREIGN KEY ([package_local_requirement_id]) REFERENCES [package_local_requirements] ([id]) ON DELETE CASCADE;',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_areas_owner_id') ALTER TABLE [requirement_areas] DROP CONSTRAINT [fk_requirement_areas_owner_id];",
  'ALTER TABLE [requirement_areas] ADD CONSTRAINT [fk_requirement_areas_owner_id] FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_implementation_type_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_implementation_type_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_implementation_type_id] FOREIGN KEY ([package_implementation_type_id]) REFERENCES [package_implementation_types] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_responsibility_area_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_responsibility_area_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_responsibility_area_id] FOREIGN KEY ([package_responsibility_area_id]) REFERENCES [package_responsibility_areas] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_packages_package_lifecycle_status_id') ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_package_lifecycle_status_id];",
  'ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_package_lifecycle_status_id] FOREIGN KEY ([package_lifecycle_status_id]) REFERENCES [package_lifecycle_statuses] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_needs_references_package_id') ALTER TABLE [package_needs_references] DROP CONSTRAINT [fk_package_needs_references_package_id];",
  'ALTER TABLE [package_needs_references] ADD CONSTRAINT [fk_package_needs_references_package_id] FOREIGN KEY ([package_id]) REFERENCES [requirement_packages] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_status_transitions_to_requirement_status_id') ALTER TABLE [requirement_status_transitions] DROP CONSTRAINT [fk_requirement_status_transitions_to_requirement_status_id];",
  'ALTER TABLE [requirement_status_transitions] ADD CONSTRAINT [fk_requirement_status_transitions_to_requirement_status_id] FOREIGN KEY ([to_requirement_status_id]) REFERENCES [requirement_statuses] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_status_transitions_from_requirement_status_id') ALTER TABLE [requirement_status_transitions] DROP CONSTRAINT [fk_requirement_status_transitions_from_requirement_status_id];",
  'ALTER TABLE [requirement_status_transitions] ADD CONSTRAINT [fk_requirement_status_transitions_from_requirement_status_id] FOREIGN KEY ([from_requirement_status_id]) REFERENCES [requirement_statuses] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_quality_characteristics_requirement_type_id') ALTER TABLE [quality_characteristics] DROP CONSTRAINT [fk_quality_characteristics_requirement_type_id];",
  'ALTER TABLE [quality_characteristics] ADD CONSTRAINT [fk_quality_characteristics_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_requirement_area_id') ALTER TABLE [requirements] DROP CONSTRAINT [fk_requirements_requirement_area_id];",
  'ALTER TABLE [requirements] ADD CONSTRAINT [fk_requirements_requirement_area_id] FOREIGN KEY ([requirement_area_id]) REFERENCES [requirement_areas] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_package_id_needs_reference_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_package_id_needs_reference_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_package_id_needs_reference_id] FOREIGN KEY ([package_id], [needs_reference_id]) REFERENCES [package_needs_references] ([package_id], [id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_risk_level_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_risk_level_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_quality_characteristic_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_quality_characteristic_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_quality_characteristic_id] FOREIGN KEY ([quality_characteristic_id]) REFERENCES [quality_characteristics] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_type_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_type_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_category_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_category_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_category_id] FOREIGN KEY ([requirement_category_id]) REFERENCES [requirement_categories] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirements_requirement_area_id') ALTER TABLE [package_local_requirements] DROP CONSTRAINT [fk_package_local_requirements_requirement_area_id];",
  'ALTER TABLE [package_local_requirements] ADD CONSTRAINT [fk_package_local_requirements_requirement_area_id] FOREIGN KEY ([requirement_area_id]) REFERENCES [requirement_areas] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_norm_references_norm_reference_id') ALTER TABLE [package_local_requirement_norm_references] DROP CONSTRAINT [fk_package_local_requirement_norm_references_norm_reference_id];",
  'ALTER TABLE [package_local_requirement_norm_references] ADD CONSTRAINT [fk_package_local_requirement_norm_references_norm_reference_id] FOREIGN KEY ([norm_reference_id]) REFERENCES [norm_references] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_status_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_status_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_status_id] FOREIGN KEY ([requirement_status_id]) REFERENCES [requirement_statuses] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_quality_characteristic_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_quality_characteristic_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_quality_characteristic_id] FOREIGN KEY ([quality_characteristic_id]) REFERENCES [quality_characteristics] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_type_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_type_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_type_id] FOREIGN KEY ([requirement_type_id]) REFERENCES [requirement_types] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_category_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_category_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_category_id] FOREIGN KEY ([requirement_category_id]) REFERENCES [requirement_categories] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_requirement_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_requirement_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_versions_risk_level_id') ALTER TABLE [requirement_versions] DROP CONSTRAINT [fk_requirement_versions_risk_level_id];",
  'ALTER TABLE [requirement_versions] ADD CONSTRAINT [fk_requirement_versions_risk_level_id] FOREIGN KEY ([risk_level_id]) REFERENCES [risk_levels] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_package_id_needs_reference_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_package_id_needs_reference_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_package_id_needs_reference_id] FOREIGN KEY ([requirement_package_id], [needs_reference_id]) REFERENCES [package_needs_references] ([package_id], [id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_version_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_version_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_requirement_package_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_requirement_package_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_requirement_package_id] FOREIGN KEY ([requirement_package_id]) REFERENCES [requirement_packages] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_package_items_package_item_status_id') ALTER TABLE [requirement_package_items] DROP CONSTRAINT [fk_requirement_package_items_package_item_status_id];",
  'ALTER TABLE [requirement_package_items] ADD CONSTRAINT [fk_requirement_package_items_package_item_status_id] FOREIGN KEY ([package_item_status_id]) REFERENCES [package_item_statuses] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_norm_references_norm_reference_id') ALTER TABLE [requirement_version_norm_references] DROP CONSTRAINT [fk_requirement_version_norm_references_norm_reference_id];",
  'ALTER TABLE [requirement_version_norm_references] ADD CONSTRAINT [fk_requirement_version_norm_references_norm_reference_id] FOREIGN KEY ([norm_reference_id]) REFERENCES [norm_references] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_usage_scenarios_owner_id') ALTER TABLE [usage_scenarios] DROP CONSTRAINT [fk_usage_scenarios_owner_id];",
  'ALTER TABLE [usage_scenarios] ADD CONSTRAINT [fk_usage_scenarios_owner_id] FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_package_local_requirement_usage_scenarios_usage_scenario_id') ALTER TABLE [package_local_requirement_usage_scenarios] DROP CONSTRAINT [fk_package_local_requirement_usage_scenarios_usage_scenario_id];",
  'ALTER TABLE [package_local_requirement_usage_scenarios] ADD CONSTRAINT [fk_package_local_requirement_usage_scenarios_usage_scenario_id] FOREIGN KEY ([usage_scenario_id]) REFERENCES [usage_scenarios] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_usage_scenarios_usage_scenario_id') ALTER TABLE [requirement_version_usage_scenarios] DROP CONSTRAINT [fk_requirement_version_usage_scenarios_usage_scenario_id];",
  'ALTER TABLE [requirement_version_usage_scenarios] ADD CONSTRAINT [fk_requirement_version_usage_scenarios_usage_scenario_id] FOREIGN KEY ([usage_scenario_id]) REFERENCES [usage_scenarios] ([id]);',
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirement_version_usage_scenarios_requirement_version_id') ALTER TABLE [requirement_version_usage_scenarios] DROP CONSTRAINT [fk_requirement_version_usage_scenarios_requirement_version_id];",
  'ALTER TABLE [requirement_version_usage_scenarios] ADD CONSTRAINT [fk_requirement_version_usage_scenarios_requirement_version_id] FOREIGN KEY ([requirement_version_id]) REFERENCES [requirement_versions] ([id]);',
]

export class ExplicitFkActions1714000000000 {
  name = 'ExplicitFkActions1714000000000'
  async up(queryRunner) {
    for (const sql of UP_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
  async down(queryRunner) {
    for (const sql of DOWN_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
}
export default ExplicitFkActions1714000000000
