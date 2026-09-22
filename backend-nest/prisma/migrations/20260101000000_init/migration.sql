[env] loaded G:\dulizhan\backend-nest\.env
-- CreateTable
CREATE TABLE `admin_user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `password` VARCHAR(128) NOT NULL,
    `realName` VARCHAR(64) NOT NULL,
    `roleId` INTEGER NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_user_username_key`(`username`),
    INDEX `admin_user_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roleName` VARCHAR(64) NOT NULL,
    `permissions` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_login_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminUserId` INTEGER NOT NULL,
    `loginIp` VARCHAR(128) NOT NULL,
    `loginResult` INTEGER NOT NULL,
    `loginTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_login_log_adminUserId_idx`(`adminUserId`),
    INDEX `admin_login_log_loginTime_idx`(`loginTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_article` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `shortDesc` TEXT NOT NULL,
    `coverType` VARCHAR(32) NOT NULL,
    `coverImages` TEXT NULL,
    `coverVideo` VARCHAR(512) NULL,
    `coverVideoFrame` VARCHAR(512) NULL,
    `content` LONGTEXT NOT NULL,
    `isRecommend` BOOLEAN NOT NULL DEFAULT false,
    `isPublish` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blog_article_isRecommend_isPublish_sort_idx`(`isRecommend`, `isPublish`, `sort`),
    INDEX `blog_article_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_user` ADD CONSTRAINT `admin_user_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `admin_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_login_log` ADD CONSTRAINT `admin_login_log_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `admin_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

