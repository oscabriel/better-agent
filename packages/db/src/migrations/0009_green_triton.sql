CREATE TABLE `thinkspace_approvals` (
	`action_kind` text NOT NULL,
	`approval_request_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_revision_id` text,
	`profile_version` integer,
	`proposed_content` text NOT NULL,
	`proposed_summary` text NOT NULL,
	`resolved_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`submission_id` text,
	`thinkspace_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thinkspace_id`) REFERENCES `thinkspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thinkspace_approvals_owner_status_created` ON `thinkspace_approvals` (`owner_user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_thinkspace_approvals_thinkspace_status` ON `thinkspace_approvals` (`thinkspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_thinkspace_approvals_thinkspace_tool_call` ON `thinkspace_approvals` (`thinkspace_id`,`tool_call_id`);--> statement-breakpoint
CREATE TABLE `thinkspace_memories` (
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`profile_revision_id` text,
	`profile_version` integer,
	`thinkspace_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	FOREIGN KEY (`thinkspace_id`) REFERENCES `thinkspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thinkspace_memories_thinkspace_created` ON `thinkspace_memories` (`thinkspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_thinkspace_memories_thinkspace_tool_call` ON `thinkspace_memories` (`thinkspace_id`,`tool_call_id`);