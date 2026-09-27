<script setup lang="ts">
/**
 * 邮件订阅列表页（后台）
 * 前台提交的订阅记录：邮箱 + 留言 + 来源 IP，按邮箱与订阅时间区间筛选，支持删除单条记录。
 */
import { computed, h, onMounted, reactive, ref, resolveDirective, withDirectives } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDatePicker,

  NInput,
  NPopconfirm,
  NSpace,
  type DataTableColumns,
  type PaginationProps,
} from 'naive-ui'
import type { QuerySubscriptionDto, SubscriptionVo } from '@sanmuzi/contracts'
import { PERMISSIONS } from '@sanmuzi/contracts'
import { deleteSubscription, fetchSubscriptions } from '@/admin/api/subscription'
import { BizError } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import { dayjs, formatDateTime } from '@/admin/utils/format'

/** 表格里的按钮由 render 函数渲染，用同一条全局指令 withDirectives 应用（等价于 v-permission） */
const permissionDirective = resolveDirective('permission')!

const rows = ref<SubscriptionVo[]>([])
const loading = ref(false)
const total = ref(0)
/** 时间区间（毫秒时间戳），NDatePicker 的 range 模式绑定值 */
const timeRange = ref<[number, number] | null>(null)

const query = reactive<QuerySubscriptionDto>({
  page: 1,
  pageSize: 10,
  email: '',
})

const pagination = computed<PaginationProps>(() => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 10,
  itemCount: total.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  prefix: ({ itemCount }) => `共 ${itemCount} 条订阅`,
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

async function load(): Promise<void> {
  loading.value = true
  try {
    const params: QuerySubscriptionDto = {
      page: query.page,
      pageSize: query.pageSize,
      email: query.email?.trim() || undefined,
    }
    if (timeRange.value) {
      params.startTime = dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
      params.endTime = dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
    }
    const result = await fetchSubscriptions(params)
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '订阅列表加载失败')
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

function resetQuery(): void {
  query.email = ''
  timeRange.value = null
  query.page = 1
  void load()
}

function quickRange(days: number): void {
  const end = dayjs().endOf('day').valueOf()
  const start = dayjs().subtract(days - 1, 'day').startOf('day').valueOf()
  timeRange.value = [start, end]
  search()
}

async function handleDelete(row: SubscriptionVo): Promise<void> {
  try {
    await deleteSubscription(row.id)
    message.success(`订阅「${row.email}」已删除`)
    // 删掉当前页最后一条时回退一页，避免停在空页
    if (rows.value.length === 1 && (query.page ?? 1) > 1) query.page = (query.page ?? 1) - 1
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '删除失败')
  }
}

const columns = computed<DataTableColumns<SubscriptionVo>>(() => [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '邮箱',
    key: 'email',
    minWidth: 200,
    render: (row) => h('span', { class: 'text-[13px] font-medium' }, row.email),
  },
  {
    title: '留言',
    key: 'message',
    width: 260,
    render: (row) => {
      const text = row.message?.trim()
      if (!text) return h('span', { class: 'text-[12.5px] opacity-50' }, '-')
      // 超长留言单行截断（宽度由列宽决定），鼠标悬浮用原生 title 显示全文
      return h('div', { class: 'truncate text-[12.5px] opacity-80', title: text }, text)
    },
  },
  {
    title: '来源 IP',
    key: 'sourceIp',
    width: 160,
    render: (row) => h('span', { class: 'font-mono text-[12.5px] opacity-80' }, row.sourceIp || '-'),
  },
  {
    title: '订阅时间',
    key: 'createdAt',
    width: 180,
    render: (row) => h('span', { class: 'text-[12.5px] opacity-80' }, formatDateTime(row.createdAt)),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => [
          h(
            NPopconfirm,
            {
              onPositiveClick: () => void handleDelete(row),
              positiveText: '确认删除',
              negativeText: '取消',
            },
            {
              trigger: withDirectives(
                h(NButton, { size: 'tiny', quaternary: true, type: 'error' }, { default: () => '删除' }),
                [[permissionDirective, PERMISSIONS.SYSTEM_SUBSCRIBE_DELETE]],
              ),
              default: () => `确认删除订阅「${row.email}」？删除后无法恢复。`,
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
    <NAlert type="info" :bordered="false" size="small">
      这里只展示前台通过图形验证码提交的订阅记录；删除仅影响本站记录，不会向对方发送退订邮件。
    </NAlert>

    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center gap-2">
        <NInput
          v-model:value="query.email"
          placeholder="邮箱"
          clearable
          class="w-[200px]"
          @keyup.enter="search"
        />
        <NDatePicker v-model:value="timeRange" type="datetimerange" clearable class="w-[360px]" />
        <NButton type="primary" size="small" @click="search">查询</NButton>
        <NButton size="small" @click="resetQuery">重置</NButton>
        <div class="flex items-center gap-1 text-[12.5px]">
          <span class="opacity-60">快捷：</span>
          <NButton size="tiny" quaternary @click="quickRange(1)">今天</NButton>
          <NButton size="tiny" quaternary @click="quickRange(7)">近 7 天</NButton>
          <NButton size="tiny" quaternary @click="quickRange(30)">近 30 天</NButton>
        </div>
      </div>
    </NCard>

    <NCard :bordered="false" size="small">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: SubscriptionVo) => row.id"
        :scroll-x="1000"
        remote
        size="small"
      />
    </NCard>
  </div>
</template>
