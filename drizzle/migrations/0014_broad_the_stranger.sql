CREATE TABLE `package_item_statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`description_sv` text,
	`description_en` text,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_item_statuses_name_sv` ON `package_item_statuses` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_item_statuses_name_en` ON `package_item_statuses` (`name_en`);--> statement-breakpoint
ALTER TABLE `requirement_package_items` ADD `package_item_status_id` integer REFERENCES package_item_statuses(id);--> statement-breakpoint
ALTER TABLE `requirement_package_items` ADD `note` text;--> statement-breakpoint
ALTER TABLE `requirement_package_items` ADD `status_updated_at` text;--> statement-breakpoint
CREATE INDEX `idx_requirement_package_items_package_item_status_id` ON `requirement_package_items` (`package_item_status_id`);