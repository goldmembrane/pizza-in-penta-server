-- CreateTable
CREATE TABLE `PizzaShop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `placeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,

    UNIQUE INDEX `PizzaShop_placeId_key`(`placeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopMetric` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `timeSlot` VARCHAR(191) NOT NULL,
    `popularity` DOUBLE NULL,
    `deliveryDelay` DOUBLE NULL,
    `twitterMentions` INTEGER NULL,
    `source` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShopMetric` ADD CONSTRAINT `ShopMetric_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `PizzaShop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
