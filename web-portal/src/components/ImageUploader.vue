<script setup lang="ts">
/**
 * 多封面图上传组件：支持多选上传、原生拖拽排序、删除、地址粘贴
 * 排序结果即前台首页 hover 轮播的播放顺序。
 */
import { computed, ref } from 'vue'
import { NButton, NProgress, NTag } from 'naive-ui'
import { uploadImage } from '@/admin/api/file'
import { BizError, resolveAssetUrl } from '@/admin/api/request'
import { UPLOAD_LIMITS } from '@/admin/config'
import { message } from '@/admin/utils/discrete'
import { formatBytes } from '@/admin/utils/format'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const progress = ref(0)
const progressText = ref('')
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const manualUrl = ref('')

const images = computed(() => props.modelValue ?? [])

function update(next: string[]): void {
  emit('update:modelValue', next)
}

function pickFiles(): void {
  inputRef.value?.click()
}

async function handleFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return

  uploading.value = true
  const added: string[] = []
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!
      if (file.size > UPLOAD_LIMITS.imageMaxMB * 1024 * 1024) {
        message.error(`${file.name} 超过 ${UPLOAD_LIMITS.imageMaxMB}MB，已跳过`)
        continue
      }
      progressText.value = `上传 ${file.name}（${formatBytes(file.size)}）`
      const result = await uploadImage(file, (percent) => {
        progress.value = Math.round(((index + percent / 100) / files.length) * 100)
      })
      added.push(result.url)
    }
    if (added.length) {
      update([...images.value, ...added])
      message.success(`已上传 ${added.length} 张封面图`)
    }
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '图片上传失败')
  } finally {
    uploading.value = false
    progress.value = 0
    progressText.value = ''
  }
}

function removeAt(index: number): void {
  const next = [...images.value]
  next.splice(index, 1)
  update(next)
}

function handleDragStart(index: number): void {
  dragIndex.value = index
}

function handleDragOver(index: number, event: DragEvent): void {
  event.preventDefault()
  dragOverIndex.value = index
}

function handleDrop(index: number): void {
  const from = dragIndex.value
  dragIndex.value = null
  dragOverIndex.value = null
  if (from === null || from === index) return
  const next = [...images.value]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return
  next.splice(index, 0, moved)
  update(next)
  message.success('封面图顺序已调整')
}

function move(index: number, offset: number): void {
  const target = index + offset
  if (target < 0 || target >= images.value.length) return
  const next = [...images.value]
  const [moved] = next.splice(index, 1)
  if (moved === undefined) return
  next.splice(target, 0, moved)
  update(next)
}

function applyManualUrl(): void {
  const value = manualUrl.value.trim()
  if (!value) return
  update([...images.value, value])
  manualUrl.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <input
      ref="inputRef"
      type="file"
      class="hidden"
      multiple
      :accept="UPLOAD_LIMITS.imageAccept"
      @change="handleFiles"
    />

    <div class="flex flex-wrap items-center gap-2">
      <NButton size="small" type="primary" :loading="uploading" @click="pickFiles">上传封面图</NButton>
      <NTag size="small" :bordered="false">单张不超过 {{ UPLOAD_LIMITS.imageMaxMB }}MB</NTag>
      <NTag v-if="images.length" size="small" :bordered="false" type="info">
        共 {{ images.length }} 张 · 首页按此顺序轮播
      </NTag>
    </div>

    <NProgress v-if="uploading" type="line" :percentage="progress" :height="6" :border-radius="3" />
    <p v-if="progressText" class="text-[12px] opacity-70">{{ progressText }}</p>

    <div v-if="images.length" class="flex flex-wrap gap-3">
      <div
        v-for="(url, index) in images"
        :key="`${url}-${index}`"
        class="group relative h-[96px] w-[144px] cursor-grab overflow-hidden rounded border bg-black/5"
        :class="[
          dragIndex === index ? 'opacity-50' : '',
          dragOverIndex === index ? 'border-[#2563eb] ring-2 ring-[#2563eb]/30' : 'border-black/10',
        ]"
        draggable="true"
        @dragstart="handleDragStart(index)"
        @dragover="handleDragOver(index, $event)"
        @drop="handleDrop(index)"
        @dragend="dragIndex = null"
      >
        <img :src="resolveAssetUrl(url)" class="h-full w-full object-cover" :alt="`封面 ${index + 1}`" />
        <span
          class="absolute left-1 top-1 rounded bg-black/65 px-1.5 text-[11px] leading-4 text-white"
        >
          {{ index === 0 ? '主封面' : index + 1 }}
        </span>
        <div
          class="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <button
            type="button"
            class="px-1 text-[11px] text-white disabled:opacity-40"
            :disabled="index === 0"
            @click="move(index, -1)"
          >
            ←
          </button>
          <button type="button" class="px-1 text-[11px] text-white" @click="removeAt(index)">删除</button>
          <button
            type="button"
            class="px-1 text-[11px] text-white disabled:opacity-40"
            :disabled="index === images.length - 1"
            @click="move(index, 1)"
          >
            →
          </button>
        </div>
      </div>
    </div>

    <p v-else class="text-[12.5px] opacity-60">
      还没有封面图。多图模式下，前台卡片鼠标悬浮会自动轮切，需要至少 1 张、建议 3 张。
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="manualUrl"
        type="text"
        placeholder="或粘贴图片地址，例如 https://… 或 /static/uploads/…"
        class="w-full max-w-[420px] rounded border border-black/10 bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2563eb]"
        @keyup.enter="applyManualUrl"
      />
      <NButton size="tiny" quaternary @click="applyManualUrl">添加</NButton>
    </div>
  </div>
</template>
