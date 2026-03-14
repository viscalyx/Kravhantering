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
CREATE UNIQUE INDEX `uq_ui_terminology_key` ON `ui_terminology` (`key`);
