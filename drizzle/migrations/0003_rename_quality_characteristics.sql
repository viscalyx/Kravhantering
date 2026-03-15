ALTER TABLE `requirement_type_categories` RENAME TO `quality_characteristics`;--> statement-breakpoint
ALTER TABLE `quality_characteristics` RENAME COLUMN `parent_category_id` TO `parent_id`;--> statement-breakpoint
ALTER TABLE `requirement_versions` RENAME COLUMN `requirement_type_category_id` TO `quality_characteristic_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_requirement_type_categories_requirement_type_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_requirement_type_categories_parent_category_id`;--> statement-breakpoint
CREATE INDEX `idx_quality_characteristics_requirement_type_id` ON `quality_characteristics` (`requirement_type_id`);--> statement-breakpoint
CREATE INDEX `idx_quality_characteristics_parent_id` ON `quality_characteristics` (`parent_id`);