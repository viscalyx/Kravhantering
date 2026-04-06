CREATE TABLE `risk_levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_sv` text NOT NULL,
	`name_en` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_risk_levels_name_sv` ON `risk_levels` (`name_sv`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_risk_levels_name_en` ON `risk_levels` (`name_en`);--> statement-breakpoint
ALTER TABLE `requirement_versions` ADD `risk_level_id` integer REFERENCES risk_levels(id);