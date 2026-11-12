CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`location_id` text,
	`tag` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`cost` integer NOT NULL,
	`salvage` integer NOT NULL,
	`useful_life_years` integer NOT NULL,
	`purchased_on` integer NOT NULL,
	`last_condition` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_university_tag` ON `assets` (`university_id`,`tag`);--> statement-breakpoint
CREATE TABLE `custody` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`borrower_user_id` text NOT NULL,
	`attendant_user_id` text NOT NULL,
	`checked_out_at` integer NOT NULL,
	`due_at` integer,
	`checked_in_at` integer,
	`condition_on_return` text,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`borrower_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendant_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custody_one_open_loan` ON `custody` (`asset_id`) WHERE "custody"."checked_in_at" is null;--> statement-breakpoint
CREATE TABLE `found_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`university_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`reporter_user_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
