ALTER TABLE `deals` ADD `fxRateLockedAtCreation` decimal(10,6);--> statement-breakpoint
ALTER TABLE `deals` ADD `dealSignedDate` timestamp;--> statement-breakpoint
ALTER TABLE `deals` ADD `fxRateLockDate` timestamp;