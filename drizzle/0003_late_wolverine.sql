ALTER TABLE `monthly_metrics` ADD `connectedDials` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `monthly_metrics` ADD `connectionRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `monthly_metrics` ADD `talkTimeSecs` int DEFAULT 0;