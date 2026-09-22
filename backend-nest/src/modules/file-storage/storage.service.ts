/**
 * 存储抽象服务
 * 对外只暴露 4 个能力：uploadBuffer / uploadFile / delete / resolveUrl，
 * 具体实现由 local 或 minio 驱动提供（STORAGE_DRIVER 决定），业务代码不感知底层差异。
 *
 * 约定：入库的地址是「可访问地址」——local 驱动返回站内相对地址（/static/uploads/...），
 * minio 驱动返回对象访问绝对地址；需要绝对地址时统一调用 resolveUrl。
 */
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { resolve, sep } from 'node:path'
import type { AppConfiguration } from '../../config/configuration'
import { LOCAL_STORAGE_DIR, STATIC_URL_PREFIX } from '../../common/constants/storage.constants'

/** 上传结果 */
export interface StoredObject {
  /** 可访问地址（local：站内相对地址；minio：绝对地址） */
  url: string
  /** 相对路径（category/yyyy/MM/xxx.ext），用于后续删除 */
  relativePath: string
  /** 字节大小 */
  size: number
  /** 归一化后的 MIME */
  mimeType: string
}

export abstract class StorageService {
  protected readonly logger = new Logger(StorageService.name)

  constructor(protected readonly configService: ConfigService<AppConfiguration, true>) {}

  /** 后端对外可访问地址（用于拼接绝对地址，去掉了结尾斜杠） */
  protected get publicBaseUrl(): string {
    return this.configService.get('publicBaseUrl', { infer: true })
  }

  /** 本地上传目录绝对路径（backend-nest/storage/uploads） */
  protected get uploadRoot(): string {
    return this.configService.get('uploadRoot', { infer: true })
  }

  /** 驱动名称（用于日志与诊断） */
  abstract readonly driver: string

  /**
   * 保存内存缓冲区
   * @param buffer 文件内容
   * @param originalName 原始文件名（只用于取扩展名，最终文件名随机化）
   * @param category 业务分类目录，例如 article-image / video-frame
   */
  abstract uploadBuffer(buffer: Buffer, originalName: string, category: string): Promise<StoredObject>

  /**
   * 保存磁盘上的文件（大文件上传：分片合并后的成品、本地已存在的产物）
   * @param absPath 源文件绝对路径
   */
  abstract uploadFile(absPath: string, originalName: string, category: string): Promise<StoredObject>

  /** 删除对象（传入入库时的地址） */
  abstract delete(url: string): Promise<void>

  /** 相对地址 -> 可访问绝对地址（已是绝对地址时原样返回） */
  resolveUrl(relPath: string): string {
    if (!relPath) return ''
    if (/^https?:\/\//i.test(relPath) || relPath.startsWith('//')) return relPath
    const normalized = relPath.startsWith('/') ? relPath : `/${relPath}`
    return `${this.publicBaseUrl}${normalized}`
  }

  /**
   * 把「站内相对地址」解析为本地磁盘绝对路径
   * 用于本地视频抽帧、删除文件等场景；越界路径或非本地驱动返回 null（由调用方决定降级策略）。
   */
  resolveLocalPath(url: string): string | null {
    if (!url) return null
    let pathname = url
    if (/^https?:\/\//i.test(url)) {
      try {
        pathname = new URL(url).pathname
      } catch {
        return null
      }
    }
    if (!pathname.startsWith(STATIC_URL_PREFIX)) return null

    const relative = decodeURIComponent(pathname.slice(STATIC_URL_PREFIX.length)).replace(/^[/\\]+/, '')
    if (relative === '') return null

    const absolute = resolve(this.uploadRoot, relative)
    // 防止 ../ 穿越到上传目录之外
    const rootWithSep = this.uploadRoot.endsWith(sep) ? this.uploadRoot : `${this.uploadRoot}${sep}`
    if (!absolute.startsWith(rootWithSep)) return null
    return absolute
  }

  /** 相对路径 -> 站内访问地址 */
  protected buildStaticUrl(relativePath: string): string {
    return `${STATIC_URL_PREFIX}/${relativePath.split(sep).join('/')}`
  }

  /** 本地驱动使用的相对目录名（配置项便于容器化时挂载） */
  protected get localRelativeRoot(): string {
    return LOCAL_STORAGE_DIR
  }
}
