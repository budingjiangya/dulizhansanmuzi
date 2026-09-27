<script setup lang="ts">
/**
 * 分类文章列表页（前台 /category/:id）
 *
 * 两个数据源，都在分类切换时重新取：
 * - fetchPortalCategories()：找出分类名，只用于页头标题
 * - fetchPortalCategoryArticles()：该分类下已上架的文章，分页「查看更多」
 *
 * 标题兜底顺序：分类接口 → 列表项自带的 categoryName → 兜底文案，
 * 这样分类接口偶发失败时页面也不会丢掉标题。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArticleListItemVo } from '@sanmuzi/contracts'
import { fetchPortalCategories, fetchPortalCategoryArticles } from '@/api/category'
import { BizError } from '@/api/http'
import { HOME_PAGE_SIZE } from '@/config'
import BlogCard from '@/components/BlogCard.vue'
import ArticleCardSkeleton from '@/components/ArticleCardSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

/** 分类不存在：后端返回 40400，单独标记是为了给出「回分类总览」的引导而不是重试 */
const CODE_NOT_FOUND = 40400

const categoryId = computed(() => String(route.params.id ?? ''))
const categoryName = ref('')
const articles = ref<ArticleListItemVo[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
/** 首屏失败：整页换成空态 + 重试 */
const errorMessage = ref('')
/** 加载下一页失败：保留已加载的卡片，只在按钮附近提示 */
const moreErrorMessage = ref('')
const notFound = ref(false)

/** 请求序号：快速切换分类时丢弃过期响应，避免旧分类的数据盖到新分类上 */
let requestSeq = 0

const hasMore = computed(() => articles.value.length < total.value)
const displayName = computed(() => categoryName.value || articles.value[0]?.categoryName || '分类')

/** 分类名只是标题：失败就退回兜底，不阻塞文章列表 */
async function loadCategoryName(id: string): Promise<void> {
  try {
    const list = await fetchPortalCategories()
    categoryName.value = list.find((item) => String(item.id) === id)?.name ?? ''
  } catch {
    categoryName.value = ''
  }
}

async function load(target: number, append: boolean): Promise<void> {
  const id = categoryId.value
  const seq = ++requestSeq
  if (append) {
    loadingMore.value = true
    moreErrorMessage.value = ''
  } else {
    loading.value = true
    errorMessage.value = ''
    notFound.value = false
  }
  try {
    const result = await fetchPortalCategoryArticles(id, { page: target, pageSize: HOME_PAGE_SIZE })
    if (seq !== requestSeq) return
    articles.value = append ? [...articles.value, ...result.list] : result.list
    total.value = result.total
    page.value = result.page
  } catch (error) {
    if (seq !== requestSeq) return
    if (append) {
      moreErrorMessage.value = error instanceof BizError ? error.message : '加载失败，请稍后重试'
    } else if (error instanceof BizError && error.code === CODE_NOT_FOUND) {
      articles.value = []
      total.value = 0
      notFound.value = true
    } else {
      articles.value = []
      total.value = 0
      errorMessage.value = error instanceof BizError ? error.message : '内容加载失败，请稍后重试'
    }
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadMore(): void {
  if (loading.value || loadingMore.value || !hasMore.value) return
  void load(page.value + 1, true)
}

function retry(): void {
  void load(1, false)
}

function goCategoryList(): void {
  void router.push({ name: 'category' })
}

/** 路由参数变化即重新加载：清空上一个分类的内容，回到第一页 */
watch(
  categoryId,
  (id) => {
    articles.value = []
    total.value = 0
    page.value = 1
    categoryName.value = ''
    notFound.value = false
    moreErrorMessage.value = ''
    void loadCategoryName(id)
    void load(1, false)
  },
  { immediate: true },
)
</script>

<template>
  <div class="shell">
    <div class="pt-10 md:pt-14">
      <RouterLink
        :to="{ name: 'category' }"
        class="text-[13px] text-ink-muted transition-colors duration-200 hover:text-accent"
      >
        ← 返回分类
      </RouterLink>
    </div>

    <header class="pt-8 md:pt-10">
      <h2
        data-testid="category-title"
        class="font-serif text-[1.75rem] leading-tight font-semibold text-ink md:text-[2.25rem]"
      >
        {{ displayName }}
      </h2>
      <p v-if="!loading && !notFound && !errorMessage && total > 0" class="mt-4 text-[13px] text-ink-muted">
        共 {{ total }} 篇
      </p>
    </header>

    <section class="rule-top mt-10 pt-12 md:mt-12 md:pt-14">
      <ArticleCardSkeleton v-if="loading" :count="3" />

      <EmptyState
        v-else-if="notFound"
        title="这个分类不存在"
        description="它可能已经被删除，或者链接里的编号不对。"
        action-text="返回分类总览"
        @action="goCategoryList"
      />

      <EmptyState
        v-else-if="errorMessage"
        title="没能取到内容"
        :description="errorMessage"
        action-text="重新加载"
        @action="retry"
      />

      <EmptyState
        v-else-if="articles.length === 0"
        title="这个分类下还没有内容"
        description="文章归到这个分类并上架之后，这里就会出现。"
        action-text="看看其它分类"
        @action="goCategoryList"
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

        <div v-if="hasMore" class="mt-16 flex flex-col items-center gap-3 md:mt-20">
          <p v-if="moreErrorMessage" class="text-[13px] text-accent" role="alert">{{ moreErrorMessage }}</p>
          <button
            type="button"
            class="text-[13.5px] text-ink-soft transition-colors duration-200 hover:text-accent disabled:opacity-50"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : '查看更多' }}
          </button>
        </div>
        <p v-else class="mt-16 text-center text-[13px] text-ink-muted md:mt-20">已经到底了</p>
      </template>
    </section>
  </div>
</template>
