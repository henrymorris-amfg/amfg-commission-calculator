CREATE TABLE `crm_hygiene_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`pipedriveActivityId` varchar(128) NOT NULL,
	`issueType` enum('no_deal_link','org_only','person_only','lead_only') NOT NULL,
	`organizationName` varchar(256),
	`personName` varchar(256),
	`leadTitle` varchar(256),
	`demoDate` timestamp NOT NULL,
	`isAcknowledged` boolean NOT NULL DEFAULT false,
	`acknowledgedAt` timestamp,
	`explanation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_hygiene_issues_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_hygiene_issues_pipedriveActivityId_unique` UNIQUE(`pipedriveActivityId`)
);
--> statement-breakpoint
CREATE TABLE `duplicate_demo_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`pipedriveActivityId` varchar(128) NOT NULL,
	`organizationId` int,
	`organizationName` varchar(256) NOT NULL,
	`demoDate` timestamp NOT NULL,
	`isDuplicate` boolean NOT NULL DEFAULT false,
	`isAcknowledged` boolean NOT NULL DEFAULT false,
	`acknowledgedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `duplicate_demo_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `duplicate_demo_flags_pipedriveActivityId_unique` UNIQUE(`pipedriveActivityId`)
);
