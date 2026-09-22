<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NBreadcrumb, NBreadcrumbItem } from 'naive-ui'

const route = useRoute()

/** 面包屑由路由 matched 链生成，父级 layout 路由无 title 会自动跳过 */
const crumbs = computed(() =>
  route.matched
    .filter((item) => item.meta?.title)
    .map((item) => ({ title: String(item.meta.title), path: item.path })),
)
</script>

<template>
  <NBreadcrumb>
    <NBreadcrumbItem v-for="(crumb, index) in crumbs" :key="crumb.path">
      <span :class="index === crumbs.length - 1 ? 'font-medium' : 'opacity-70'">{{ crumb.title }}</span>
    </NBreadcrumbItem>
  </NBreadcrumb>
</template>
