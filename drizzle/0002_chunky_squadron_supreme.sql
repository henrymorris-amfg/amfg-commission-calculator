CREATE TABLE `commission_structures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`versionLabel` varchar(128) NOT NULL,
	`effectiveFrom` timestamp NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`bronzeRate` decimal(5,4) NOT NULL DEFAULT '0.1300',
	`silverRate` decimal(5,4) NOT NULL DEFAULT '0.1600',
	`goldRate` decimal(5,4) NOT NULL DEFAULT '0.1900',
	`standardTargets` json NOT NULL,
	`teamLeaderTargets` json NOT NULL,
	`monthlyPayoutMonths` int NOT NULL DEFAULT 13,
	`onboardingDeductionGbp` decimal(10,2) NOT NULL DEFAULT '500.00',
	`onboardingArrReductionUsd` decimal(12,2) NOT NULL DEFAULT '5000.00',
	`createdBy` varchar(128) NOT NULL DEFAULT 'system',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commission_structures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `commissionStructureId` int;