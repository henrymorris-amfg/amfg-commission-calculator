ALTER TABLE `deals` ADD `fxRateAtWon` decimal(10,6);--> statement-breakpoint
ALTER TABLE `deals` ADD `billingFrequency` enum('annual','monthly');--> statement-breakpoint
ALTER TABLE `deals` ADD `pipedriveWonTime` timestamp;--> statement-breakpoint
ALTER TABLE `deals` ADD `contractStartDate` timestamp;