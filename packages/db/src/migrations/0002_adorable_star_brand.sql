CREATE TABLE `thinkspace_agent_profiles` (
	`activated_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`display_name` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_level` text NOT NULL,
	`requested_permissions` text DEFAULT '[]' NOT NULL,
	`routines` text DEFAULT '[]' NOT NULL,
	`skill_references` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`superseded_at` integer,
	`thinkspace_id` text NOT NULL,
	`tool_enablements` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`thinkspace_id`) REFERENCES `thinkspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_profiles_thinkspace_version` ON `thinkspace_agent_profiles` (`thinkspace_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_profiles_thinkspace_active` ON `thinkspace_agent_profiles` (`thinkspace_id`) WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_profiles_thinkspace_draft` ON `thinkspace_agent_profiles` (`thinkspace_id`) WHERE status = 'draft';--> statement-breakpoint
CREATE INDEX `idx_agent_profiles_thinkspace_status` ON `thinkspace_agent_profiles` (`thinkspace_id`,`status`);