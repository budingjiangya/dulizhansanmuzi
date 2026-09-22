<script setup lang="ts">
/**
 * 视频上传组件
 * - 小文件（<= 8MB）走直传接口
 * - 大文件走分片上传：init → part×N → merge，支持断点续传（已上传分片会被跳过）
 * - 上传完成后由后端 ffprobe 读时长并随机抽帧生成静态封面
 */
import { computed, ref } from 'vue'
import { NAlert, NButton, NProgress, NSlider, NTag } from 'naive-ui'
import type { UploadedVideoVo } from '@sanmuzi/contracts'
import { extractVideoFrame, initChunkUpload, mergeChunkUpload, uploadChunkPart, uploadVideo } from '@/api/file'
import { BizError, resolveAssetUrl } from '@/api/request'
import { UPLOAD_LIMITS } from '@/config'
import { message } from '@/utils/discrete'
import { formatBytes, formatDuration } from '@/utils/format'

const props = defineProps<{
  /** 已上传的视频地址（父表单回填） */
  videoUrl: string | null
  /** 已生成的静态封面帧地址 */
  frameUrl: string | null
}>()

const emit = defineEmits<{
  'update:videoUrl': [value: string | null]
  'update:frameUrl': [value: string | null]
  'update:duration': [value: number | null]
  'update:resolution': [value: string | null]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref(0)
const stageText = ref('')
const duration = ref<number | null>(null)
const resolution = ref<string | null>(null)
const frameTime = ref(3)
const extracting = ref(false)
const manualUrl = ref('')

const chunkSize = computed(() => UPLOAD_LIMITS.chunkSizeMB * 1024 * 1024)
const videoPreviewSrc = computed(() => resolveAssetUrl(props.videoUrl))
const framePreviewSrc = computed(() => resolveAssetUrl(props.frameUrl))

function pickFile(): void {
  inputRef.value?.click()
}

function buildFileHash(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

const fileMeta = ref('')

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (file.size > UPLOAD_LIMITS.videoMaxMB * 1024 * 1024) {
    message.error(`视频不能超过 ${UPLOAD_LIMITS.videoMaxMB}MB`)
    return
  }

  uploading.value = true
  progress.value = 0
  fileMeta.value = `${file.name} · ${formatBytes(file.size)}`
  try {
    const result =
      file.size <= chunkSize.value ? await uploadDirect(file) : await uploadByChunks(file)
    if (result) {
      emit('update:videoUrl', result.url)
      emit('update:frameUrl', result.coverVideoFrame)
      emit('update:duration', result.duration)
      emit('update:resolution', result.resolution)
      duration.value = result.duration
      resolution.value = result.resolution
      message.success('视频上传完成，封面帧已自动生成')
    }
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '视频上传失败')
  } finally {
    uploading.value = false
    stageText.value = ''
    progress.value = 0
  }
}

/** 小文件直传 */
async function uploadDirect(file: File): Promise<UploadedVideoVo> {
  stageText.value = '上传中…'
  return uploadVideo(file, (percent) => {
    progress.value = percent
    stageText.value = `上传中 ${percent}%`
  })
}

/** 大文件分片上传 + 断点续传 */
async function uploadByChunks(file: File): Promise<UploadedVideoVo | null> {
  const totalChunks = Math.ceil(file.size / chunkSize.value)
  stageText.value = '初始化分片会话…'
  const session = await initChunkUpload({
    fileHash: buildFileHash(file),
    fileName: file.name,
    fileSize: file.size,
    chunkSize: chunkSize.value,
    totalChunks,
    mimeType: file.type,
  })

  // 秒传：该文件此前已合并完成
  if (session.instant && session.file) {
    progress.value = 100
    stageText.value = '文件已存在，直接复用'
    return session.file
  }

  const done = new Set(session.uploadedChunks)
  const skipped = done.size
  if (skipped > 0) message.info(`检测到已上传 ${skipped} 个分片，继续上传剩余部分`)

  for (let index = 0; index < totalChunks; index += 1) {
    if (done.has(index)) continue
    const start = index * chunkSize.value
    const blob = file.slice(start, Math.min(start + chunkSize.value, file.size))
    await uploadChunkPart(session.uploadId, index, blob)
    done.add(index)
    progress.value = Math.round((done.size / totalChunks) * 95)
    stageText.value = `上传分片 ${done.size}/${totalChunks}`
  }

  stageText.value = '合并分片并生成封面帧…'
  progress.value = 97
  const merged = await mergeChunkUpload(session.uploadId)
  progress.value = 100
  return merged
}

async function handleExtractFrame(): Promise<void> {
  if (!props.videoUrl) {
    message.warning('请先上传视频或填写视频地址')
    return
  }
  extracting.value = true
  try {
    const result = await extractVideoFrame({ videoUrl: props.videoUrl, time: frameTime.value })
    emit('update:frameUrl', result.coverVideoFrame)
    duration.value = result.duration
    emit('update:duration', result.duration)
    message.success(`已在第 ${result.frameTime} 秒重新抽帧`)
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '抽帧失败')
  } finally {
    extracting.value = false
  }
}

/** 允许直接粘贴已上传资源的地址（例如复用素材库） */
function applyManualUrl(): void {
  const value = manualUrl.value.trim()
  if (!value) return
  emit('update:videoUrl', value)
  message.success('已设置视频地址')
  manualUrl.value = ''
}

function clearVideo(): void {
  emit('update:videoUrl', null)
  emit('update:frameUrl', null)
  emit('update:duration', null)
  emit('update:resolution', null)
  duration.value = null
  resolution.value = null
}
</script>

<template>
  <div class="space-y-3">
    <input
      ref="inputRef"
      type="file"
      class="hidden"
      :accept="UPLOAD_LIMITS.videoAccept"
      @change="handleFileChange"
    />

    <div class="flex flex-wrap items-center gap-2">
      <NButton size="small" type="primary" :loading="uploading" @click="pickFile">
        {{ props.videoUrl ? '重新上传视频' : '上传短视频' }}
      </NButton>
      <NButton v-if="props.videoUrl" size="small" quaternary @click="clearVideo">移除视频</NButton>
      <NTag v-if="duration !== null" size="small" :bordered="false">
        时长 {{ formatDuration(duration) }}
      </NTag>
      <NTag v-if="resolution" size="small" :bordered="false">{{ resolution }}</NTag>
      <NTag size="small" :bordered="false" type="info">
        大于 {{ UPLOAD_LIMITS.chunkSizeMB }}MB 自动分片上传
      </NTag>
    </div>

    <NProgress
      v-if="uploading"
      type="line"
      :percentage="progress"
      :height="6"
      :border-radius="3"
      indicator-placement="inside"
    />
    <p v-if="fileMeta" class="text-[12px] opacity-70">{{ fileMeta }}</p>
    <p v-if="stageText" class="text-[12px] opacity-70">{{ stageText }}</p>

    <div v-if="props.videoUrl" class="grid gap-3 md:grid-cols-2">
      <div>
        <p class="mb-1.5 text-[12px] opacity-70">视频预览</p>
        <video
          :src="videoPreviewSrc"
          class="h-[150px] w-full rounded bg-black object-contain"
          controls
          preload="metadata"
        ></video>
      </div>
      <div>
        <p class="mb-1.5 text-[12px] opacity-70">静态封面帧（前台首页默认展示）</p>
        <div class="h-[150px] w-full overflow-hidden rounded bg-black/5">
          <img
            v-if="framePreviewSrc"
            :src="framePreviewSrc"
            class="h-full w-full object-cover"
            alt="封面帧"
          />
          <div v-else class="grid h-full place-items-center text-[12px] opacity-60">尚未生成封面帧</div>
        </div>
      </div>
    </div>

    <div v-if="props.videoUrl" class="rounded border border-dashed border-black/10 p-3">
      <p class="mb-2 text-[12px] font-medium">重新抽帧</p>
      <div class="flex flex-wrap items-center gap-3">
        <NSlider v-model:value="frameTime" :min="0" :max="Math.max(10, Math.floor(duration ?? 30))" :step="0.5" class="max-w-[280px]" />
        <span class="text-[12px] opacity-70">第 {{ frameTime }} 秒</span>
        <NButton size="tiny" :loading="extracting" @click="handleExtractFrame">按该时间点抽帧</NButton>
      </div>
      <p class="mt-2 text-[12px] opacity-60">
        不指定时间点时，后端会在 0 ~ (时长-1) 秒内随机取点截取一帧。
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="manualUrl"
        type="text"
        placeholder="或直接粘贴视频地址，例如 /static/uploads/demo/xxx.mp4"
        class="w-full max-w-[420px] rounded border border-black/10 bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2563eb]"
        @keyup.enter="applyManualUrl"
      />
      <NButton size="tiny" quaternary @click="applyManualUrl">使用该地址</NButton>
    </div>

    <NAlert v-if="props.videoUrl && !props.frameUrl" type="warning" :bordered="false" size="small">
      该视频还没有静态封面帧，前台首页会退化为展示纯色底；建议点上方「抽帧」生成一张。
    </NAlert>
  </div>
</template>
