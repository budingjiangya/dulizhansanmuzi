/**
 * MinIO 对象存储驱动（STORAGE_DRIVER=minio 时启用）
 * - 对象命名与本地驱动保持一致：<category>/<yyyy>/<MM>/<random>.<ext>
 * - 服务端不可用时抛出明确错误（不静默失败），由上层转换为 50000 业务异常；
 * - 启动时确保 bucket 存在，并尽力把读权限设为 public，便于前台直接访问。
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from 'minio'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import { STORAGE_DRIVER } from '../../common/constants/storage.constants'
import { buildStorageRelativePath, getExtension } from '../../common/utils/file.util'
import type { AppConfiguration } from '../../config/configuration'
import { StorageService, type StoredObject } from './storage.service'

@Injectable()
export class MinioStorageProvider extends StorageService {
  readonly driver = STORAGE_DRIVER.MINIO
  private readonly client: Client
  private readonly bucket: string

  constructor(configService: ConfigService<AppConfiguration, true>) {
    super(configService)
    const minio = configService.get('minio', { infer: true })
    this.bucket = minio.bucket
    this.client = new Client({
      endPoint: minio.endPoint,
      port: minio.port,
      useSSL: minio.useSSL,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey,
    })
  }

  /** 启动时确保 bucket 存在（失败抛出明确错误） */
  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket)
      if (!exists) {
        await this.client.makeBucket(this.bucket)
        this.logger.log(`MinIO bucket 已创建：${this.bucket}`)
      }
      // 尽力设置公共读策略：失败不影响上传能力，仅记录告警
      try {
        await this.client.setBucketPolicy(
          this.bucket,
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${this.bucket}/*`],
              },
            ],
          }),
        )
      } catch (policyError) {
        this.logger.warn(
          `MinIO bucket 公共读策略设置失败（对象将保持私有，需自行配置访问策略）：${
            policyError instanceof Error ? policyError.message : String(policyError)
          }`,
        )
      }
    } catch (error) {
      throw new Error(
        `MinIO 服务不可用（${this.publicBaseUrl} -> ${this.bucket}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /** 保存内存缓冲区 */
  async uploadBuffer(buffer: Buffer, originalName: string, category: string): Promise<StoredObject> {
    const { relativePath } = buildStorageRelativePath(category, originalName)
    const mimeType = this.resolveMimeType(originalName)
    try {
      await this.client.putObject(this.bucket, relativePath, buffer, buffer.length, {
        'Content-Type': mimeType,
      })
    } catch (error) {
      throw new Error(
        `MinIO 上传失败（${relativePath}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.logger.log(`MinIO 上传成功：${relativePath}（${buffer.length} 字节）`)
    return { url: this.buildStaticUrl(relativePath), relativePath, size: buffer.length, mimeType }
  }

  /** 保存磁盘文件（流式上传，避免大文件占内存） */
  async uploadFile(absPath: string, originalName: string, category: string): Promise<StoredObject> {
    const { relativePath } = buildStorageRelativePath(category, originalName)
    const mimeType = this.resolveMimeType(originalName)
    const fileStat = await stat(absPath)
    try {
      const stream: Readable = createReadStream(absPath)
      await this.client.putObject(this.bucket, relativePath, stream, fileStat.size, {
        'Content-Type': mimeType,
      })
    } catch (error) {
      throw new Error(
        `MinIO 上传失败（${relativePath}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.logger.log(`MinIO 上传成功：${relativePath}（${fileStat.size} 字节）`)
    return { url: this.buildStaticUrl(relativePath), relativePath, size: fileStat.size, mimeType }
  }

  /** 删除对象 */
  async delete(url: string): Promise<void> {
    const objectName = this.resolveObjectName(url)
    if (!objectName) {
      this.logger.warn(`跳过删除：无法解析对象名 ${url}`)
      return
    }
    try {
      await this.client.removeObject(this.bucket, objectName)
      this.logger.log(`MinIO 对象已删除：${objectName}`)
    } catch (error) {
      throw new Error(
        `MinIO 删除失败（${objectName}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /** 从访问地址还原对象名 */
  private resolveObjectName(url: string): string | null {
    if (!url) return null
    const withoutPrefix = url.replace(/^https?:\/\/[^/]+/i, '')
    const cleaned = withoutPrefix.replace(/^\/+/, '')
    const marker = `${this.bucket}/`
    const objectName = cleaned.startsWith(marker) ? cleaned.slice(marker.length) : cleaned
    return objectName === '' ? null : objectName
  }

  /** 依据扩展名推断 MIME */
  private resolveMimeType(originalName: string): string {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
    }
    return map[getExtension(originalName)] ?? 'application/octet-stream'
  }
}
