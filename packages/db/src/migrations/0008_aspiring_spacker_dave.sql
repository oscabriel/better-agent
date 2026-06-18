CREATE TABLE `thinkspace_sources` (
	`content_type` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`thinkspace_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`thinkspace_id`) REFERENCES `thinkspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thinkspace_sources_thinkspace_created` ON `thinkspace_sources` (`thinkspace_id`,`created_at`);