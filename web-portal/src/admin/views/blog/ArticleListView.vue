<script setup lang="ts">
/** 文章管理：筛选 + 列表 + 推荐位/上下架/排序快速操作 */
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,

  NInput,
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  type DataTableColumns,
  type PaginationProps,
} from 'naive-ui'
import type { ArticleListItemVo, CoverTypeValue } from '@sanmuzi/contracts'
import { COVER_TYPE_TEXT, CoverType, PERMISSIONS } from '@sanmuzi/contracts'
import {
  deleteArticle,
  fetchArticles,
  toggleArticlePublish,
  toggleArticleRecommend,
  updateArticleSort,
} from '@/admin/api/article'
import { BizError, resolveAssetUrl } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import { formatDateTime } from '@/admin/utils/format'

const router = useRouter()

const rows = ref<ArticleListItemVo[]>([])
const loading = ref(false)
const total = ref(0)
const pending = reactive<Record<string, boolean>>({})

/** 列表筛选条件：布尔筛选用 'true'/'false' 字符串承载（NSelect 不接受 boolean） */
interface ArticleFilter {
  page: number
  pageSize: number
  keyword: string
  coverType: CoverTypeValue | undefined
  isRecommend: string
  isPublish: string
}

const query = reactive<ArticleFilter>({
  page: 1,
  pageSize: 10,
  keyword: '',
  coverType: undefined,
  isRecommend: '',
  isPublish: '',
})

const coverTypeOptions = [
  { label: '全部封面类型', value: undefined },
  { label: COVER_TYPE_TEXT.image, value: CoverType.IMAGE },
  { label: COVER_TYPE_TEXT.video, value: CoverType.VIDEO },
]

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '已上架', value: 'true' },
  { label: '草稿箱', value: 'false' },
]

const recommendOptions = [
  { label: '全部推荐位', value: '' },
  { label: '已推荐', value: 'true' },
  { label: '未推荐', value: 'false' },
]

const pagination = computed<PaginationProps>(() => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 10,
  itemCount: total.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  prefix: ({ itemCount }) => `共 ${itemCount} 条`,
  onChange: (page: number) => {
    query.page = page
    void load()
  },
  onUpdatePageSize: (size: number) => {
    query.pageSize = size
    query.page = 1
    void load()
  },
}))

function coverOf(row: ArticleListItemVo): string {
  if (row.coverType === CoverType.VIDEO) return resolveAssetUrl(row.coverVideoFrame)
  const first = row.coverImages?.[0]
  return resolveAssetUrl(first)
}

function isPending(row: ArticleListItemVo, action: string): boolean {
  return Boolean(pending[`${row.id}:${action}`])
}

function setPending(row: ArticleListItemVo, action: string, value: boolean): void {
  pending[`${row.id}:${action}`] = value
}

/** NSelect 的值统一按 string 承载，发请求前转回契约里的类型 */
function toBooleanFlag(value: string): boolean | undefined {
  if (value === '') return undefined
  return value === 'true'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await fetchArticles({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      coverType: query.coverType,
      isRecommend: toBooleanFlag(query.isRecommend),
      isPublish: toBooleanFlag(query.isPublish),
    })
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '文章列表加载失败')
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

function resetQuery(): void {
  query.keyword = ''
  query.coverType = undefined
  query.isRecommend = ''
  query.isPublish = ''
  query.page = 1
  void load()
}

async function handleRecommend(row: ArticleListItemVo, value: boolean): Promise<void> {
  setPending(row, 'recommend', true)
  try {
    await toggleArticleRecommend(row.id, value)
    row.isRecommend = value
    message.success(value ? '已加入首页推荐位' : '已取消首页推荐')
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '操作失败')
    await load()
  } finally {
    setPending(row, 'recommend', false)
  }
}

async function handlePublish(row: ArticleListItemVo, value: boolean): Promise<void> {
  setPending(row, 'publish', true)
  try {
    await toggleArticlePublish(row.id, value)
    row.isPublish = value
    message.success(value ? '文章已上架' : '文章已下架')
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '操作失败')
    await load()
  } finally {
    setPending(row, 'publish', false)
  }
}

async function handleSort(row: ArticleListItemVo, value: number | null): Promise<void> {
  const next = value ?? 0
  if (next === row.sort) return
  setPending(row, 'sort', true)
  try {
    await updateArticleSort(row.id, next)
    row.sort = next
    message.success(`排序权重已更新为 ${next}`)
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '排序更新失败')
    await load()
  } finally {
    setPending(row, 'sort', false)
  }
}

async function handleDelete(row: ArticleListItemVo): Promise<void> {
  setPending(row, 'delete', true)
  try {
    await deleteArticle(row.id)
    message.success('文章已删除')
    if (rows.value.length === 1 && query.page > 1) query.page -= 1
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '删除失败')
  } finally {
    setPending(row, 'delete', false)
  }
}

const columns = computed<DataTableColumns<ArticleListItemVo>>(() => [
  {
    title: '封面',
    key: 'cover',
    width: 108,
    render: (row) => {
      const url = coverOf(row)
      return h(
        'div',
        { class: 'relative h-[54px] w-[90px] overflow-hidden rounded bg-black/5' },
        url
          ? [
              h('img', { src: url, class: 'h-full w-full object-cover', loading: 'lazy' }),
              row.coverType === CoverType.VIDEO
                ? h(
                    'span',
                    {
                      class:
                        'absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white',
                    },
                    '视频',
                  )
                : null,
            ]
          : [h('span', { class: 'grid h-full place-items-center text-[11px] opacity-50' }, '无封面')],
      )
    },
  },
  {
    title: '标题 / 摘要',
    key: 'title',
    minWidth: 260,
    render: (row) =>
      h('div', { class: 'py-1' }, [
        h('div', { class: 'text-[13.5px] font-medium leading-snug' }, row.title),
        h(
          'div',
          { class: 'mt-1 line-clamp-1 text-[12px] opacity-60' },
          row.shortDesc.length > 46 ? `${row.shortDesc.slice(0, 46)}…` : row.shortDesc,
        ),
      ]),
  },
  {
    title: '封面类型',
    key: 'coverType',
    width: 118,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.coverType === CoverType.VIDEO ? 'warning' : 'info' },
        { default: () => COVER_TYPE_TEXT[row.coverType as CoverTypeValue] ?? row.coverType },
      ),
  },
  {
    title: '首页推荐',
    key: 'isRecommend',
    width: 96,
    render: (row) =>
      h(NSwitch, {
        size: 'small',
        value: row.isRecommend,
        loading: isPending(row, 'recommend'),
        'onUpdate:value': (value: boolean) => void handleRecommend(row, value),
      }),
  },
  {
    title: '上架状态',
    key: 'isPublish',
    width: 96,
    render: (row) =>
      h(NSwitch, {
        size: 'small',
        value: row.isPublish,
        loading: isPending(row, 'publish'),
        'onUpdate:value': (value: boolean) => void handlePublish(row, value),
      }),
  },
  {
    title: '排序',
    key: 'sort',
    width: 108,
    render: (row) =>
      h(NInputNumber, {
        size: 'small',
        value: row.sort,
        min: 0,
        max: 99999,
        disabled: isPending(row, 'sort'),
        class: 'w-[88px]',
        'onUpdate:value': (value: number | null) => void handleSort(row, value),
      }),
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    width: 168,
    render: (row) => h('span', { class: 'text-[12.5px] opacity-75' }, formatDateTime(row.updatedAt)),
  },
  {
    title: '操作',
    key: 'actions',
    width: 132,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => [
          h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              type: 'primary',
              onClick: () => router.push({ name: 'admin-blog-article-edit', params: { id: row.id } }),
            },
            { default: () => '编辑' },
          ),
          h(
            NPopconfirm,
            {
              onPositiveClick: () => void handleDelete(row),
              positiveText: '确认删除',
              negativeText: '取消',
            },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'tiny', quaternary: true, type: 'error', loading: isPending(row, 'delete') },
                  { default: () => '删除' },
                ),
              default: () => `确认删除《${row.title}》？该操作不可撤销。`,
            },
          ),
        ],
      }),
  },
])

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center gap-2">
        <NInput
          v-model:value="query.keyword"
          placeholder="搜索标题或摘要"
          clearable
          class="w-[220px]"
          @keyup.enter="search"
        />
        <NSelect
          v-model:value="query.coverType"
          :options="coverTypeOptions"
          class="w-[150px]"
          :consistent-menu-width="false"
        />
        <NSelect
          v-model:value="query.isRecommend"
          :options="recommendOptions"
          class="w-[140px]"
          :consistent-menu-width="false"
        />
        <NSelect
          v-model:value="query.isPublish"
          :options="statusOptions"
          class="w-[130px]"
          :consistent-menu-width="false"
        />
        <NButton type="primary" size="small" @click="search">查询</NButton>
        <NButton size="small" @click="resetQuery">重置</NButton>
        <div class="ml-auto">
          <NButton
            v-permission="PERMISSIONS.BLOG_ARTICLE_CREATE"
            type="primary"
            size="small"
            @click="router.push({ name: 'admin-blog-article-create' })"
          >
            新建文章
          </NButton>
        </div>
      </div>
    </NCard>

    <NCard :bordered="false" size="small">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: ArticleListItemVo) => row.id"
        :scroll-x="1180"
        remote
        size="small"
        flex-height
        class="h-[calc(100vh-19rem)]"
      />
    </NCard>
  </div>
</template>
