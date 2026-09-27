<script setup lang="ts">
/**
 * 头部站内搜索输入框
 *
 * 只负责「收集关键词 → 提交」，不持有搜索结果状态、不直接调用接口。
 * 搜索结果页以 URL 的 q 为唯一数据源，因此刷新、分享链接、再次搜索的行为完全一致。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    /** 与后端 MaxLength 校验保持一致 */
    maxLength?: number
    /** 初始值：在搜索页时回填当前关键词 */
    initialValue?: string
  }>(),
  { maxLength: 50, initialValue: '' },
)

const router = useRouter()
const keyword = ref(props.initialValue)

function submit(): void {
  const value = keyword.value.trim()
  // 空关键词不是错误：不跳转、不提示，保持在当前页面
  if (!value) return
  void router.push({ name: 'search', query: { q: value } })
}
</script>

<template>
  <form data-testid="header-search" class="flex items-center gap-2" @submit.prevent="submit">
    <label class="sr-only" for="header-search-input">搜索站内文章</label>
    <input
      id="header-search-input"
      v-model="keyword"
      data-testid="header-search-input"
      type="text"
      :maxlength="props.maxLength"
      placeholder="搜索"
      autocomplete="off"
      class="w-[150px] border-b border-rule bg-transparent pb-1 text-[13.5px] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none md:w-[180px]"
    />
    <button
      type="submit"
      data-testid="header-search-submit"
      class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent"
    >
      搜索
    </button>
  </form>
</template>
