<script setup lang="ts">
/**
 * 邮件订阅页（前台 /subscribe）
 *
 * 表单三件事：邮箱（必填）、留言（选填，最多 200 字）、图形验证码。
 *
 * 交互约定：
 * - 邮箱格式不合法、验证码没填，都在本地拦下，不发请求；
 * - 提交失败一律在表单内提示（不用 alert / 弹窗），已填内容不丢；
 * - 「验证码错误」（40000 且信息里含「验证码」）只换一张验证码图，邮箱与留言原样保留。
 */
import { computed, ref } from 'vue'
import type { SubscribeResultVo } from '@sanmuzi/contracts'
import { submitSubscription } from '@/api/subscription'
import { BizError } from '@/api/http'
import CaptchaField from '@/components/CaptchaField.vue'

/** 邮箱格式：本地先拦一道，最终仍以服务端校验为准 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
/** 邮箱长度上限，与后端 SubscribeDto 的 MaxLength(160) 保持一致 */
const EMAIL_MAX_LENGTH = 160
/** 留言字数上限，按需求收得比后端（500）更紧一档 */
const MESSAGE_MAX_LENGTH = 200
/** 参数校验失败（验证码错误走这个码） */
const CODE_PARAM_INVALID = 40000
/** 触发限流 */
const CODE_TOO_MANY_REQUESTS = 42900

const email = ref('')
const message = ref('')
const captchaCode = ref('')
const captchaId = ref('')
/** 只需要 refresh()：提交失败时换一张验证码 */
const captchaRef = ref<InstanceType<typeof CaptchaField> | null>(null)

const submitting = ref(false)
const errorMessage = ref('')
const result = ref<SubscribeResultVo | null>(null)

const duplicated = computed(() => result.value?.duplicated === true)
const successDescription = computed(() =>
  duplicated.value
    ? '这个邮箱之前已经提交过，不用重复操作，有新文章时照常会收到邮件。'
    : '已经记下这个邮箱了。之后有新文章会不定期发一封邮件，不发广告，回复邮件即可退订。',
)

/** 判断「验证码错误」：参数校验码 + 后端信息点名了验证码 */
function isCaptchaError(error: unknown): error is BizError {
  return error instanceof BizError && error.code === CODE_PARAM_INVALID && error.message.includes('验证码')
}

async function submit(): Promise<void> {
  if (submitting.value) return
  errorMessage.value = ''

  const trimmedEmail = email.value.trim()
  if (!trimmedEmail) {
    errorMessage.value = '请填写邮箱地址。'
    return
  }
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errorMessage.value = '邮箱格式看起来不对，检查一下再提交。'
    return
  }
  if (!captchaCode.value.trim()) {
    errorMessage.value = '请填写图形验证码。'
    return
  }

  submitting.value = true
  try {
    result.value = await submitSubscription({
      email: trimmedEmail,
      message: message.value.trim() || undefined,
      captchaId: captchaId.value,
      captchaCode: captchaCode.value.trim(),
    })
  } catch (error) {
    if (isCaptchaError(error)) {
      // 只刷新验证码：邮箱与留言保持原样，不让用户重填。
      // 后端信息已经把「错误/过期」说清楚时沿用它的措辞，否则补一句更明确的提示。
      errorMessage.value = /错误|过期/.test(error.message) ? error.message : '验证码错误，请重新输入。'
      captchaRef.value?.refresh()
    } else if (error instanceof BizError && error.code === CODE_TOO_MANY_REQUESTS) {
      errorMessage.value = '提交太频繁了，请稍后再试。'
    } else if (error instanceof BizError) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = '提交失败，请稍后重试。'
    }
  } finally {
    submitting.value = false
  }
}

/** 换一个邮箱再订阅：清空表单并取一张新的验证码 */
function resetForm(): void {
  email.value = ''
  message.value = ''
  captchaCode.value = ''
  errorMessage.value = ''
  result.value = null
  captchaRef.value?.refresh()
}
</script>

<template>
  <div class="shell">
    <article class="mx-auto max-w-[46rem] pb-16">
      <header class="pt-12 md:pt-16">
        <h1 class="font-serif text-[1.875rem] leading-tight font-semibold text-ink md:text-[2.5rem]">邮件订阅</h1>
        <p class="mt-5 font-serif text-[1.0625rem] leading-relaxed text-ink-soft md:text-[1.125rem]">
          新文章发布时不定期发一封邮件，只发新内容，不发广告。
        </p>
      </header>

      <!-- 成功态：替换整个表单，只留一句结论 + 一个出口 -->
      <section v-if="result" class="rule-top mt-12 pt-12 md:mt-14 md:pt-14">
        <h2 data-testid="subscribe-success" class="font-serif text-2xl font-semibold text-ink">
          {{ duplicated ? '这个邮箱已经订阅过了' : '订阅成功' }}
        </h2>
        <p class="mt-4 max-w-[54ch] text-[0.95rem] leading-relaxed text-ink-soft">{{ successDescription }}</p>
        <button
          type="button"
          class="mt-8 text-[13.5px] text-accent underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70"
          @click="resetForm"
        >
          再订阅一个邮箱
        </button>
      </section>

      <!-- 表单：字段之间只用留白，唯一的线是顶部这条细分隔线 -->
      <form
        v-else
        data-testid="subscribe-form"
        class="rule-top mt-12 max-w-[34rem] pt-12 md:mt-14 md:pt-14"
        novalidate
        @submit.prevent="submit"
      >
        <div>
          <label for="subscribe-email" class="block text-[13px] text-ink-muted">
            邮箱 <span class="text-accent">*</span>
          </label>
          <input
            id="subscribe-email"
            v-model="email"
            data-testid="subscribe-email"
            name="email"
            type="email"
            autocomplete="email"
            :maxlength="EMAIL_MAX_LENGTH"
            placeholder="you@example.com"
            class="mt-3 w-full border-b border-rule bg-transparent pb-1.5 text-[0.95rem] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div class="mt-10">
          <label for="subscribe-message" class="block text-[13px] text-ink-muted">留言（可留空）</label>
          <textarea
            id="subscribe-message"
            v-model="message"
            data-testid="subscribe-message"
            name="message"
            rows="4"
            :maxlength="MESSAGE_MAX_LENGTH"
            placeholder="想看的品类、想让我评测的东西……可留空"
            class="mt-3 w-full resize-none border-b border-rule bg-transparent pb-1.5 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          ></textarea>
        </div>

        <CaptchaField
          ref="captchaRef"
          v-model="captchaCode"
          v-model:captchaId="captchaId"
          class="mt-10"
        />

        <p v-if="errorMessage" data-testid="subscribe-error" role="alert" class="mt-8 text-[13.5px] text-accent">
          {{ errorMessage }}
        </p>

        <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2">
          <button
            type="submit"
            data-testid="subscribe-submit"
            class="text-[13.5px] text-accent underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70 disabled:opacity-50"
            :disabled="submitting"
          >
            {{ submitting ? '提交中…' : '提交订阅' }}
          </button>
          <span class="text-[12.5px] text-ink-muted">邮箱只用来发送新文章通知。</span>
        </div>
      </form>
    </article>
  </div>
</template>
