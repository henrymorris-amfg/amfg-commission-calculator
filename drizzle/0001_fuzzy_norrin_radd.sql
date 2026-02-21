CREATE TABLE `ae_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`pinHash` varchar(256) NOT NULL,
	`joinDate` timestamp NOT NULL,
	`isTeamLeader` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ae_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commission_payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`aeId` int NOT NULL,
	`payoutYear` int NOT NULL,
	`payoutMonth` int NOT NULL,
	`payoutNumber` int NOT NULL,
	`grossCommissionUsd` decimal(12,2) NOT NULL,
	`referralDeductionUsd` decimal(12,2) NOT NULL DEFAULT '0',
	`onboardingDeductionGbp` decimal(10,2) NOT NULL DEFAULT '0',
	`netCommissionUsd` decimal(12,2) NOT NULL,
	`fxRateUsed` decimal(10,6) NOT NULL,
	`netCommissionGbp` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commission_payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`customerName` varchar(256) NOT NULL,
	`contractType` enum('annual','monthly') NOT NULL,
	`startYear` int NOT NULL,
	`startMonth` int NOT NULL,
	`startDay` int NOT NULL,
	`arrUsd` decimal(12,2) NOT NULL,
	`onboardingFeePaid` boolean NOT NULL DEFAULT true,
	`isReferral` boolean NOT NULL DEFAULT false,
	`tierAtStart` enum('bronze','silver','gold') NOT NULL,
	`fxRateAtEntry` decimal(10,6) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`arrUsd` decimal(12,2) NOT NULL DEFAULT '0',
	`demosTotal` int NOT NULL DEFAULT 0,
	`dialsTotal` int NOT NULL DEFAULT 0,
	`retentionRate` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_metrics_id` PRIMARY KEY(`id`)
);
