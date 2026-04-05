CREATE TABLE `norm_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`norm_reference_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`reference` text NOT NULL,
	`version` text,
	`issuer` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_norm_references_norm_reference_id` ON `norm_references` (`norm_reference_id`);
--> statement-breakpoint
CREATE TABLE `requirement_version_norm_references` (
	`requirement_version_id` integer NOT NULL,
	`norm_reference_id` integer NOT NULL,
	PRIMARY KEY(`requirement_version_id`, `norm_reference_id`),
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`norm_reference_id`) REFERENCES `norm_references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirement_version_norm_references_norm_reference_id` ON `requirement_version_norm_references` (`norm_reference_id`);
--> statement-breakpoint
INSERT INTO `requirement_list_column_defaults` (`column_id`, `sort_order`, `is_default_visible`, `updated_at`)
VALUES ('normReferences', 10, 0, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
