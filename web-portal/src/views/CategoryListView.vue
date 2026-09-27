<script setup lang="ts">
/**
 * 分类总览页（前台 /category）
 *
 * 只做一件事：把全部分类一行一个列出来，点进去看该分类下的文章。
 * 视觉延续全站取向——留白、字号层级、一条细分隔线，不用卡片边框与阴影。
 */
import { computed, onMounted, ref } from 'vue'
import type { CategoryVo } from '@sanmuzi/contracts'
import { fetchPortalCategories } from '@/api/category'
import { BizError } from '@/api/http'
import EmptyState from '@/components/EmptyState.vue'

const categories = ref<CategoryVo[]>([])
const loading = ref(false)
const errorMessage = ref('')

/**
 * 全部已上架文章数：给页头一句「共 N 篇」的概览。
 * 必须用 publishedArticleCount（只算已上架），否则会和分类详情页的列表条数对不上。
 */
const totalArticles = computed(() =>
  categories.value.reduce((sum, item) => sum + item.publishedArticleCount, 0),
)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    categories.value = await fetchPortalCategories()
  } catch (error) {
    errorMessage.value = error instanceof BizError ? error.message : '分类加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="shell">
    <!-- 开场：一段话交代这一页是干什么的，不做横幅 -->
    <section class="pt-14 pb-12 md:pt-20 md:pb-16">
      <h2 class="max-w-[24ch] font-serif text-[1.75rem] leading-tight font-semibold text-ink md:text-[2.25rem]">
        按分类找想看的东西
      </h2>
      <p class="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-ink-soft">
        每个分类只收同一类产品，点进去就是该分类下已上架的全部文章，按更新时间排列。
      </p>
    </section>

    <section class="rule-top pt-12 md:pt-14">
      <div class="mb-8 flex items-baseline justify-between md:mb-10">
        <h3 class="font-serif text-lg font-semibold text-ink">全部分类</h3>
        <span v-if="categories.length > 0" class="text-[13px] text-ink-muted">
          {{ categories.length }} 个分类 · 共 {{ totalArticles }} 篇
        </span>
      </div>

      <!-- 骨架屏：结构与真实列表保持一致，加载完成不跳动 -->
      <div v-if="loading" class="rule-top animate-pulse" aria-hidden="true">
        <div
          v-for="index in 4"
          :key="index"
          class="rule-bottom flex items-baseline justify-between gap-6 py-6 md:py-7"
        >
          <div class="h-6 w-40 rounded bg-rule/70"></div>
          <div class="h-4 w-16 rounded bg-rule/50"></div>
        </div>
      </div>

      <EmptyState
        v-else-if="errorMessage"
        title="没能取到分类"
        :description="errorMessage"
        action-text="重新加载"
        @action="load"
      />

      <EmptyState
        v-else-if="categories.length === 0"
        title="还没有分类"
        description="后台建好分类、把文章归进去之后，这里就会列出来。"
      />

      <div v-else class="rule-top">
        <RouterLink
          v-for="category in categories"
          :key="category.id"
          :to="{ name: 'category-detail', params: { id: category.id } }"
          data-testid="category-entry"
          class="rule-bottom group flex items-baseline justify-between gap-6 py-6 md:py-7"
        >
          <span
            class="font-serif text-xl leading-snug font-semibold text-ink transition-colors duration-200 group-hover:text-accent md:text-[1.375rem]"
          >
            {{ category.name }}
          </span>
          <span class="flex shrink-0 items-baseline gap-3 text-[13px] text-ink-muted">
            <!-- 前台只展示已上架文章，因此这里用已上架口径 -->
            <span>{{ category.publishedArticleCount }} 篇</span>
            <span
              class="transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent"
              aria-hidden="true"
            >
              →
            </span>
          </span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
