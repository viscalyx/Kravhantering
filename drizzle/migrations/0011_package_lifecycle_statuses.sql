-- ─── Package Lifecycle Statuses (taxonomy) ────────────────────────────────────
CREATE TABLE `package_lifecycle_statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_lifecycle_statuses_name_sv` ON `package_lifecycle_statuses` (`name_sv`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_lifecycle_statuses_name_en` ON `package_lifecycle_statuses` (`name_en`);
--> statement-breakpoint
ALTER TABLE `requirement_packages` ADD `package_lifecycle_status_id` integer REFERENCES package_lifecycle_statuses(id);
