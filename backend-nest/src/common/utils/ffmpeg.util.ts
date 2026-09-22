/**
 * FFmpeg 工具
 * 职责：
 * 1. ffprobe 探测视频时长与分辨率；
 * 2. ffmpeg 在指定时间点抽帧 / 在随机时间点抽帧，生成静态封面图；
 * 3. Windows 下自动解析 ffmpeg.exe / ffprobe.exe，收集 stderr 便于排查。
 * 约定：探测与抽帧失败一律返回 null（或 ok:false），由调用方决定降级策略，绝不抛出 500。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** ffprobe 结构化的视频信息 */
export interface VideoProbeInfo {
  /** 总时长（秒），读取失败为 null */
  duration: number | null
  /** 分辨率，例如 1280x720 */
  resolution: string | null
  /** 视频编码，例如 h264 */
  videoCodec: string | null
  /** 视频流宽高 */
  width: number | null
  height: number | null
}

/** 抽帧结果 */
export interface ExtractFrameResult {
  ok: boolean
  /** 产出的图片绝对路径（失败为空串） */
  framePath: string
  /** 实际使用的时间点（保留两位小数） */
  frameTime: number
  /** 失败原因（成功为空串） */
  error: string
}

/** 子进程统一配置：隐藏窗口 + 32MB 缓冲，避免 Windows 弹窗与日志截断 */
const SPAWN_OPTIONS = {
  windowsHide: true,
  maxBuffer: 32 * 1024 * 1024,
  encoding: 'utf8' as const,
  timeout: 120_000,
}

/** 覆盖路径（来自 .env 的 FFMPEG_PATH / FFPROBE_PATH），为空时从 PATH 查找 */
let ffmpegOverride = ''
let ffprobeOverride = ''

/** 由配置层注入可执行文件路径（main.ts 启动时调用一次） */
export function configureFfmpeg(options: { ffmpegPath?: string; ffprobePath?: string }): void {
  ffmpegOverride = (options.ffmpegPath ?? '').trim()
  ffprobeOverride = (options.ffprobePath ?? '').trim()
}

/** 解析可执行文件路径：优先显式配置，其次 PATH；Windows 下用 where 定位 .exe */
export function resolveExecutable(name: 'ffmpeg' | 'ffprobe'): string {
  const override = name === 'ffmpeg' ? ffmpegOverride : ffprobeOverride
  if (override) return override

  const isWindows = process.platform === 'win32'
  const probe = spawnSync(isWindows ? 'where' : 'which', [name], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: false,
  })
  if (probe.status === 0 && typeof probe.stdout === 'string') {
    const first = probe.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    if (first) return first
  }
  // 兜底：交给系统 PATH 解析（Windows 会自动补 .exe）
  return isWindows ? `${name}.exe` : name
}

/** 把子进程的 stderr/stdout 整理成单行错误信息 */
function describeFailure(prefix: string, stdout: unknown, stderr: unknown): string {
  const text = [stderr, stdout]
    .map((chunk) => (typeof chunk === 'string' ? chunk : ''))
    .filter((chunk) => chunk.trim() !== '')
    .join('\n')
    .trim()
  const tail = text.split(/\r?\n/).slice(-4).join(' | ')
  return tail ? `${prefix}: ${tail}` : prefix
}

/** ffprobe 数据结构（只声明用到的字段） */
interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
}

interface FfprobeOutput {
  format?: { duration?: string }
  streams?: FfprobeStream[]
}

/**
 * 探测视频信息
 * 命令：ffprobe -v error -print_format json -show_format -show_streams <file>
 * 任何异常（文件不存在、非视频、ffprobe 缺失）都返回 duration/resolution 为 null 的结果。
 */
export function probeVideo(filePath: string): VideoProbeInfo {
  const empty: VideoProbeInfo = {
    duration: null,
    resolution: null,
    videoCodec: null,
    width: null,
    height: null,
  }
  if (!filePath || !existsSync(filePath)) return empty

  const result = spawnSync(
    resolveExecutable('ffprobe'),
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    SPAWN_OPTIONS,
  )
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    return empty
  }

  try {
    const parsed = JSON.parse(result.stdout) as FfprobeOutput
    const videoStream = (parsed.streams ?? []).find((stream) => stream.codec_type === 'video')
    const rawDuration = parsed.format?.duration ?? videoStream?.duration
    const durationValue = rawDuration === undefined ? Number.NaN : Number(rawDuration)
    const duration = Number.isFinite(durationValue) && durationValue > 0 ? roundTo(durationValue, 2) : null
    const width = typeof videoStream?.width === 'number' ? videoStream.width : null
    const height = typeof videoStream?.height === 'number' ? videoStream.height : null
    return {
      duration,
      resolution: width !== null && height !== null ? `${width}x${height}` : null,
      videoCodec: videoStream?.codec_name ?? null,
      width,
      height,
    }
  } catch {
    return empty
  }
}

/** 保留 n 位小数 */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * 计算随机抽帧时间点：random(0, max(duration - 1, 0))，保留 2 位小数。
 * 时长未知（null）时退化为固定 0.5 秒，保证仍能出一张封面。
 */
export function pickRandomFrameTime(duration: number | null): number {
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return roundTo(0.5, 2)
  }
  const max = Math.max(duration - 1, 0)
  return roundTo(Math.random() * max, 2)
}

/**
 * 指定时间点抽帧
 * 命令：ffmpeg -y -ss <time> -i <file> -frames:v 1 -q:v 2 -vf "scale='min(1280,iw)':-2" <out.jpg>
 */
export function extractFrameAt(filePath: string, timeSeconds: number, outputPath: string): ExtractFrameResult {
  const frameTime = roundTo(Math.max(timeSeconds, 0), 2)
  if (!filePath || !existsSync(filePath)) {
    return { ok: false, framePath: '', frameTime, error: `视频文件不存在：${filePath}` }
  }

  const targetDir = dirname(outputPath)
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
  if (existsSync(outputPath)) rmSync(outputPath, { force: true })

  const result = spawnSync(
    resolveExecutable('ffmpeg'),
    [
      '-y',
      '-ss',
      frameTime.toString(),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-vf',
      "scale='min(1280,iw)':-2",
      outputPath,
    ],
    SPAWN_OPTIONS,
  )

  if (result.error) {
    return { ok: false, framePath: '', frameTime, error: `ffmpeg 启动失败：${result.error.message}` }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      framePath: '',
      frameTime,
      error: describeFailure(`ffmpeg 抽帧失败（退出码 ${result.status ?? 'null'}）`, result.stdout, result.stderr),
    }
  }
  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    return {
      ok: false,
      framePath: '',
      frameTime,
      error: describeFailure('ffmpeg 未产出有效图片', result.stdout, result.stderr),
    }
  }
  return { ok: true, framePath: resolve(outputPath), frameTime, error: '' }
}

/**
 * 随机时间点抽帧：先探测时长，再随机取点。
 * 返回实际使用的时间点，便于前端展示与入库。
 */
export function extractRandomFrame(filePath: string, outputPath: string): ExtractFrameResult {
  const info = probeVideo(filePath)
  const frameTime = pickRandomFrameTime(info.duration)
  const result = extractFrameAt(filePath, frameTime, outputPath)
  // 秒级边界（例如时长 1.2s 取到 0.2s 之后的极端位置）抽帧失败时，回退到中间点重试一次
  if (!result.ok) {
    const fallbackTime = info.duration ? roundTo(info.duration / 2, 2) : 0
    if (Math.abs(fallbackTime - frameTime) > 0.01) {
      const retry = extractFrameAt(filePath, fallbackTime, outputPath)
      // 重试失败仍然返回首次失败的详细信息
      return retry
    }
  }
  return result
}
