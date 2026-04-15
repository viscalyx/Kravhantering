PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_package_local_requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`unique_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`requirement_area_id` integer,
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
INSERT INTO `__new_package_local_requirements`("id", "package_id", "unique_id", "sequence_number", "requirement_area_id", "description", "acceptance_criteria", "requirement_category_id", "requirement_type_id", "quality_characteristic_id", "risk_level_id", "is_testing_required", "verification_method", "needs_reference_id", "package_item_status_id", "note", "status_updated_at", "created_at", "updated_at") SELECT "id", "package_id", "unique_id", "sequence_number", "requirement_area_id", "description", "acceptance_criteria", "requirement_category_id", "requirement_type_id", "quality_characteristic_id", "risk_level_id", "is_testing_required", "verification_method", "needs_reference_id", "package_item_status_id", "note", "status_updated_at", "created_at", "updated_at" FROM `package_local_requirements`;--> statement-breakpoint
DROP TABLE `package_local_requirements`;--> statement-breakpoint
ALTER TABLE `__new_package_local_requirements` RENAME TO `package_local_requirements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_local_requirements_package_id_unique_id` ON `package_local_requirements` (`package_id`,`unique_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_local_requirements_package_id_sequence_number` ON `package_local_requirements` (`package_id`,`sequence_number`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_package_id` ON `package_local_requirements` (`package_id`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_requirement_area_id` ON `package_local_requirements` (`requirement_area_id`);--> statement-breakpoint
CREATE INDEX `idx_package_local_requirements_package_item_status_id` ON `package_local_requirements` (`package_item_status_id`);