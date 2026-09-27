<script setup lang="ts">
/**
 * 搜索结果页
 *
 * 唯一输入来源是 URL 的 q：刷新、分享链接、从头部再次搜索的行为完全一致。
 * 关键词变化即重新查询第一页，不做整页刷新。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArticleListItemVo } from '@sanmuzi/contracts'
import { fetchPortalSearch } from '@/api/article'
import { BizError } from '@/api/http'
import { HOME_PAGE_SIZE } from '@/config'
import BlogCard from '@/components/BlogCard.vue'
import ArticleCardSkeleton from '@/components/ArticleCardSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const keyword = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const articles = ref<ArticleListItemVo[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref('')

const hasMore = computed(() => articles.value.length < total.value)

async function load(target: number, append: boolean): Promise<void> {
  const q = keyword.value
  if (!q) {
    articles.value = []
    total.value = 0
    return
  }
  if (append) loadingMore.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchPortalSearch({ keyword: q, page: target, pageSize: HOME_PAGE_SIZE })
    articles.value = append ? [...articles.value, ...result.list] : result.list
    total.value = result.total
    page.value = result.page
  } catch (error) {
    errorMessage.value = error instanceof BizError ? error.message : '搜索失败，请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore(): void {
  if (loading.value || loadingMore.value || !hasMore.value) return
  void load(page.value + 1, true)
}

function goHome(): void {
  void router.push({ name: 'home' })
}

watch(keyword, () => void load(1, false), { immediate: true })
</script>

<template>
  <div class="shell">
    <section class="rule-top mt-12 pt-12 md:mt-14 md:pt-14">
      <div class="mb-8 flex items-baseline justify-between md:mb-10">
        <div>
          <h2 class="font-serif text-lg font-semibold text-ink">搜索</h2>
          <p v-if="keyword" class="mt-2 text-[13px] text-ink-muted">
            关键词「{{ keyword }}」<span v-if="total > 0">· 共 {{ total }} 篇</span>
          </p>
        </div>
        <button
          type="button"
          class="text-[13px] text-ink-muted transition-colors duration-200 hover:text-accent"
          @click="goHome"
        >
          返回推荐清单
        </button>
      </div>

      <ArticleCardSkeleton v-if="loading" :count="3" />

      <EmptyState
        v-else-if="errorMessage"
        title="搜索没能完成"
        :description="errorMessage"
        action-text="重新搜索"
        @action="load(1, false)"
      />

      <EmptyState
        v-else-if="articles.length === 0"
        title="没有找到相关内容"
        :description="`没有找到与「${keyword}」相关的内容，换个关键词试试，或者回到首页看看推荐清单。`"
        action-text="回到推荐清单"
        @action="goHome"
      />

      <template v-else>
        <div class="card-grid">
          <BlogCard v-for="(item, index) in articles" :key="item.id" :item="item" :priority="index < 2" />
        </div>

        <div v-if="hasMore" class="mt-16 flex justify-center md:mt-20">
          <button
            type="button"
            class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent disabled:opacity-50"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : '查看更多结果' }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>
