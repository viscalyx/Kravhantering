CREATE TABLE `package_needs_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `requirement_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_package_needs_references_package_id` ON `package_needs_references` (`package_id`);
--> statement-breakpoint
ALTER TABLE `requirement_package_items` ADD `needs_reference_id` integer REFERENCES `package_needs_references`(`id`);
--> statement-breakpoint
ALTER TABLE `requirement_package_items` RENAME COLUMN `needs_reference` TO `unused_1`;
--> statement-breakpoint
UPDATE `requirement_package_items` SET `unused_1` = NULL;
