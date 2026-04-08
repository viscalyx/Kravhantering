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
CREATE INDEX `idx_improvement_suggestions_requirement_version_id` ON `improvement_suggestions` (`requirement_version_id`);
