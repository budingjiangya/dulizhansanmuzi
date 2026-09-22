/**
 * 本地磁盘存储驱动（默认）
 * 落盘规则：backend-nest/storage/uploads/<category>/<yyyy>/<MM>/<random>.<ext>
 * 访问地址：/static/uploads/<category>/<yyyy>/<MM>/<random>.<ext>（由 ServeStaticModule 托管）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { STORAGE_DRIVER, resolveMimeByExtension } from '../../common/constants/storage.constants'
import { buildStorageRelativePath, getExtension } from '../../common/utils/file.util'
import type { AppConfiguration } from '../../config/configuration'
import { StorageService, type StoredObject } from './storage.service'

@Injectable()
export class LocalStorageProvider extends StorageService {
  readonly driver = STORAGE_DRIVER.LOCAL

  constructor(configService: ConfigService<AppConfiguration, true>) {
    super(configService)
  }

  /** 保存内存缓冲区 */
  async uploadBuffer(buffer: Buffer, originalName: string, category: string): Promise<StoredObject> {
    const { relativePath } = buildStorageRelativePath(category, originalName)
    const absolutePath = resolve(this.uploadRoot, relativePath)

    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, buffer)

    const url = this.buildStaticUrl(relativePath)
    this.logger.log(`本地存储写入成功：${url}（${buffer.length} 字节）`)
    return {
      url,
      relativePath,
      size: buffer.length,
      mimeType: resolveMimeByExtension(getExtension(originalName)),
    }
  }

  /** 保存磁盘文件（大文件直传与分片合并后的成品） */
  async uploadFile(absPath: string, originalName: string, category: string): Promise<StoredObject> {
    const { relativePath } = buildStorageRelativePath(category, originalName)
    const targetPath = resolve(this.uploadRoot, relativePath)

    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(absPath, targetPath)

    const fileStat = await stat(targetPath)
    const url = this.buildStaticUrl(relativePath)
    this.logger.log(`本地存储写入成功：${url}（${fileStat.size} 字节）`)
    return {
      url,
      relativePath,
      size: fileStat.size,
      mimeType: resolveMimeByExtension(getExtension(originalName)),
    }
  }

  /** 删除对象（仅允许删除上传目录内的文件） */
  async delete(url: string): Promise<void> {
    const absolutePath = this.resolveLocalPath(url)
    if (!absolutePath) {
      this.logger.warn(`跳过删除：无法解析为本地文件地址 ${url}`)
      return
    }
    try {
      await rm(absolutePath, { force: true })
      this.logger.log(`本地文件已删除：${url}`)
    } catch (error) {
      this.logger.warn(`删除本地文件失败：${url}（${error instanceof Error ? error.message : String(error)}）`)
    }
  }

  /** 确保上传根目录存在（启动时调用） */
  async ensureRoot(): Promise<string> {
    await mkdir(this.uploadRoot, { recursive: true })
    this.logger.log(`本地上传目录已就绪：${this.uploadRoot}`)
    return this.uploadRoot
  }
}
