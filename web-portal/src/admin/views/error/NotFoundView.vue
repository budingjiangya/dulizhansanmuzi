<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="grid min-h-screen place-items-center">
    <NResult status="404" title="页面不存在" description="地址可能已失效，或者该功能已经下线。">
      <template #footer>
        <NButton type="primary" @click="router.push('/admin/dashboard')">回到工作台</NButton>
      </template>
    </NResult>
  </div>
</template>
