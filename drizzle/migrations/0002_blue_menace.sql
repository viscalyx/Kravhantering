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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_requirement_areas` (
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
INSERT INTO `__new_requirement_areas`("id", "prefix", "name", "description", "owner_id", "next_sequence", "created_at", "updated_at") SELECT "id", "prefix", "name", "description", "owner_id", "next_sequence", "created_at", "updated_at" FROM `requirement_areas`;--> statement-breakpoint
DROP TABLE `requirement_areas`;--> statement-breakpoint
ALTER TABLE `__new_requirement_areas` RENAME TO `requirement_areas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_areas_prefix` ON `requirement_areas` (`prefix`);