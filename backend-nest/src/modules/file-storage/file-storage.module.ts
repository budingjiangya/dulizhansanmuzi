/**
 * 文件存储模块
 * 通过 STORAGE_DRIVER 决定注入哪个存储实现；对外导出 StorageService 与 VideoService，
 * 业务模块（文章、种子脚本等）只依赖抽象，不感知 local / minio 差异。
 */
import { Module, type Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { STORAGE_DRIVER, STORAGE_DRIVER_TOKEN } from '../../common/constants/storage.constants'
import type { AppConfiguration } from '../../config/configuration'
import { ChunkUploadService } from './chunk-upload.service'
import { FileStorageController } from './file-storage.controller'
import { LocalStorageProvider } from './local-storage.provider'
import { MinioStorageProvider } from './minio-storage.provider'
import { StorageService } from './storage.service'
import { VideoService } from './video.service'

/** 按配置选择存储驱动实现 */
const storageProvider: Provider = {
  provide: STORAGE_DRIVER_TOKEN,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<AppConfiguration, true>): StorageService => {
    const driver = configService.get('storageDriver', { infer: true })
    return driver === STORAGE_DRIVER.MINIO
      ? new MinioStorageProvider(configService)
      : new LocalStorageProvider(configService)
  },
}

/** 把驱动的公开方法暴露为 StorageService 抽象 */
const storageAlias: Provider = {
  provide: StorageService,
  inject: [STORAGE_DRIVER_TOKEN],
  useFactory: (provider: StorageService): StorageService => provider,
}

@Module({
  controllers: [FileStorageController],
  providers: [storageProvider, storageAlias, VideoService, ChunkUploadService],
  exports: [StorageService, VideoService, ChunkUploadService],
})
export class FileStorageModule {}
