CREATE TABLE `requirement_list_column_defaults` (
	`column_id` text PRIMARY KEY NOT NULL,
	`sort_order` integer NOT NULL,
	`default_visible` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_list_column_defaults_sort_order` ON `requirement_list_column_defaults` (`sort_order`);--> statement-breakpoint
CREATE TABLE `ui_terminology` (
	`key` text PRIMARY KEY NOT NULL,
	`sv_singular` text NOT NULL,
	`sv_plural` text NOT NULL,
	`sv_definite_plural` text NOT NULL,
	`en_singular` text NOT NULL,
	`en_plural` text NOT NULL,
	`en_definite_plural` text NOT NULL,
	`updated_at` text NOT NULL
);
