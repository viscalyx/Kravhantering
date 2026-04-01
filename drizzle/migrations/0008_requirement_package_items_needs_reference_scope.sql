CREATE UNIQUE INDEX `uq_package_needs_references_package_id_id` ON `package_needs_references` (`package_id`, `id`);
--> statement-breakpoint
CREATE TABLE `requirement_package_items_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_package_id` integer NOT NULL,
	`requirement_id` integer NOT NULL,
	`requirement_version_id` integer NOT NULL,
	`needs_reference_id` integer,
	`unused_1` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`requirement_package_id`) REFERENCES `requirement_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `fk_requirement_package_items_requirement_package_id_needs_reference_id` FOREIGN KEY (`requirement_package_id`, `needs_reference_id`) REFERENCES `package_needs_references`(`package_id`, `id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `requirement_package_items_new` (
	`id`,
	`requirement_package_id`,
	`requirement_id`,
	`requirement_version_id`,
	`needs_reference_id`,
	`unused_1`,
	`created_at`
)
SELECT
	`id`,
	`requirement_package_id`,
	`requirement_id`,
	`requirement_version_id`,
	CASE
		WHEN `needs_reference_id` IS NULL THEN NULL
		WHEN EXISTS (
			SELECT 1
			FROM `package_needs_references` `pnr`
			WHERE `pnr`.`id` = `requirement_package_items`.`needs_reference_id`
				AND `pnr`.`package_id` = `requirement_package_items`.`requirement_package_id`
		) THEN `needs_reference_id`
		ELSE NULL
	END,
	`unused_1`,
	`created_at`
FROM `requirement_package_items`;
--> statement-breakpoint
DROP TABLE `requirement_package_items`;
--> statement-breakpoint
ALTER TABLE `requirement_package_items_new` RENAME TO `requirement_package_items`;
--> statement-breakpoint
CREATE INDEX `idx_requirement_package_items_requirement_package_id` ON `requirement_package_items` (`requirement_package_id`);
--> statement-breakpoint
CREATE INDEX `idx_requirement_package_items_requirement_id` ON `requirement_package_items` (`requirement_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_package_items_package_requirement` ON `requirement_package_items` (`requirement_package_id`, `requirement_id`);
