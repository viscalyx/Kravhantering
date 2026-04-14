CREATE TABLE `package_local_requirement_deviations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_local_requirement_id` integer NOT NULL,
	`motivation` text NOT NULL,
	`is_review_requested` integer DEFAULT 0 NOT NULL,
	`decision` integer,
	`decision_motivation` text,
	`decided_by` text,
	`decided_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`package_local_requirement_id`) REFERENCES `package_local_requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_package_local_requirement_deviations_package_local_requirement_id` ON `package_local_requirement_deviations` (`package_local_requirement_id`);--> statement-breakpoint
CREATE TABLE `package_local_requirement_norm_references` (
	`package_local_requirement_id` integer NOT NULL,
	`norm_reference_id` integer NOT NULL,
	PRIMARY KEY(`package_local_requirement_id`, `norm_reference_id`),
	FOREIGN KEY (`package_local_requirement_id`) REFERENCES `package_local_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`norm_reference_id`) REFERENCES `norm_references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_package_local_requirement_norm_references_norm_reference_id` ON `package_local_requirement_norm_references` (`norm_reference_id`);--> statement-breakpoint
CREATE TABLE `package_local_requirement_usage_scenarios` (
	`package_local_requirement_id` integer NOT NULL,
	`usage_scenario_id` integer NOT NULL,
	PRIMARY KEY(`package_local_requirement_id`, `usage_scenario_id`),
	FOREIGN KEY (`package_local_requirement_id`) REFERENCES `package_local_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usage_scenario_id`) REFERENCES `usage_scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_package_local_requirement_usage_scenarios_usage_scenario_id` ON `package_local_requirement_usage_scenarios` (`usage_scenario_id`);--> statement-breakpoint
CREATE TABLE `package_local_requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`unique_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`requirement_area_id` integer NOT NULL,
	`description` text NOT NULL,
	`acceptance_criteria` text,
	`requirement_category_id` integer,
	`requirement_type_id` integer,
	`quality_characteristic_id` integer,
	`risk_level_id` integer,
	`is_testing_required` integer DEFAULT false NOT NULL,
	`verification_method` text,
	`needs_reference_id` integer,
	`package_item_status_id` integer,
	`note` text,
	`status_updated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `requirement_packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requirement_area_id`) REFERENCES `requirement_areas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_category_id`) REFERENCES `requirement_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_type_id`) REFERENCES `requirement_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quality_characteristic_id`) REFERENCES `quality_characteristics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`risk_level_id`) REFERENCES `risk_levels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`,`needs_reference_id`) REFERENCES `package_needs_references`(`package_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_item_status_id`) REFERENCES `package_item_statuses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_local_requirements_unique_id` ON `package_local_requirements` (`unique_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_local_requirements_package_id_sequence_number` ON `package_local_requirements` (`package_id`,`sequence_number`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_package_id` ON `package_local_requirements` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_requirement_area_id` ON `package_local_requirements` (`requirement_area_id`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_package_item_status_id` ON `package_local_requirements` (`package_item_status_id`);--> statement-breakpoint
ALTER TABLE `requirement_packages` ADD `local_requirement_next_sequence` integer DEFAULT 1 NOT NULL;