CREATE TABLE `deviations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_item_id` integer NOT NULL,
	`motivation` text NOT NULL,
	`decision` integer,
	`decision_motivation` text,
	`decided_by` text,
	`decided_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`package_item_id`) REFERENCES `requirement_package_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deviations_package_item_id` ON `deviations` (`package_item_id`);