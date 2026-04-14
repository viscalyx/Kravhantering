DROP INDEX `uq_package_local_requirements_unique_id`;--> statement-breakpoint
UPDATE `package_local_requirements`
SET `unique_id` = 'KRAV' || printf('%04d', `sequence_number`)
WHERE `unique_id` <> 'KRAV' || printf('%04d', `sequence_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_package_local_requirements_package_id_unique_id` ON `package_local_requirements` (`package_id`,`unique_id`);
