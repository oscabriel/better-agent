PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thinkspaces` (
	`approval_defaults` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`configuration_summary` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`enabled_tool_ids` text DEFAULT '[]' NOT NULL,
	`goal` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`memory_governance` text DEFAULT '{}' NOT NULL,
	`owner_user_id` text NOT NULL,
	`requested_permissions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_thinkspaces`("approval_defaults", "archived_at", "configuration_summary", "created_at", "enabled_tool_ids", "goal", "id", "memory_governance", "owner_user_id", "requested_permissions", "status", "updated_at") SELECT "approval_defaults", "archived_at", "configuration_summary", "created_at", "enabled_tool_ids", "goal", "id", "memory_governance", "owner_user_id", "requested_permissions", "status", "updated_at" FROM `thinkspaces`;--> statement-breakpoint
DROP TABLE `thinkspaces`;--> statement-breakpoint
ALTER TABLE `__new_thinkspaces` RENAME TO `thinkspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_status_updated` ON `thinkspaces` (`owner_user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_created` ON `thinkspaces` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_archived` ON `thinkspaces` (`owner_user_id`,`archived_at`);