ALTER TABLE `requirement_packages` ADD `name` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `requirement_packages` SET `name` = `name_sv`;
--> statement-breakpoint
ALTER TABLE `requirement_packages` DROP COLUMN `name_en`;
--> statement-breakpoint
ALTER TABLE `requirement_packages` DROP COLUMN `name_sv`;
