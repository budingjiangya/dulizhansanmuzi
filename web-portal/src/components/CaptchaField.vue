<script setup lang="ts">
/**
 * 图形验证码字段（前台复用组件）
 *
 * 职责：挂载时取一张验证码、渲染图片、收集用户输入的码。
 *
 * 安全约束：图片一律走 `<img :src="imageBase64">`（后端返回的已经是可直接使用的 data URI），
 * 绝不使用 v-html —— 把后端字符串当 HTML 插入会引入注入面。
 *
 * 对外接口：
 * - props：modelValue（用户输入的码）、captchaId（提交时原样回传给后端）
 * - emits：update:modelValue、update:captchaId
 * - expose：refresh()，父组件在「验证码错误」时调用，只换图不动其它表单字段
 */
import { computed, onMounted, ref } from 'vue'
import { fetchCaptcha } from '@/api/captcha'
import { BizError } from '@/api/http'

defineProps<{
  /** 用户输入的验证码 */
  modelValue: string
  /** 验证码标识：后端返回，提交时原样回传 */
  captchaId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:captchaId': [value: string]
}>()

/** 可直接放进 img src 的 data URI */
const imageBase64 = ref('')
const loading = ref(false)
/** 取图失败（接口/网络）的提示 */
const errorMessage = ref('')
/** 图片解码失败：data URI 拿到了，但浏览器渲染不出来 */
const imageFailed = ref(false)

const showImage = computed(() => !!imageBase64.value && !imageFailed.value)

const placeholderText = computed(() => {
  if (loading.value) return '加载中…'
  if (imageFailed.value) return '图片加载失败'
  if (errorMessage.value) return '点击重试'
  return '点击获取'
})

/** 兜底文案：图片挂了要给出重试入口（整个方块就是按钮） */
const hintMessage = computed(() => {
  if (imageFailed.value) return '验证码图片没能显示，点上面的方框重新获取。'
  return errorMessage.value
})

/** 取新图：旧码在新图上必然无效，因此同时清空已输入的码（邮箱、留言不受影响） */
async function refresh(): Promise<void> {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const captcha = await fetchCaptcha()
    imageBase64.value = captcha.imageBase64
    imageFailed.value = false
    emit('update:captchaId', captcha.captchaId)
    emit('update:modelValue', '')
  } catch (error) {
    imageBase64.value = ''
    emit('update:captchaId', '')
    errorMessage.value = error instanceof BizError ? error.message : '验证码加载失败，请重试'
  } finally {
    loading.value = false
  }
}

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function handleImageError(): void {
  imageFailed.value = true
}

defineExpose({ refresh })

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div>
    <label for="captcha-code-input" class="block text-[13px] text-ink-muted">图形验证码</label>

    <div class="mt-3 flex flex-wrap items-center gap-5">
      <input
        id="captcha-code-input"
        data-testid="captcha-input"
        :value="modelValue"
        type="text"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="填写图片中的验证码"
        class="w-[11rem] border-b border-rule bg-transparent pb-1.5 text-[0.95rem] tracking-[0.2em] text-ink placeholder:tracking-normal placeholder:text-ink-muted focus:border-accent focus:outline-none"
        @input="handleInput"
      />

      <!-- 图片即按钮：点击换一张；图挂了则显示兜底文案，点同一处重试 -->
      <button
        type="button"
        data-testid="captcha-refresh"
        class="shrink-0 disabled:opacity-60"
        :disabled="loading"
        aria-label="更换验证码"
        @click="refresh"
      >
        <img
          v-if="showImage"
          data-testid="captcha-image"
          :src="imageBase64"
          alt="图形验证码"
          width="120"
          height="40"
          decoding="async"
          class="h-10 w-[120px] rounded-[3px] bg-ink/5 object-cover"
          @error="handleImageError"
        />
        <span
          v-else
          class="flex h-10 w-[120px] items-center justify-center rounded-[3px] bg-ink/5 text-[12px] text-ink-muted"
        >
          {{ placeholderText }}
        </span>
      </button>
    </div>

    <p class="mt-3 text-[12.5px] text-ink-muted">看不清就点图片换一张。</p>
    <p v-if="hintMessage" class="mt-2 text-[12.5px] text-accent">{{ hintMessage }}</p>
  </div>
</template>
