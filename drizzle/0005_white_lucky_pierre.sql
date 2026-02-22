ALTER TABLE `ae_profiles` ADD `failedPinAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ae_profiles` ADD `lockedUntil` timestamp;