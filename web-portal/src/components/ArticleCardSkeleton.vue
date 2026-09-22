<script setup lang="ts">
/** 骨架屏：结构与 BlogCard 对齐，避免加载完成后布局跳动 */
withDefaults(defineProps<{ count?: number }>(), { count: 4 })
</script>

<template>
  <div class="card-grid" aria-hidden="true">
    <div v-for="index in count" :key="index" class="animate-pulse">
      <div class="aspect-[16/10] w-full rounded-(--radius-card) bg-rule/70"></div>
      <div class="mt-5 h-3 w-14 rounded bg-rule/70"></div>
      <div class="mt-3 h-5 w-4/5 rounded bg-rule/70"></div>
      <div class="mt-3 h-4 w-full rounded bg-rule/50"></div>
      <div class="mt-2 h-4 w-2/3 rounded bg-rule/50"></div>
    </div>
  </div>
</template>
