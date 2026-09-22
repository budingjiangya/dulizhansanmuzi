/**
 * 文件工具：扩展名/MIME 校验、按日期生成存储相对路径、文件名随机化
 * 设计要点：
 * 1. 文件名一律随机化，杜绝用户原始文件名带来的路径穿越与中文编码问题；
 * 2. 目录按 category/yyyy/MM 分层，避免单目录文件过多；
 * 3. 除了扩展名与 MIME，还做「魔数」嗅探，防止改后缀上传非法文件。
 */
import { randomBytes } from 'node:crypto'
import { extname } from 'node:path'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  EXTENSION_MIME_MAP,
  RANDOM_NAME_LENGTH,
} from '../constants/storage.constants'

/** 文件业务类型 */
export type UploadKind = 'image' | 'video'

/** 校验结果 */
export interface FileValidationResult {
  ok: boolean
  /** 归一化后的扩展名（含点，小写） */
  extension: string
  /** 归一化后的 MIME */
  mimeType: string
  /** 失败原因（ok 为 true 时为空串） */
  reason: string
}

/** 取小写扩展名（含点），无扩展名时返回空串 */
export function getExtension(fileName: string): string {
  return extname(fileName ?? '').toLowerCase()
}

/** 生成随机文件名（十六进制，含扩展名） */
export function randomFileName(extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  const random = randomBytes(Math.ceil(RANDOM_NAME_LENGTH / 2))
    .toString('hex')
    .slice(0, RANDOM_NAME_LENGTH)
  return `${Date.now().toString(36)}-${random}${ext}`
}

/** 生成以当前时间归档的相对目录：<category>/yyyy/MM */
export function buildDateCategory(category: string, date: Date = new Date()): string {
  const year = date.getFullYear().toString()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const safeCategory = sanitizeSegment(category)
  return [safeCategory, year, month].filter((segment) => segment !== '').join('/')
}

/** 生成「相对目录 + 随机文件名」：category/yyyy/MM/xxxx.jpg */
export function buildStorageRelativePath(
  category: string,
  originalName: string,
  date: Date = new Date(),
): { relativePath: string; fileName: string; extension: string } {
  const extension = getExtension(originalName) || '.bin'
  const fileName = randomFileName(extension)
  return {
    relativePath: `${buildDateCategory(category, date)}/${fileName}`,
    fileName,
    extension,
  }
}

/** 目录片段安全化：去掉路径分隔符与 .. 等危险字符 */
export function sanitizeSegment(segment: string): string {
  return (segment ?? '')
    .replace(/[\\/]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^\w.-]/g, '')
    .trim()
}

/**
 * 校验上传文件：扩展名必须在白名单内，且（若声明了 MIME）需与扩展名一致；
 * 提供了 buffer 时进一步做魔数嗅探。
 */
export function validateUploadFile(
  kind: UploadKind,
  originalName: string,
  declaredMime?: string,
  buffer?: Buffer,
): FileValidationResult {
  const extension = getExtension(originalName)
  const allowList: readonly string[] =
    kind === 'image' ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_VIDEO_EXTENSIONS

  if (!extension) {
    return { ok: false, extension: '', mimeType: '', reason: '文件缺少扩展名' }
  }
  if (!allowList.includes(extension)) {
    return {
      ok: false,
      extension,
      mimeType: '',
      reason: `不支持的${kind === 'image' ? '图片' : '视频'}格式 ${extension}，允许：${allowList.join('/')}`,
    }
  }

  const mimeType = EXTENSION_MIME_MAP[extension] ?? declaredMime ?? 'application/octet-stream'
  if (declaredMime && declaredMime !== 'application/octet-stream') {
    const declared = declaredMime.toLowerCase().split(';')[0]?.trim() ?? ''
    const expected = mimeType.toLowerCase()
    // 部分浏览器给 mp4 传 video/quicktime，或 m4v 传 video/mp4，做宽松匹配
    const compatible =
      declared === expected ||
      (kind === 'video' && declared.startsWith('video/')) ||
      (kind === 'image' && declared.startsWith('image/'))
    if (!compatible) {
      return { ok: false, extension, mimeType: declared, reason: `MIME 类型与扩展名不匹配：${declared}` }
    }
  }

  if (buffer && buffer.length > 0) {
    const sniffed = sniffFileKind(buffer)
    if (sniffed !== 'unknown' && sniffed !== kind) {
      return { ok: false, extension, mimeType, reason: '文件内容与声明的文件类型不一致' }
    }
  }

  return { ok: true, extension, mimeType, reason: '' }
}

/** 通过魔数嗅探文件真实类型 */
export function sniffFileKind(buffer: Buffer): 'image' | 'video' | 'unknown' {
  if (buffer.length < 12) return 'unknown'
  const hex = buffer.subarray(0, 16).toString('hex').toLowerCase()
  const ascii = buffer.subarray(0, 16).toString('latin1')

  // 图片
  if (hex.startsWith('ffd8ff')) return 'image' // JPEG
  if (hex.startsWith('89504e47')) return 'image' // PNG
  if (hex.startsWith('47494638')) return 'image' // GIF
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image' // WebP

  // 视频
  if (ascii.slice(4, 8) === 'ftyp') return 'video' // MP4 / MOV / M4V
  if (hex.startsWith('1a45dfa3')) return 'video' // Matroska / WebM
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'AVI ') return 'video' // AVI

  return 'unknown'
}

/** 人类可读的文件大小（日志用） */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}
