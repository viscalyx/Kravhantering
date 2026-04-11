ALTER TABLE `requirement_packages` ADD `unique_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'INTPLATTFORM-2026' WHERE `id` = 1;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'SAKLYFT-Q2' WHERE `id` = 2;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'PRESTANDA-SKAL' WHERE `id` = 3;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'TILLGANGLIGHET-Q3' WHERE `id` = 4;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'DATALAGRING-BACKUP' WHERE `id` = 5;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'IAM-IDENTITET' WHERE `id` = 6;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'GDPR-2026' WHERE `id` = 7;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'ETJANSTPLATT' WHERE `id` = 8;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'API-GATEWAY' WHERE `id` = 9;
--> statement-breakpoint
UPDATE `requirement_packages` SET `unique_id` = 'SYSOVERVAKNING-BAS' WHERE `id` = 10;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_packages_unique_id` ON `requirement_packages` (`unique_id`);
