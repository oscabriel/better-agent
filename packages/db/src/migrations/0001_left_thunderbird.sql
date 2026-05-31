CREATE TABLE `mcp_server_catalog` (
	`auth_type` text DEFAULT 'none' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`description` text,
	`id` text PRIMARY KEY NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`name` text NOT NULL,
	`risk_level` text DEFAULT 'unknown' NOT NULL,
	`transport` text DEFAULT 'streamable_http' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `thinkspaces` (
	`archived_at` integer,
	`approval_defaults` text DEFAULT '{}' NOT NULL,
	`configuration_summary` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`enabled_tool_ids` text DEFAULT '[]' NOT NULL,
	`goal` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`initial_instructions` text DEFAULT '' NOT NULL,
	`memory_governance` text DEFAULT '{}' NOT NULL,
	`owner_user_id` text NOT NULL,
	`requested_permissions` text DEFAULT '[]' NOT NULL,
	`selected_skill_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_status_updated` ON `thinkspaces` (`owner_user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_created` ON `thinkspaces` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_thinkspaces_owner_archived` ON `thinkspaces` (`owner_user_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `user_mcp_connections` (
	`catalog_visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`description` text,
	`encrypted_headers` text DEFAULT '{}' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`server_id` text,
	`transport` text DEFAULT 'streamable_http' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`url` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_server_catalog`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_mcp_connections_user` ON `user_mcp_connections` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_mcp_connections_server` ON `user_mcp_connections` (`server_id`);--> statement-breakpoint
CREATE TABLE `user_product_settings` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`default_model` text,
	`reasoning_effort` text DEFAULT 'medium' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`web_search_enabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_provider_credentials` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`encrypted_credential` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`provider_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_provider_credentials_user` ON `user_provider_credentials` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_provider_credentials_user_provider` ON `user_provider_credentials` (`user_id`,`provider_id`);