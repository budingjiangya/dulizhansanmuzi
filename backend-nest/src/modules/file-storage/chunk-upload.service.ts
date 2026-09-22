/**
 * 分片上传服务
 * 会话设计：
 * 1. 会话信息（fileName / fileSize / chunkSize / totalChunks / mimeType）保存在 Redis，
 *    已完成分片序号保存在 Redis Set，支持断点续传；
 * 2. 分片文件本身落在本地磁盘（storage/uploads/chunk-temp/<uploadId>/<index>.part），
 *    Redis 不可用时改为扫描磁盘目录推断已上传分片，功能不降级；
 * 3. 秒传：文件 hash 合并过一次后记录 <CHUNK_FINISHED_KEY>:<hash>，再次 init 直接返回地址；
 * 4. 合并：按序号顺序拼接 -> 写入对象存储 -> ffprobe 探测 -> 随机抽帧 -> 清理临时分片。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  CHUNK_FINISHED_KEY,
  CHUNK_SESSION_KEY,
} from '../../common/constants/cache.constants'
import { UPLOAD_CATEGORY } from '../../common/constants/storage.constants'
import { BizException } from '../../common/exceptions/biz.exception'
import { validateUploadFile } from '../../common/utils/file.util'
import type { AppConfiguration } from '../../config/configuration'
import { RedisService } from '../../redis/redis.service'
import { StorageService } from './storage.service'
import { VideoService } from './video.service'
import type { ChunkInitDto } from './dto/chunk-init.dto'
import type { ChunkInitVo, UploadedVideoVo } from '@sanmuzi/contracts'

/** Redis 中保存的会话结构 */
interface ChunkSession {
  uploadId: string
  fileHash: string
  fileName: string
  fileSize: number
  chunkSize: number
  totalChunks: number
  mimeType: string
  createdAt: string
}

/** 合并结果（供秒传复用） */
interface FinishedFile {
  file: UploadedVideoVo
  originalName: string
  finishedAt: string
}

/** 会话有效期：24 小时 */
const SESSION_TTL_SECONDS = 24 * 60 * 60
/** 秒传记录有效期：7 天 */
const FINISHED_TTL_SECONDS = 7 * 24 * 60 * 60
/** 单个分片上限（1GB），防止异常请求写爆磁盘 */
const MAX_CHUNK_BYTES = 1024 * 1024 * 1024

@Injectable()
export class ChunkUploadService {
  private readonly logger = new Logger(ChunkUploadService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly videoService: VideoService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  /** 分片临时目录根路径 */
  private get chunkRoot(): string {
    const uploadRoot = this.configService.get('uploadRoot', { infer: true })
    return resolve(uploadRoot, UPLOAD_CATEGORY.CHUNK_TEMP)
  }

  /** 初始化上传：秒传命中直接返回，未命中则返回已上传分片用于断点续传 */
  async init(dto: ChunkInitDto): Promise<ChunkInitVo> {
    const fileHash = dto.fileHash.trim()
    const mimeType = dto.mimeType ?? 'video/mp4'

    // 文件类型白名单校验（扩展名 + 声明 MIME）
    const validation = validateUploadFile('video', dto.fileName, dto.mimeType)
    if (!validation.ok) throw BizException.paramInvalid(validation.reason)

    // 1. 秒传：该文件此前已合并完成
    const finished = await this.redis.getJson<FinishedFile>(this.finishedKey(fileHash))
    if (finished) {
      this.logger.log(`秒传命中：${dto.fileName}（${fileHash}）`)
      return {
        uploadId: `instant-${fileHash.slice(0, 12)}`,
        fileHash,
        uploadedChunks: [],
        instant: true,
        file: finished.file,
      }
    }

    // 2. 复用未完成会话，否则新建
    let session = await this.redis.getJson<ChunkSession>(this.sessionKey(dto.fileHash))
    if (session && session.totalChunks !== dto.totalChunks) {
      // 分片总数变化说明前端换了分片策略，旧会话作废
      await this.destroySession(session.uploadId)
      session = null
    }

    if (!session) {
      const uploadId = randomUUID()
      session = {
        uploadId,
        fileHash,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        chunkSize: dto.chunkSize,
        totalChunks: dto.totalChunks,
        mimeType,
        createdAt: new Date().toISOString(),
      }
      await this.persistSession(session)
      this.logger.log(`分片上传会话已创建：${uploadId}（${dto.fileName}，${dto.totalChunks} 片）`)
    }

    const uploadedChunks = await this.listUploadedChunks(session)
    return { uploadId: session.uploadId, fileHash, uploadedChunks, instant: false, file: null }
  }

  /** 接收单个分片 */
  async savePart(
    uploadId: string,
    chunkIndex: number,
    file?: Express.Multer.File,
  ): Promise<{ uploadId: string; chunkIndex: number; received: number }> {
    if (!file?.buffer && !file?.path) throw BizException.paramInvalid('缺少分片文件内容（字段名应为 file）')
    if (file.size === 0) throw BizException.paramInvalid('分片内容为空')
    if (file.size > MAX_CHUNK_BYTES) throw BizException.paramInvalid('单个分片超过大小上限')

    const session = await this.requireSessionById(uploadId)
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw BizException.paramInvalid(`分片序号越界，应在 0 - ${session.totalChunks - 1} 之间`)
    }

    const targetDir = join(this.chunkRoot, session.uploadId)
    await mkdir(targetDir, { recursive: true })
    const targetPath = join(targetDir, `${chunkIndex}.part`)

    if (file.buffer && file.buffer.length > 0) {
      await writeFile(targetPath, file.buffer)
    } else if (file.path) {
      await pipeline(createReadStream(file.path), createWriteStream(targetPath))
      await rm(file.path, { force: true })
    } else {
      throw BizException.paramInvalid('分片内容不可读')
    }

    // 分片序号写 Redis Set（Redis 不可用时依赖磁盘扫描，不影响正确性）
    await this.redis.addToSet(this.partsKey(session.uploadId), String(chunkIndex))
    await this.persistSession(session)

    const received = (await stat(targetPath)).size
    this.logger.log(`分片已接收：${uploadId} #${chunkIndex}（${received} 字节）`)
    return { uploadId: session.uploadId, chunkIndex, received }
  }

  /** 合并分片 -> 对象存储 -> 探测 + 抽帧 */
  async merge(uploadId: string): Promise<UploadedVideoVo> {
    const session = await this.requireSessionById(uploadId)

    // 合并产物在本地临时目录先落地，再交给存储驱动归档
    const mergedDir = join(this.chunkRoot, 'merged')
    await mkdir(mergedDir, { recursive: true })
    const mergedPath = join(mergedDir, `${session.uploadId}${this.resolveExtension(session.fileName)}`)

    const uploaded = await this.listUploadedChunks(session)
    const uploadedSet = new Set(uploaded)
    const missing: number[] = []
    for (let index = 0; index < session.totalChunks; index += 1) {
      if (!uploadedSet.has(index)) missing.push(index)
    }
    if (missing.length > 0) {
      throw BizException.conflict(`还有 ${missing.length} 个分片未上传：${missing.slice(0, 10).join(', ')}`)
    }

    try {
      await this.concatChunks(session, mergedPath)
    } catch (error) {
      await rm(mergedPath, { force: true }).catch(() => undefined)
      throw BizException.serverError(`分片合并失败：${error instanceof Error ? error.message : String(error)}`)
    }

    const mergedStat = await stat(mergedPath)
    if (mergedStat.size === 0) {
      await rm(mergedPath, { force: true }).catch(() => undefined)
      throw BizException.serverError('合并后的文件为空，请重新上传')
    }

    // 归档到对象存储
    const stored = await this.storage.uploadFile(mergedPath, session.fileName, UPLOAD_CATEGORY.ARTICLE_VIDEO)
    // 探测 + 随机抽帧（失败只降级为 null，不影响上传成功）
    const video = await this.videoService.finalizeVideo(stored, session.fileName)

    // 记录秒传映射并发起清理
    await this.redis.setJson(
      this.finishedKey(session.fileHash),
      { file: video, originalName: session.fileName, finishedAt: new Date().toISOString() } satisfies FinishedFile,
      FINISHED_TTL_SECONDS,
    )
    await this.cleanup(session.uploadId, mergedPath, session.fileHash)

    this.logger.log(
      `分片合并完成：${session.fileName} -> ${video.url}（时长 ${video.duration ?? '未知'}s，封面 ${video.coverVideoFrame ?? '无'}）`,
    )
    return video
  }

  /* ------------------------------------------------------------------ *
   * 内部工具
   * ------------------------------------------------------------------ */

  private sessionKey(fileHash: string): string {
    return `${CHUNK_SESSION_KEY}:hash:${fileHash}`
  }

  private sessionByIdKey(uploadId: string): string {
    return `${CHUNK_SESSION_KEY}:id:${uploadId}`
  }

  private partsKey(uploadId: string): string {
    return `${CHUNK_SESSION_KEY}:parts:${uploadId}`
  }

  private finishedKey(fileHash: string): string {
    return `${CHUNK_FINISHED_KEY}:${fileHash}`
  }

  /** 通过 uploadId 取会话（Redis 不可用时回退到磁盘 meta.json） */
  private async requireSessionById(uploadId: string): Promise<ChunkSession> {
    if (!uploadId || uploadId.trim() === '') throw BizException.paramInvalid('uploadId 不能为空')
    const id = uploadId.trim()

    const session = await this.redis.getJson<ChunkSession>(this.sessionByIdKey(id))
    if (session) return session

    const metaPath = join(this.chunkRoot, id, 'meta.json')
    if (existsSync(metaPath)) {
      try {
        return JSON.parse(await readFile(metaPath, 'utf8')) as ChunkSession
      } catch {
        throw BizException.notFound('分片上传会话已失效，请重新初始化上传')
      }
    }
    throw BizException.notFound('分片上传会话不存在或已过期，请重新初始化上传')
  }

  /** 维护 Redis 双向映射与磁盘 meta，保证 Redis 抖动后仍可续传 */
  private async persistSession(session: ChunkSession): Promise<void> {
    await this.redis.setJson(this.sessionKey(session.fileHash), session, SESSION_TTL_SECONDS)
    await this.redis.setJson(this.sessionByIdKey(session.uploadId), session, SESSION_TTL_SECONDS)
    const dir = join(this.chunkRoot, session.uploadId)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'meta.json'), JSON.stringify(session, null, 2), 'utf8')
  }

  /** 列出已上传完成的分片序号（Redis Set 与磁盘目录取并集） */
  private async listUploadedChunks(session: ChunkSession): Promise<number[]> {
    const result = new Set<number>()
    const fromRedis = await this.redis.getSetMembers(this.partsKey(session.uploadId))
    for (const item of fromRedis) {
      const index = Number(item)
      if (Number.isInteger(index) && index >= 0 && index < session.totalChunks) result.add(index)
    }

    const dir = join(this.chunkRoot, session.uploadId)
    if (existsSync(dir)) {
      const entries = await readdir(dir)
      for (const entry of entries) {
        const matched = /^(\d+)\.part$/.exec(entry)
        if (!matched) continue
        const index = Number(matched[1])
        if (Number.isInteger(index) && index >= 0 && index < session.totalChunks) result.add(index)
      }
    }
    return Array.from(result).sort((left, right) => left - right)
  }

  /** 按序号顺序拼接分片 */
  private async concatChunks(session: ChunkSession, mergedPath: string): Promise<void> {
    await rm(mergedPath, { force: true })
    const output = createWriteStream(mergedPath)
    const dir = join(this.chunkRoot, session.uploadId)
    try {
      for (let index = 0; index < session.totalChunks; index += 1) {
        const partPath = join(dir, `${index}.part`)
        if (!existsSync(partPath)) throw new Error(`缺少分片 ${index}`)
        await pipeline(createReadStream(partPath), output, { end: false })
      }
    } finally {
      await new Promise<void>((resolveClose) => output.end(() => resolveClose()))
    }
  }

  /** 清理分片临时文件、会话记录与合并中间产物 */
  private async cleanup(uploadId: string, mergedPath: string, fileHash: string): Promise<void> {
    await rm(join(this.chunkRoot, uploadId), { recursive: true, force: true }).catch(() => undefined)
    await rm(mergedPath, { force: true }).catch(() => undefined)
    await this.redis.del(this.sessionByIdKey(uploadId), this.partsKey(uploadId), this.sessionKey(fileHash))
  }

  /** 作废一个会话 */
  private async destroySession(uploadId: string): Promise<void> {
    await rm(join(this.chunkRoot, uploadId), { recursive: true, force: true }).catch(() => undefined)
    await this.redis.del(this.sessionByIdKey(uploadId), this.partsKey(uploadId))
  }

  /** 取原始扩展名（用于合并产物命名），缺省 .mp4 */
  private resolveExtension(fileName: string): string {
    const matched = /\.[A-Za-z0-9]+$/.exec(fileName)
    return matched ? matched[0].toLowerCase() : '.mp4'
  }
}
