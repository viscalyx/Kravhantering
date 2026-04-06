-- Recreate requirement_version_norm_references with explicit FK constraint names.
-- SQLite does not support ALTER TABLE to rename constraints, so the table is
-- rebuilt using the standard create-copy-drop-rename pattern.
CREATE TABLE `requirement_version_norm_references_new` (
	`requirement_version_id` integer NOT NULL,
	`norm_reference_id` integer NOT NULL,
	PRIMARY KEY(`requirement_version_id`, `norm_reference_id`),
	CONSTRAINT `fk_requirement_version_norm_references_requirement_version_id` FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `fk_requirement_version_norm_references_norm_reference_id` FOREIGN KEY (`norm_reference_id`) REFERENCES `norm_references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `requirement_version_norm_references_new` (`requirement_version_id`, `norm_reference_id`)
SELECT `requirement_version_id`, `norm_reference_id`
FROM `requirement_version_norm_references`;
--> statement-breakpoint
DROP TABLE `requirement_version_norm_references`;
--> statement-breakpoint
ALTER TABLE `requirement_version_norm_references_new` RENAME TO `requirement_version_norm_references`;
--> statement-breakpoint
CREATE INDEX `idx_requirement_version_norm_references_norm_reference_id` ON `requirement_version_norm_references` (`norm_reference_id`);
