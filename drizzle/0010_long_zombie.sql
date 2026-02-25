ALTER TABLE `deals` ADD `isChurned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `churnMonth` int;--> statement-breakpoint
ALTER TABLE `deals` ADD `churnYear` int;--> statement-breakpoint
ALTER TABLE `deals` ADD `churnReason` text;