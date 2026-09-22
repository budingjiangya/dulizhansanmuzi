<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="shell">
    <div class="rule-top mt-16 max-w-[46rem] py-20 md:mt-24">
      <p class="font-serif text-[4rem] leading-none font-semibold text-rule">404</p>
      <h1 class="mt-6 font-serif text-2xl font-semibold text-ink">这个地址没有内容</h1>
      <p class="mt-4 max-w-[46ch] text-[0.95rem] text-ink-soft">
        链接可能已经失效，或者文章被作者撤下了。
      </p>
      <button
        type="button"
        class="mt-8 text-[13.5px] text-accent underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70"
        @click="router.push({ name: 'home' })"
      >
        回到推荐清单
      </button>
    </div>
  </div>
</template>
