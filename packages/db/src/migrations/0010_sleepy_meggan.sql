CREATE TABLE `connected_account_catalog` (
	`auth_type` text DEFAULT 'pat' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`name` text NOT NULL,
	`risk_level` text DEFAULT 'unknown' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_connected_accounts` (
	`catalog_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`credential_type` text DEFAULT 'pat' NOT NULL,
	`encrypted_credential` text NOT NULL,
	`expires_at` integer,
	`external_account_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`refresh_token` text,
	`scopes` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`catalog_id`) REFERENCES `connected_account_catalog`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_connected_accounts_user` ON `user_connected_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_connected_accounts_catalog` ON `user_connected_accounts` (`catalog_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_connected_accounts_user_catalog` ON `user_connected_accounts` (`user_id`,`catalog_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `connected_account_catalog` (`id`, `name`, `auth_type`, `risk_level`) VALUES ('github', 'GitHub', 'pat', 'mutating');