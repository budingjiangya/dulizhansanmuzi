<script setup lang="ts">
/** 后台登录页：账号密码 + 前端基础校验，失败信息由后端统一返回 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NForm, NFormItem, NInput, type FormInst, type FormRules } from 'naive-ui'
import type { LoginDto } from '@sanmuzi/contracts'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { BizError } from '@/api/request'
import { message } from '@/utils/discrete'
import SvgIcon from '@/components/SvgIcon.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

const formRef = ref<FormInst | null>(null)
const model = ref<LoginDto>({ username: '', password: '' })
const loading = ref(false)
const errorText = ref('')
const showPassword = ref(false)

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: ['input', 'blur'] }],
  password: [
    { required: true, message: '请输入密码', trigger: ['input', 'blur'] },
    { min: 6, message: '密码至少 6 位', trigger: ['input', 'blur'] },
  ],
}

const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'))

async function handleSubmit(): Promise<void> {
  errorText.value = ''
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    const user = await userStore.login(model.value)
    message.success(`欢迎回来，${user.realName || user.username}`)
    await router.replace(redirect.value)
  } catch (error) {
    errorText.value = error instanceof BizError ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function fillDemo(username: string, password: string): void {
  model.value = { username, password }
}
</script>

<template>
  <div class="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
    <!-- 左侧站点说明：纯排版，无插图无渐变 -->
    <section class="hidden flex-col justify-between bg-[#0f1115] p-12 text-white lg:flex">
      <div class="flex items-center gap-3">
        <span class="grid h-9 w-9 place-items-center rounded-md bg-[#2563eb] text-[14px] font-semibold">三</span>
        <span class="text-[15px] font-medium">三目子 · 内容管理后台</span>
      </div>

      <div>
        <h1 class="max-w-[20ch] text-[2rem] leading-tight font-semibold">
          写推荐、管资源、控上架，都在这一处。
        </h1>
        <p class="mt-6 max-w-[38ch] text-[15px] leading-relaxed text-white/65">
          文章 CRUD、封面资源上传、FFmpeg 自动抽帧、首页推荐位与排序管理，配合 RBAC 角色权限控制。
        </p>
      </div>

      <dl class="grid grid-cols-3 gap-6 border-t border-white/10 pt-8 text-[13px]">
        <div>
          <dt class="text-white/50">鉴权</dt>
          <dd class="mt-1">JWT + 角色实时查库</dd>
        </div>
        <div>
          <dt class="text-white/50">上传</dt>
          <dd class="mt-1">分片上传 / 断点续传</dd>
        </div>
        <div>
          <dt class="text-white/50">封面</dt>
          <dd class="mt-1">多图轮播 / 视频预览</dd>
        </div>
      </dl>
    </section>

    <!-- 右侧表单 -->
    <section class="flex items-center justify-center bg-[#f6f7f9] px-6 py-12">
      <div class="w-full max-w-[380px]">
        <div class="mb-8 flex items-center justify-between">
          <div>
            <h2 class="text-[22px] font-semibold text-[#17181a]">账号登录</h2>
            <p class="mt-2 text-[13px] text-[#6b6f76]">请使用管理员账号登录后台</p>
          </div>
          <NButton quaternary size="small" @click="appStore.toggleTheme">
            <template #icon>
              <SvgIcon :name="appStore.dark ? 'sun' : 'moon'" :size="18" />
            </template>
          </NButton>
        </div>

        <NAlert v-if="errorText" type="error" :bordered="false" class="mb-4">
          {{ errorText }}
        </NAlert>

        <NForm ref="formRef" :model="model" :rules="rules" size="large" @keyup.enter="handleSubmit">
          <NFormItem path="username" label="账号">
            <NInput v-model:value="model.username" placeholder="请输入管理员账号" :input-props="{ autocomplete: 'username' }" />
          </NFormItem>
          <NFormItem path="password" label="密码">
            <NInput
              v-model:value="model.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              show-password-on="click"
              :input-props="{ autocomplete: 'current-password' }"
              @update:show-password="(value: boolean) => (showPassword = value)"
            />
          </NFormItem>
          <NButton type="primary" block size="large" :loading="loading" @click="handleSubmit">
            登录
          </NButton>
        </NForm>

        <div class="mt-8 border-t border-[#e5e6e8] pt-5 text-[12.5px] leading-relaxed text-[#6b6f76]">
          <p class="mb-2">演示账号（点击填入）：</p>
          <div class="flex flex-wrap gap-2">
            <NButton size="tiny" quaternary @click="fillDemo('admin', 'Admin@123456')">admin / Admin@123456</NButton>
            <NButton size="tiny" quaternary @click="fillDemo('editor', 'Editor@123456')">editor / Editor@123456</NButton>
          </div>
          <p class="mt-3">内容编辑账号无法访问账号管理与登录日志，接口层面同样会被拒绝。</p>
        </div>
      </div>
    </section>
  </div>
</template>
