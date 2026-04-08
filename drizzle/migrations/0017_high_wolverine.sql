CREATE TABLE `improvement_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_id` integer NOT NULL,
	`requirement_version_id` integer,
	`content` text NOT NULL,
	`is_review_requested` integer DEFAULT 0 NOT NULL,
	`resolution` integer,
	`resolution_motivation` text,
	`resolved_by` text,
	`resolved_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requirement_version_id`) REFERENCES `requirement_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_improvement_suggestions_requirement_id` ON `improvement_suggestions` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `idx_improvement_suggestions_requirement_version_id` ON `improvement_suggestions` (`requirement_version_id`);--> statement-breakpoint
CREATE TRIGGER `enforce_requirement_version_match_insert`
BEFORE INSERT ON `improvement_suggestions`
WHEN NEW.`requirement_version_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'requirement_version_id does not belong to the same requirement_id')
  WHERE (
    SELECT `requirement_id` FROM `requirement_versions` WHERE `id` = NEW.`requirement_version_id`
  ) != NEW.`requirement_id`;
END;--> statement-breakpoint
CREATE TRIGGER `enforce_requirement_version_match_update`
BEFORE UPDATE ON `improvement_suggestions`
WHEN NEW.`requirement_version_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'requirement_version_id does not belong to the same requirement_id')
  WHERE (
    SELECT `requirement_id` FROM `requirement_versions` WHERE `id` = NEW.`requirement_version_id`
  ) != NEW.`requirement_id`;
END;
