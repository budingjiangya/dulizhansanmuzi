<script setup lang="ts">
/** 个人修改密码：改完后清除登录态并要求重新登录 */
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, type FormInst, type FormRules } from 'naive-ui'
import { changePassword } from '@/admin/api/auth'
import { BizError } from '@/admin/api/request'
import { useUserStore } from '@/admin/stores/user'
import { useAppStore } from '@/admin/stores/app'
import { message } from '@/admin/utils/discrete'

const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

const formRef = ref<FormInst | null>(null)
const submitting = ref(false)
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: ['input', 'blur'] }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: ['input', 'blur'] },
    { min: 6, max: 64, message: '新密码长度 6-64 位', trigger: ['input', 'blur'] },
    {
      validator: (_rule, value: string) => {
        if (value && value === form.oldPassword) return new Error('新密码不能与当前密码相同')
        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: ['input', 'blur'] },
    {
      validator: (_rule, value: string) => {
        if (value !== form.newPassword) return new Error('两次输入的新密码不一致')
        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
}

async function handleSubmit(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword })
    message.success('密码已修改，请使用新密码重新登录')
    userStore.resetState()
    appStore.resetTabs()
    await router.replace({ name: 'admin-login' })
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '密码修改失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-[560px] space-y-3">
    <NAlert type="info" :bordered="false" size="small">
      当前账号：{{ userStore.displayName }}（{{ userStore.userInfo?.username }}）。密码以 bcrypt 加密存储，后台不保留明文。
    </NAlert>

    <NCard :bordered="false" size="small" title="修改密码">
      <NForm ref="formRef" :model="form" :rules="rules" label-placement="top">
        <NFormItem label="当前密码" path="oldPassword">
          <NInput v-model:value="form.oldPassword" type="password" show-password-on="click" placeholder="请输入当前密码" />
        </NFormItem>
        <NFormItem label="新密码" path="newPassword">
          <NInput v-model:value="form.newPassword" type="password" show-password-on="click" placeholder="6-64 位" />
        </NFormItem>
        <NFormItem label="确认新密码" path="confirmPassword">
          <NInput
            v-model:value="form.confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="请再次输入新密码"
            @keyup.enter="handleSubmit"
          />
        </NFormItem>
      </NForm>
      <div class="flex justify-end gap-2">
        <NButton size="small" @click="router.back()">取消</NButton>
        <NButton size="small" type="primary" :loading="submitting" @click="handleSubmit">确认修改</NButton>
      </div>
    </NCard>
  </div>
</template>
