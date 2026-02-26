ALTER TABLE `deals` ADD `originalAmount` decimal(12,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `originalCurrency` enum('USD','EUR','GBP') DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `conversionRate` decimal(10,6) DEFAULT '1.000000' NOT NULL;