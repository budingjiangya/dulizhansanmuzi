<script setup lang="ts">
/**
 * 首页：只做三件事——一句话介绍、推荐卡片网格、继续加载。
 * 没有 Hero 横幅、没有堆叠的功能区块，靠留白与字号层级建立节奏。
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { ArticleListItemVo } from '@sanmuzi/contracts'
import { fetchPortalArticles } from '@/api/article'
import { HOME_PAGE_SIZE } from '@/config'
import { BizError } from '@/api/http'
import { useSiteConfigStore } from '@/stores/siteConfig'
import BlogCard from '@/components/BlogCard.vue'
import ArticleCardSkeleton from '@/components/ArticleCardSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const siteConfigStore = useSiteConfigStore()

const articles = ref<ArticleListItemVo[]>([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref('')
const listAnchor = ref<HTMLElement | null>(null)

const hasMore = computed(() => articles.value.length < total.value)
const siteDescription = computed(() => siteConfigStore.config.siteDescription)

async function loadPage(target: number, append: boolean): Promise<void> {
  if (append) loadingMore.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchPortalArticles({ page: target, pageSize: HOME_PAGE_SIZE })
    articles.value = append ? [...articles.value, ...result.list] : result.list
    total.value = result.total
    page.value = result.page
  } catch (error) {
    errorMessage.value = error instanceof BizError ? error.message : '内容加载失败，请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore(): void {
  if (loading.value || loadingMore.value || !hasMore.value) return
  void loadPage(page.value + 1, true)
}

function retry(): void {
  void loadPage(1, false)
}

/** 首屏后滚动到列表锚点，便于页头「全部推荐」跳转 */
watch(
  () => listAnchor.value,
  (el) => {
    if (el) el.id = 'recommendations'
  },
  { immediate: true },
)

onMounted(() => {
  void loadPage(1, false)
})
</script>

<template>
  <div class="shell">
    <!-- 开场：一段话，两行字，不做横幅 -->
    <section class="pt-14 pb-12 md:pt-20 md:pb-16">
      <h2 class="max-w-[24ch] font-serif text-[1.75rem] leading-tight font-semibold text-ink md:text-[2.25rem]">
        用过半年以上，才值得写进来
      </h2>
      <p class="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-ink-soft">
        {{ siteDescription }}
      </p>
    </section>

    <section ref="listAnchor" class="rule-top pt-12 md:pt-14">
      <div class="mb-8 flex items-baseline justify-between md:mb-12">
        <h3 class="font-serif text-lg font-semibold text-ink">推荐清单</h3>
        <span v-if="total > 0" class="text-[13px] text-ink-muted">共 {{ total }} 篇</span>
      </div>

      <ArticleCardSkeleton v-if="loading" :count="4" />

      <EmptyState
        v-else-if="errorMessage"
        title="没能取到内容"
        :description="errorMessage"
        action-text="重新加载"
        @action="retry"
      />

      <EmptyState
        v-else-if="articles.length === 0"
        title="还没有推荐内容"
        description="后台把文章标记为「首页推荐」并上架后，这里就会出现。"
      />

      <template v-else>
        <div class="card-grid">
          <BlogCard
            v-for="(item, index) in articles"
            :key="item.id"
            :item="item"
            :priority="index < 2"
          />
        </div>

        <div v-if="hasMore" class="mt-16 flex justify-center md:mt-20">
          <button
            type="button"
            class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent disabled:opacity-50"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : '继续往下看' }}
          </button>
        </div>
        <p v-else class="mt-16 text-center text-[13px] text-ink-muted md:mt-20">已经到底了</p>
      </template>
    </section>
  </div>
</template>
