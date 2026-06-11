CREATE TABLE `thinkspace_permissions` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`provider_id` text,
	`reason` text DEFAULT '' NOT NULL,
	`thinkspace_id` text NOT NULL,
	FOREIGN KEY (`thinkspace_id`) REFERENCES `thinkspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thinkspace_permissions_thinkspace` ON `thinkspace_permissions` (`thinkspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_thinkspace_permissions_model_provider` ON `thinkspace_permissions` (`thinkspace_id`,`kind`,`provider_id`);--> statement-breakpoint
ALTER TABLE `thinkspaces` DROP COLUMN `approval_defaults`;--> statement-breakpoint
ALTER TABLE `thinkspaces` DROP COLUMN `requested_permissions`;