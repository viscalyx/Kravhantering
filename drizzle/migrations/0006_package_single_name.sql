ALTER TABLE `requirement_packages` ADD `name` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `requirement_packages` SET `name` = COALESCE(NULLIF(TRIM(`name_sv`),''), NULLIF(TRIM(`name_en`),''), `name`);
--> statement-breakpoint
ALTER TABLE `requirement_packages` DROP COLUMN `name_en`;
--> statement-breakpoint
ALTER TABLE `requirement_packages` DROP COLUMN `name_sv`;
