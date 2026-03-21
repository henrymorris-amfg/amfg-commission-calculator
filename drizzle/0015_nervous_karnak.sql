CREATE TABLE `tier_change_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aeId` int NOT NULL,
	`notificationYear` int NOT NULL,
	`notificationMonth` int NOT NULL,
	`previousTier` enum('bronze','silver','gold') NOT NULL,
	`newTier` enum('bronze','silver','gold') NOT NULL,
	`avgArrUsd` decimal(12,2),
	`avgDemosPw` decimal(6,2),
	`avgDialsPw` decimal(8,2),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`deliveryStatus` enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tier_change_notifications_id` PRIMARY KEY(`id`)
);
