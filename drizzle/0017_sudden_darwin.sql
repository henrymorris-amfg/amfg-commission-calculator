CREATE TABLE `tier_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`snapshotYear` int NOT NULL,
	`snapshotMonth` int NOT NULL,
	`tier` enum('bronze','silver','gold') NOT NULL,
	`avgArrUsd` decimal(12,2),
	`avgDemosPw` decimal(6,2),
	`avgDialsPw` decimal(8,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tier_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tier_snapshots_ae_month` UNIQUE(`aeId`,`snapshotYear`,`snapshotMonth`)
);
