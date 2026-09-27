<script setup lang="ts">
/**
 * 操作日志页（后台）
 * 后台写操作的审计记录：时间 / 操作人 / 模块 / 动作 / 目标 / IP / 结果 / 失败原因。
 * 支持按操作人、模块、结果与时间区间筛选，分页由后端完成（remote）。
 */
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NDatePicker,

  NInput,
  NSelect,
  NTag,
  type DataTableColumns,
  type PaginationProps,
} from 'naive-ui'
import type { OperationLogVo, QueryOperationLogDto } from '@sanmuzi/contracts'
import { fetchOperationLogs } from '@/admin/api/operationLog'
import { BizError } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import { dayjs, formatDateTime } from '@/admin/utils/format'

const rows = ref<OperationLogVo[]>([])
const loading = ref(false)
const total = ref(0)
/** 时间区间（毫秒时间戳），NDatePicker 的 range 模式绑定值 */
const timeRange = ref<[number, number] | null>(null)

const query = reactive<QueryOperationLogDto>({
  page: 1,
  pageSize: 10,
  adminUsername: '',
  module: '',
  result: undefined,
})

const resultOptions = [
  { label: '全部结果', value: undefined },
  { label: '成功', value: 1 },
  { label: '失败', value: 0 },
]

const pagination = computed<PaginationProps>(() => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 10,
  itemCount: total.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  prefix: ({ itemCount }) => `共 ${itemCount} 条记录`,
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

/** 目标展示：targetType#targetId，两者都为空时显示 - */
function formatTarget(row: OperationLogVo): string {
  const id = row.targetId === null || row.targetId === undefined ? '' : `#${row.targetId}`
  const text = `${row.targetType ?? ''}${id}`
  return text || '-'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const params: QueryOperationLogDto = {
      page: query.page,
      pageSize: query.pageSize,
      adminUsername: query.adminUsername?.trim() || undefined,
      module: query.module?.trim() || undefined,
      result: query.result,
    }
    if (timeRange.value) {
      params.startTime = dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
      params.endTime = dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
    }
    const result = await fetchOperationLogs(params)
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '操作日志加载失败')
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

function resetQuery(): void {
  query.adminUsername = ''
  query.module = ''
  query.result = undefined
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

const columns = computed<DataTableColumns<OperationLogVo>>(() => [
  {
    title: '时间',
    key: 'createdAt',
    width: 180,
    render: (row) => h('span', { class: 'text-[12.5px]' }, formatDateTime(row.createdAt)),
  },
  {
    title: '操作人',
    key: 'adminUsername',
    width: 130,
    render: (row) =>
      h('span', { class: 'text-[13px] font-medium' }, row.adminUsername || `#${row.adminUserId ?? '-'}`),
  },
  {
    title: '模块',
    key: 'module',
    width: 150,
    render: (row) => h('span', { class: 'font-mono text-[12.5px] opacity-80' }, row.module || '-'),
  },
  {
    title: '动作',
    key: 'action',
    width: 110,
    render: (row) => h('span', { class: 'font-mono text-[12.5px] opacity-80' }, row.action || '-'),
  },
  {
    title: '目标',
    key: 'target',
    minWidth: 160,
    // 悬浮显示后端写入的操作摘要（summary），便于核对这一次改的是哪条数据
    render: (row) =>
      h('span', { class: 'font-mono text-[12.5px] opacity-80', title: row.summary ?? undefined }, formatTarget(row)),
  },
  {
    title: 'IP',
    key: 'operationIp',
    width: 150,
    render: (row) => h('span', { class: 'font-mono text-[12.5px] opacity-80' }, row.operationIp || '-'),
  },
  {
    title: '结果',
    key: 'result',
    width: 96,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.result === 1 ? 'success' : 'error' },
        { default: () => (row.result === 1 ? '成功' : '失败') },
      ),
  },
  {
    title: '失败原因',
    key: 'errorMessage',
    width: 300,
    render: (row) => {
      const text = row.errorMessage?.trim()
      // 成功的记录没有失败原因，统一显示占位符
      if (row.result === 1 || !text) return h('span', { class: 'text-[12.5px] opacity-50' }, '-')
      // 报错信息可能很长：单行截断，悬浮用原生 title 看全文
      return h('div', { class: 'truncate text-[12.5px] text-red-500', title: text }, text)
    },
  },
])

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center gap-2">
        <NInput
          v-model:value="query.adminUsername"
          placeholder="操作人账号"
          clearable
          class="w-[160px]"
          @keyup.enter="search"
        />
        <NInput
          v-model:value="query.module"
          placeholder="模块，如 blog:category"
          clearable
          class="w-[200px]"
          @keyup.enter="search"
        />
        <NSelect
          v-model:value="query.result"
          :options="resultOptions"
          class="w-[140px]"
          :consistent-menu-width="false"
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
        :row-key="(row: OperationLogVo) => row.id"
        :scroll-x="1320"
        remote
        size="small"
      />
    </NCard>
  </div>
</template>
