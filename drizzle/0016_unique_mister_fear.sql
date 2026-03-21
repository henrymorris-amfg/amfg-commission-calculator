CREATE TABLE `pipedrive_demo_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`pipedriveActivityId` varchar(128) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`orgName` varchar(256),
	`dealId` int,
	`dealTitle` varchar(512),
	`doneDate` timestamp NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`isValid` boolean NOT NULL DEFAULT true,
	`flagReason` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pipedrive_demo_activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipedrive_demo_activities_pipedriveActivityId_unique` UNIQUE(`pipedriveActivityId`)
);
--> statement-breakpoint
CREATE INDEX `pdemo_ae_month_idx` ON `pipedrive_demo_activities` (`aeId`,`year`,`month`);