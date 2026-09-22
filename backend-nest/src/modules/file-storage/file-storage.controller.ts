/**
 * 文件上传控制器
 * 路由前缀 /admin/files，权限码统一为 blog:article:upload。
 * 上传形态：
 * 1. 图片：multer 内存存储，校验扩展名/MIME/魔数后写入对象存储；
 * 2. 小视频直传：multer 磁盘存储 + ffprobe 探测 + 随机抽帧封面；
 * 3. 大视频分片：init -> part × N -> merge（分片会话记录在 Redis，支持断点续传与秒传）；
 * 4. 单独抽帧：对已上传视频按指定/随机时间点重新生成静态封面。
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { diskStorage } from 'multer'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PERMISSIONS,
  type ChunkInitVo,
  type ChunkPartVo,
  type ExtractFrameVo,
  type UploadedFileVo,
  type UploadedVideoVo,
} from '@sanmuzi/contracts'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { UPLOAD_CATEGORY } from '../../common/constants/storage.constants'
import { BizException } from '../../common/exceptions/biz.exception'
import { validateUploadFile } from '../../common/utils/file.util'
import type { AppConfiguration } from '../../config/configuration'
import { UPLOAD_TMP_ROOT } from '../../config/configuration'
import { ChunkUploadService } from './chunk-upload.service'
import { ChunkInitDto } from './dto/chunk-init.dto'
import { ChunkMergeDto } from './dto/chunk-merge.dto'
import { ExtractFrameDto } from './dto/extract-frame.dto'
import { StorageService } from './storage.service'
import { VideoService } from './video.service'

/** 上传大小上限（与 .env 默认值一致；装饰器选项在模块加载阶段求值，无法注入配置） */
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024
const MAX_CHUNK_SIZE_BYTES = 8 * 1024 * 1024

@ApiTags('文件与视频')
@ApiBearerAuth()
@Controller('admin/files')
export class FileStorageController {
  private readonly logger = new Logger(FileStorageController.name)

  constructor(
    private readonly storage: StorageService,
    private readonly videoService: VideoService,
    private readonly chunkUploadService: ChunkUploadService,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {}

  @Post('image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '图片文件，字段名 file',
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: '上传图片', description: '支持 jpg/jpeg/png/gif/webp，返回站内可访问地址。' })
  @ApiOkResponse({ description: 'UploadedFileVo' })
  async uploadImage(@UploadedFile() file?: Express.Multer.File): Promise<UploadedFileVo> {
    if (!file) throw BizException.paramInvalid('未接收到文件，请使用字段名 file 上传')

    const maxSize = this.configService.get('maxImageSize', { infer: true })
    if (file.size > maxSize) {
      throw BizException.paramInvalid(`图片大小超过上限 ${Math.round(maxSize / 1024 / 1024)}MB`)
    }

    const validation = validateUploadFile('image', file.originalname, file.mimetype, file.buffer)
    if (!validation.ok) throw BizException.paramInvalid(validation.reason)

    const stored = await this.storage.uploadBuffer(file.buffer, file.originalname, UPLOAD_CATEGORY.ARTICLE_IMAGE)
    return {
      url: stored.url,
      originalName: file.originalname,
      size: stored.size,
      mimeType: stored.mimeType,
    }
  }

  @Post('video')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // 注意：装饰器选项在模块加载阶段求值，这里只使用静态常量（不能用 this.configService）
        destination: UPLOAD_TMP_ROOT,
        filename: (_req, file, callback) => {
          const extension = /\.[A-Za-z0-9]+$/.exec(file.originalname)?.[0] ?? '.mp4'
          callback(null, `sanmuzi-upload-${randomUUID()}${extension}`)
        },
      }),
      limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '视频文件，字段名 file',
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({
    summary: '小视频直传',
    description: '支持 mp4/webm/mov/m4v；返回 ffprobe 时长、分辨率与随机抽帧静态封面（抽帧失败返回 null）。',
  })
  @ApiOkResponse({ description: 'UploadedVideoVo' })
  async uploadVideo(@UploadedFile() file?: Express.Multer.File): Promise<UploadedVideoVo> {
    if (!file) throw BizException.paramInvalid('未接收到文件，请使用字段名 file 上传')
    const tempPath = file.path
    if (!tempPath) throw BizException.paramInvalid('视频临时文件写入失败，请重试')

    const maxSize = this.configService.get('maxVideoSize', { infer: true })
    if (file.size > maxSize) {
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw BizException.paramInvalid(`视频大小超过上限 ${Math.round(maxSize / 1024 / 1024)}MB，请使用分片上传`)
    }

    const validation = validateUploadFile('video', file.originalname, file.mimetype)
    if (!validation.ok) {
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw BizException.paramInvalid(validation.reason)
    }

    try {
      return await this.videoService.uploadVideoFromPath(tempPath, file.originalname)
    } finally {
      // 临时文件已归档到对象存储，这里清理上传临时目录
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  }

  @Post('video/chunk/init')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @ApiOperation({
    summary: '分片上传初始化',
    description: '返回 uploadId 与已上传分片序号（断点续传）；该 fileHash 此前合并过则 instant=true 并直接返回地址（秒传）。',
  })
  @ApiBody({ type: ChunkInitDto })
  @ApiOkResponse({ description: 'ChunkInitVo' })
  async chunkInit(@Body() dto: ChunkInitDto): Promise<ChunkInitVo> {
    return this.chunkUploadService.init(dto)
  }

  @Post('video/chunk/part')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @UseInterceptors(
    FilesInterceptor('file', 1, {
      limits: { fileSize: MAX_CHUNK_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '分片文件，表单字段：uploadId、chunkIndex、file',
    schema: {
      type: 'object',
      properties: {
        uploadId: { type: 'string', description: '分片上传会话 ID' },
        chunkIndex: { type: 'integer', description: '分片序号，从 0 开始' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: '上传单个分片', description: 'multipart 表单字段：uploadId、chunkIndex、file。' })
  @ApiOkResponse({ description: 'ChunkPartVo' })
  async chunkPart(
    @Body('uploadId') uploadId: string,
    @Body('chunkIndex') chunkIndex: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<ChunkPartVo> {
    const maxChunkSize = this.configService.get('maxChunkSize', { infer: true })
    const file = files?.[0]
    if (file && file.size > maxChunkSize) {
      throw BizException.paramInvalid(`分片大小超过上限 ${Math.round(maxChunkSize / 1024 / 1024)}MB`)
    }
    const index = Number(chunkIndex)
    if (!Number.isInteger(index)) throw BizException.paramInvalid('chunkIndex 必须是整数')
    return this.chunkUploadService.savePart(uploadId, index, file)
  }

  @Post('video/chunk/merge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @ApiOperation({
    summary: '合并分片',
    description: '按序号顺序合并全部分片 -> 写入对象存储 -> ffprobe 探测 -> 随机抽帧，返回 UploadedVideoVo。',
  })
  @ApiBody({ type: ChunkMergeDto })
  @ApiOkResponse({ description: 'UploadedVideoVo' })
  @ApiResponse({ status: 409, description: '仍有分片未上传（40900）' })
  async chunkMerge(@Body() dto: ChunkMergeDto): Promise<UploadedVideoVo> {
    return this.chunkUploadService.merge(dto.uploadId)
  }

  @Post('video/frame')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BLOG_ARTICLE_UPLOAD)
  @ApiOperation({
    summary: '视频抽帧',
    description: '对已上传的站内视频按指定时间点抽帧；不传 time 则在 (0, duration-1] 内随机取点。',
  })
  @ApiBody({ type: ExtractFrameDto })
  @ApiOkResponse({ description: 'ExtractFrameVo' })
  @ApiResponse({ status: 404, description: '视频文件不存在（40400）' })
  async extractFrame(@Body() dto: ExtractFrameDto): Promise<ExtractFrameVo> {
    return this.videoService.extractFrame(dto.videoUrl, dto.time)
  }
}
