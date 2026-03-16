CREATE TABLE `owners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_owners_email` ON `owners` (`email`);--> statement-breakpoint
CREATE TABLE `package_implementation_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_implementation_types_name_sv` ON `package_implementation_types` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_implementation_types_name_en` ON `package_implementation_types` (`name_en`);--> statement-breakpoint
CREATE TABLE `package_responsibility_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_responsibility_areas_name_sv` ON `package_responsibility_areas` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_responsibility_areas_name_en` ON `package_responsibility_areas` (`name_en`);--> statement-breakpoint
CREATE TABLE `quality_characteristics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`requirement_type_id` integer NOT NULL,
	`parent_id` integer,
	FOREIGN KEY (`requirement_type_id`) REFERENCES `requirement_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quality_characteristics_requirement_type_id` ON `quality_characteristics` (`requirement_type_id`);--> statement-breakpoint
CREATE INDEX `idx_quality_characteristics_parent_id` ON `quality_characteristics` (`parent_id`);--> statement-breakpoint
CREATE TABLE `requirement_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`owner_id` integer,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_areas_prefix` ON `requirement_areas` (`prefix`);--> statement-breakpoint
CREATE TABLE `requirement_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_categories_name_sv` ON `requirement_categories` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_categories_name_en` ON `requirement_categories` (`name_en`);--> statement-breakpoint
CREATE TABLE `requirement_list_column_defaults` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`column_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_default_visible` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_list_column_defaults_column_id` ON `requirement_list_column_defaults` (`column_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_list_column_defaults_sort_order` ON `requirement_list_column_defaults` (`sort_order`);--> statement-breakpoint
CREATE TABLE `requirement_package_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_package_id` integer NOT NULL,
	`requirement_id` integer NOT NULL,
	`requirement_version_id` integer NOT NULL,
	`needs_reference` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`requirement_package_id`) REFERENCES `requirement_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirement_package_items_requirement_package_id` ON `requirement_package_items` (`requirement_package_id`);--> statement-breakpoint
CREATE INDEX `idx_requirement_package_items_requirement_id` ON `requirement_package_items` (`requirement_id`);--> statement-breakpoint
CREATE TABLE `requirement_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`package_responsibility_area_id` integer,
	`package_implementation_type_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`package_responsibility_area_id`) REFERENCES `package_responsibility_areas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_implementation_type_id`) REFERENCES `package_implementation_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_version_id` integer NOT NULL,
	`name` text NOT NULL,
	`uri` text,
	`owner` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirement_references_requirement_version_id` ON `requirement_references` (`requirement_version_id`);--> statement-breakpoint
CREATE TABLE `requirement_status_transitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_requirement_status_id` integer NOT NULL,
	`to_requirement_status_id` integer NOT NULL,
	FOREIGN KEY (`from_requirement_status_id`) REFERENCES `requirement_statuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_requirement_status_id`) REFERENCES `requirement_statuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_status_transitions_from_to` ON `requirement_status_transitions` (`from_requirement_status_id`,`to_requirement_status_id`);--> statement-breakpoint
CREATE TABLE `requirement_statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`color` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_statuses_name_sv` ON `requirement_statuses` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_statuses_name_en` ON `requirement_statuses` (`name_en`);--> statement-breakpoint
CREATE TABLE `requirement_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_types_name_sv` ON `requirement_types` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_types_name_en` ON `requirement_types` (`name_en`);--> statement-breakpoint
CREATE TABLE `requirement_version_usage_scenarios` (
	`requirement_version_id` integer NOT NULL,
	`usage_scenario_id` integer NOT NULL,
	PRIMARY KEY(`requirement_version_id`, `usage_scenario_id`),
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usage_scenario_id`) REFERENCES `usage_scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`description` text NOT NULL,
	`acceptance_criteria` text,
	`requirement_category_id` integer,
	`requirement_type_id` integer,
	`quality_characteristic_id` integer,
	`requirement_status_id` integer NOT NULL,
	`is_testing_required` integer DEFAULT false NOT NULL,
	`verification_method` text,
	`created_at` text NOT NULL,
	`edited_at` text,
	`published_at` text,
	`archived_at` text,
	`created_by` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_category_id`) REFERENCES `requirement_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_type_id`) REFERENCES `requirement_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quality_characteristic_id`) REFERENCES `quality_characteristics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_status_id`) REFERENCES `requirement_statuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirement_versions_requirement_id` ON `requirement_versions` (`requirement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_versions_requirement_id_version_number` ON `requirement_versions` (`requirement_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unique_id` text NOT NULL,
	`requirement_area_id` integer NOT NULL,
	`sequence_number` integer NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`requirement_area_id`) REFERENCES `requirement_areas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirements_unique_id` ON `requirements` (`unique_id`);--> statement-breakpoint
CREATE INDEX `idx_requirements_requirement_area_id` ON `requirements` (`requirement_area_id`);--> statement-breakpoint
CREATE INDEX `idx_requirements_is_archived` ON `requirements` (`is_archived`);--> statement-breakpoint
CREATE TABLE `ui_terminology` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`singular_sv` text NOT NULL,
	`plural_sv` text NOT NULL,
	`definite_plural_sv` text NOT NULL,
	`singular_en` text NOT NULL,
	`plural_en` text NOT NULL,
	`definite_plural_en` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ui_terminology_key` ON `ui_terminology` (`key`);--> statement-breakpoint
CREATE TABLE `usage_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`description_sv` text,
	`description_en` text,
	`owner_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
