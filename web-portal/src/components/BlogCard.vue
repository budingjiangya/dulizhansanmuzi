<script setup lang="ts">
/**
 * 首页核心卡片：一个组件内实现两套封面 hover 逻辑
 * - coverType = image：默认第一张封面，mouseenter 起定时器逐张轮切，mouseleave 回到第一张
 * - coverType = video：默认只渲染 FFmpeg 抽帧静态图；mouseenter 才请求并静音自动播放视频，mouseleave 立即暂停并卸载 video 源
 * 关键性能约束：首页不预加载任何视频资源，也不预加载未进入视口的封面图。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ArticleListItemVo } from '@sanmuzi/contracts'
import { CoverType } from '@sanmuzi/contracts'
import { resolveAssetList, resolveAssetUrl } from '@/utils/asset'
import { formatRelative } from '@/utils/format'

const props = defineProps<{
  item: ArticleListItemVo
  /** 首屏前两张卡片由父级标记为优先加载 */
  priority?: boolean
}>()

/** 轮播切换间隔（毫秒） */
const ROTATE_INTERVAL = 900

const images = computed(() => resolveAssetList(props.item.coverImages))
const videoUrl = computed(() => resolveAssetUrl(props.item.coverVideo))
const frameUrl = computed(() => resolveAssetUrl(props.item.coverVideoFrame))

const isImageMode = computed(() => props.item.coverType === CoverType.IMAGE && images.value.length > 0)
const isVideoMode = computed(() => props.item.coverType === CoverType.VIDEO && !!videoUrl.value)

const activeIndex = ref(0)
const isHovering = ref(false)
const isVideoReady = ref(false)
const isVideoFailed = ref(false)
let rotateTimer: number | null = null

const activeImage = computed(() => {
  if (isImageMode.value) return images.value[activeIndex.value] ?? images.value[0] ?? ''
  return frameUrl.value || images.value[0] || ''
})

const coverLabel = computed(() => {
  if (isVideoMode.value) return '视频'
  if (images.value.length > 1) return `${images.value.length} 图`
  return '图文'
})

function stopRotate(): void {
  if (rotateTimer !== null) {
    window.clearInterval(rotateTimer)
    rotateTimer = null
  }
}

function startRotate(): void {
  if (!isImageMode.value || images.value.length < 2) return
  stopRotate()
  rotateTimer = window.setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % images.value.length
  }, ROTATE_INTERVAL)
}

function handleEnter(): void {
  isHovering.value = true
  startRotate()
}

function handleLeave(): void {
  isHovering.value = false
  stopRotate()
  activeIndex.value = 0
  isVideoReady.value = false
  // 卸载 source 即释放解码资源，回到静态帧
  isVideoFailed.value = false
}

/** 视频源仅在 hover 时绑定，因此不会出现在首屏请求里 */
const videoSrc = computed(() => (isHovering.value && isVideoMode.value ? videoUrl.value : undefined))

const videoEl = ref<HTMLVideoElement | null>(null)

watch(videoSrc, async (src) => {
  if (!src) return
  const el = videoEl.value
  if (!el) return
  el.muted = true
  try {
    await el.play()
  } catch {
    // 浏览器可能拦截自动播放；此时保留静态帧，不打断页面
    isVideoFailed.value = true
  }
})

function handleVideoReady(): void {
  isVideoReady.value = true
}

function handleVideoError(): void {
  isVideoFailed.value = true
  isVideoReady.value = false
}

onBeforeUnmount(stopRotate)
</script>

<template>
  <article
    class="group/card"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    @focusin="handleEnter"
    @focusout="handleLeave"
  >
    <RouterLink
      :to="{ name: 'article-detail', params: { id: item.id } }"
      class="block focus-visible:outline-offset-8"
    >
      <div class="relative overflow-hidden rounded-(--radius-card) bg-ink/5">
        <div class="aspect-[16/10] w-full">
          <img
            v-if="activeImage"
            :src="activeImage"
            :alt="item.title"
            :loading="priority ? 'eager' : 'lazy'"
            :fetchpriority="priority ? 'high' : 'auto'"
            decoding="async"
            class="h-full w-full object-cover transition-[transform,opacity] duration-700 ease-out group-hover/card:scale-[1.02]"
          />
          <div v-else class="h-full w-full bg-rule/60"></div>
        </div>

        <!-- 视频层：仅在 hover 且源可用时挂载，未就绪前不遮挡静态帧 -->
        <video
          v-if="videoSrc && !isVideoFailed"
          ref="videoEl"
          :src="videoSrc"
          class="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          :class="isVideoReady ? 'opacity-100' : 'opacity-0'"
          muted
          playsinline
          preload="none"
          loop
          @loadeddata="handleVideoReady"
          @error="handleVideoError"
        ></video>

        <!-- 轮播进度点：仅多图且正在轮切时出现 -->
        <div
          v-if="isImageMode && images.length > 1"
          class="pointer-events-none absolute bottom-3 left-3 flex gap-1.5 transition-opacity duration-300"
          :class="isHovering ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        >
          <span
            v-for="(_, index) in images"
            :key="index"
            class="h-1 w-4 rounded-full transition-colors duration-300"
            :class="index === activeIndex ? 'bg-white' : 'bg-white/45'"
          ></span>
        </div>
      </div>

      <div class="mt-5">
        <span class="text-[11px] uppercase tracking-[0.16em] text-ink-muted">{{ coverLabel }}</span>
        <h2
          class="mt-2 font-serif text-xl leading-snug font-semibold text-ink transition-colors duration-200 group-hover/card:text-accent md:text-[1.375rem]"
        >
          {{ item.title }}
        </h2>
        <p class="mt-3 max-w-[46ch] text-[0.95rem] leading-relaxed text-ink-soft">
          {{ item.shortDesc }}
        </p>
        <p class="mt-4 text-[13px] text-ink-muted">{{ formatRelative(item.updatedAt || item.createdAt) }}</p>
      </div>
    </RouterLink>
  </article>
</template>
