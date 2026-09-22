<script setup lang="ts">
/** 内联 SVG 图标：path 数据来自 components/icons.ts，避免引入图标库 */
import { computed } from 'vue'
import { MENU_ICONS } from './icons'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })

const path = computed(() => MENU_ICONS[props.name] ?? '')
</script>

<template>
  <svg
    v-if="path"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    class="shrink-0"
  >
    <path :d="path" />
  </svg>
</template>
