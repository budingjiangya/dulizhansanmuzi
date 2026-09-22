/**
 * 视频处理服务
 * 职责：
 * 1. 小视频直传：落盘到对象存储 + ffprobe 读取时长/分辨率 + 随机抽帧生成静态封面；
 * 2. 抽帧：指定时间点或随机时间点，产物同样存入对象存储；
 * 3. 合并后的视频统一走 @see finalizeVideo 完成探测与封面生成。
 * 约定：ffprobe/ffmpeg 失败不抛 500，返回 duration/resolution/封面为 null，由前端提示重试。
 */
import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtractFrameVo, UploadedVideoVo } from '@sanmuzi/contracts'
import { UPLOAD_CATEGORY } from '../../common/constants/storage.constants'
import { BizException } from '../../common/exceptions/biz.exception'
import {
  extractFrameAt,
  pickRandomFrameTime,
  probeVideo,
  roundTo,
  type ExtractFrameResult,
  type VideoProbeInfo,
} from '../../common/utils/ffmpeg.util'
import { StorageService, type StoredObject } from './storage.service'

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name)

  constructor(private readonly storage: StorageService) {}

  /**
   * 小视频直传落盘
   * @param absPath 临时文件绝对路径（multer 写入）
   * @param originalName 原始文件名
   */
  async uploadVideoFromPath(absPath: string, originalName: string): Promise<UploadedVideoVo> {
    const stored = await this.storage.uploadFile(absPath, originalName, UPLOAD_CATEGORY.ARTICLE_VIDEO)
    return this.finalizeVideo(stored, originalName)
  }

  /** 视频已入库后补齐探测信息与随机抽帧封面 */
  async finalizeVideo(stored: StoredObject, originalName: string): Promise<UploadedVideoVo> {
    const localPath = this.storage.resolveLocalPath(stored.url)
    if (!localPath) {
      this.logger.warn(`视频 ${stored.url} 无法在本地解析，跳过 ffprobe 探测与抽帧`)
      return {
        url: stored.url,
        originalName,
        size: stored.size,
        mimeType: stored.mimeType,
        duration: null,
        resolution: null,
        coverVideoFrame: null,
        frameTime: null,
      }
    }

    const probe = probeVideo(localPath)
    if (probe.duration === null) {
      this.logger.warn(`ffprobe 未能读取视频时长：${stored.url}`)
    }

    const frame = await this.extractAndStoreFrame(localPath, probe.duration)
    if (!frame.ok) this.logger.warn(`随机抽帧失败（${stored.url}）：${frame.error}`)

    return {
      url: stored.url,
      originalName,
      size: stored.size,
      mimeType: stored.mimeType,
      duration: probe.duration,
      resolution: probe.resolution,
      coverVideoFrame: frame.ok ? frame.coverVideoFrame : null,
      frameTime: frame.ok ? frame.frameTime : null,
    }
  }

  /**
   * 对一个已上传视频重新抽帧
   * @param videoUrl 站内相对地址（/static/uploads/...）
   * @param time 指定时间点（秒）；不传则由后端随机
   */
  async extractFrame(videoUrl: string, time?: number): Promise<ExtractFrameVo> {
    const localPath = this.storage.resolveLocalPath(videoUrl)
    if (!localPath || !existsSync(localPath)) {
      throw BizException.notFound('视频文件不存在或不是站内本地资源，无法抽帧')
    }

    const probe = probeVideo(localPath)
    if (probe.duration === null) {
      this.logger.warn(`ffprobe 未能读取视频时长，随机抽帧将退化为 0.5 秒：${videoUrl}`)
    }

    const frameTime =
      time === undefined || !Number.isFinite(time) || time < 0
        ? pickRandomFrameTime(probe.duration)
        : roundTo(time, 2)

    const result = await this.extractAndStoreFrame(localPath, probe.duration, frameTime)
    if (!result.ok) throw BizException.serverError(`抽帧失败：${result.error}`)

    return {
      coverVideoFrame: result.coverVideoFrame,
      frameTime: result.frameTime,
      duration: probe.duration ?? 0,
    }
  }

  /** 探测视频信息（供分片合并等场景复用） */
  probeByUrl(videoUrl: string): VideoProbeInfo {
    const localPath = this.storage.resolveLocalPath(videoUrl)
    if (!localPath || !existsSync(localPath)) {
      return { duration: null, resolution: null, videoCodec: null, width: null, height: null }
    }
    return probeVideo(localPath)
  }

  /**
   * 抽帧并把产物写入对象存储
   * @param frameTime 不传则由随机逻辑决定
   */
  private async extractAndStoreFrame(
    localPath: string,
    duration: number | null,
    frameTime?: number,
  ): Promise<{ ok: true; coverVideoFrame: string; frameTime: number } | { ok: false; error: string }> {
    const targetTime = frameTime ?? pickRandomFrameTime(duration)
    const tempPath = join(tmpdir(), `sanmuzi-frame-${randomUUID()}.jpg`)

    let result: ExtractFrameResult
    try {
      result = extractFrameAt(localPath, targetTime, tempPath)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    if (!result.ok || !existsSync(result.framePath)) {
      return { ok: false, error: result.error || '未产出封面文件' }
    }

    try {
      const stored = await this.storage.uploadFile(result.framePath, `frame-${result.frameTime}.jpg`, UPLOAD_CATEGORY.VIDEO_FRAME)
      return { ok: true, coverVideoFrame: stored.url, frameTime: result.frameTime }
    } catch (error) {
      return { ok: false, error: `封面写存储失败：${error instanceof Error ? error.message : String(error)}` }
    } finally {
      // 清理系统临时目录中的抽帧产物
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  }
}
