<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
</script>

<template>
  <div class="grid h-full place-items-center">
    <NResult status="403" title="无权访问该页面" description="当前账号的角色不具备此页面的权限，接口请求同样会被后端拒绝。">
      <template #footer>
        <div class="flex justify-center gap-3">
          <NButton @click="router.push('/dashboard')">回到工作台</NButton>
          <NButton type="primary" @click="router.push('/login')">切换账号</NButton>
        </div>
        <p class="mt-4 text-[12.5px] opacity-60">当前角色：{{ userStore.userInfo?.roleName ?? '-' }}</p>
      </template>
    </NResult>
  </div>
</template>
