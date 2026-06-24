ALTER TABLE `user_mcp_connections` ADD `auth_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_mcp_connections` ADD `risk_level` text DEFAULT 'unknown' NOT NULL;