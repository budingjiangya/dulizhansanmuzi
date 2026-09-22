<script setup lang="ts">
/**
 * 文章详情：排版优先的单栏阅读页。
 * 正文是后端富文本 HTML，样式由全局 .prose-article 承担（不使用 scoped，避免 v-html 内容失样式）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArticleDetailVo } from '@sanmuzi/contracts'
import { fetchPortalArticleDetail } from '@/api/article'
import { BizError } from '@/api/http'
import { resolveAssetList, resolveAssetUrl } from '@/utils/asset'
import { formatDate } from '@/utils/format'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const article = ref<ArticleDetailVo | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const coverImages = computed(() => resolveAssetList(article.value?.coverImages))
const heroImage = computed(() => {
  if (article.value?.coverType === 'video') return resolveAssetUrl(article.value.coverVideoFrame)
  return coverImages.value[0] ?? ''
})
const articleId = computed(() => String(route.params.id ?? ''))

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  article.value = null
  try {
    article.value = await fetchPortalArticleDetail(articleId.value)
  } catch (error) {
    errorMessage.value =
      error instanceof BizError && error.code === 40400
        ? '这篇文章不存在，或者已经下架了。'
        : error instanceof BizError
          ? error.message
          : '内容加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function goHome(): void {
  void router.push({ name: 'home' })
}

watch(articleId, () => void load(), { immediate: true })
</script>

<template>
  <div class="shell">
    <div class="pt-10 md:pt-14">
      <RouterLink
        :to="{ name: 'home' }"
        class="text-[13px] text-ink-muted transition-colors duration-200 hover:text-accent"
      >
        ← 返回推荐清单
      </RouterLink>
    </div>

    <!-- 加载态：保持最终排版的结构，避免跳动 -->
    <div v-if="loading" class="mx-auto max-w-[46rem] animate-pulse pt-10 pb-20">
      <div class="h-4 w-24 rounded bg-rule/70"></div>
      <div class="mt-6 h-9 w-4/5 rounded bg-rule/70"></div>
      <div class="mt-4 h-4 w-2/3 rounded bg-rule/50"></div>
      <div class="mt-10 aspect-[16/9] w-full rounded-(--radius-card) bg-rule/60"></div>
      <div class="mt-10 space-y-3">
        <div class="h-4 w-full rounded bg-rule/50"></div>
        <div class="h-4 w-full rounded bg-rule/50"></div>
        <div class="h-4 w-3/4 rounded bg-rule/50"></div>
      </div>
    </div>

    <EmptyState
      v-else-if="errorMessage"
      class="mx-auto max-w-[46rem]"
      title="打不开这篇文章"
      :description="errorMessage"
      action-text="回到首页"
      @action="goHome"
    />

    <article v-else-if="article" class="mx-auto max-w-[46rem] pb-16">
      <header class="pt-8 md:pt-10">
        <time class="text-[13px] text-ink-muted">{{ formatDate(article.updatedAt || article.createdAt) }}</time>
        <h1 class="mt-4 font-serif text-[1.875rem] leading-tight font-semibold text-ink md:text-[2.5rem]">
          {{ article.title }}
        </h1>
        <p class="mt-5 font-serif text-[1.0625rem] leading-relaxed text-ink-soft md:text-[1.125rem]">
          {{ article.shortDesc }}
        </p>
      </header>

      <figure v-if="heroImage" class="mt-10 md:mt-12">
        <img
          :src="heroImage"
          :alt="article.title"
          loading="eager"
          decoding="async"
          class="w-full rounded-[4px] object-cover"
        />
      </figure>

      <div class="rule-top mt-12 pt-12 md:mt-14 md:pt-14">
        <div class="prose-article" v-html="article.content"></div>
      </div>

      <footer class="rule-top mt-16 pt-8">
        <RouterLink
          :to="{ name: 'home' }"
          class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent"
        >
          ← 看更多推荐
        </RouterLink>
      </footer>
    </article>
  </div>
</template>
