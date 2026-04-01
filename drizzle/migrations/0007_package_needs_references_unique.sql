DROP INDEX `idx_package_needs_references_package_id`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_needs_references_package_text` ON `package_needs_references` (`package_id`, `text`);
