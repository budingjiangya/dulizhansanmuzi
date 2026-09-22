/**
 * 资源上传接口：图片直传、小视频直传、大视频分片上传（支持断点续传）
 */
import type {
  ChunkInitDto,
  ChunkInitVo,
  ChunkPartVo,
  ExtractFrameDto,
  ExtractFrameVo,
  UploadedFileVo,
  UploadedVideoVo,
} from '@sanmuzi/contracts'
import { http, request } from './request'

export function uploadImage(file: File, onProgress?: (percent: number) => void): Promise<UploadedFileVo> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedFileVo>({
    url: '/api/admin/files/image',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    onUploadProgress: onProgress,
  })
}

export function uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<UploadedVideoVo> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedVideoVo>({
    url: '/api/admin/files/video',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    onUploadProgress: onProgress,
  })
}

/** 分片上传：初始化（返回已上传分片，用于断点续传） */
export function initChunkUpload(data: ChunkInitDto): Promise<ChunkInitVo> {
  return http.post<ChunkInitVo>('/api/admin/files/video/chunk/init', data)
}

/** 分片上传：上传单个分片 */
export function uploadChunkPart(
  uploadId: string,
  chunkIndex: number,
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<ChunkPartVo> {
  const form = new FormData()
  form.append('uploadId', uploadId)
  form.append('chunkIndex', String(chunkIndex))
  form.append('file', blob, `chunk-${chunkIndex}`)
  return request<ChunkPartVo>({
    url: '/api/admin/files/video/chunk/part',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    onUploadProgress: onProgress,
  })
}

/** 分片上传：合并并抽帧 */
export function mergeChunkUpload(uploadId: string): Promise<UploadedVideoVo> {
  return http.post<UploadedVideoVo>('/api/admin/files/video/chunk/merge', { uploadId }, { timeout: 0 })
}

/** 对已上传视频按指定时间点（或随机）重新抽帧 */
export function extractVideoFrame(data: ExtractFrameDto): Promise<ExtractFrameVo> {
  return http.post<ExtractFrameVo>('/api/admin/files/video/frame', data, { timeout: 0 })
}
