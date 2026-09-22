<script setup lang="ts">
/** 登录日志：记录所有登录尝试（成功与失败），仅超级管理员可查询 */
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
import type { LoginLogQuery, LoginLogVo } from '@sanmuzi/contracts'
import { LOGIN_RESULT_TEXT, LoginResult } from '@sanmuzi/contracts'
import { fetchLoginLogs } from '@/api/log'
import { BizError } from '@/api/request'
import { message } from '@/utils/discrete'
import { dayjs, formatDateTime } from '@/utils/format'

const rows = ref<LoginLogVo[]>([])
const loading = ref(false)
const total = ref(0)
/** 时间区间（毫秒时间戳），NDatePicker 的 range 模式绑定值 */
const timeRange = ref<[number, number] | null>(null)

const query = reactive<LoginLogQuery>({
  page: 1,
  pageSize: 10,
  username: '',
  loginResult: undefined,
})

const resultOptions = [
  { label: '全部结果', value: undefined },
  { label: LOGIN_RESULT_TEXT[LoginResult.SUCCESS], value: LoginResult.SUCCESS },
  { label: LOGIN_RESULT_TEXT[LoginResult.FAIL], value: LoginResult.FAIL },
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

async function load(): Promise<void> {
  loading.value = true
  try {
    const params: LoginLogQuery = {
      page: query.page,
      pageSize: query.pageSize,
      username: query.username || undefined,
      loginResult: query.loginResult,
    }
    if (timeRange.value) {
      params.startTime = dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
      params.endTime = dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
    }
    const result = await fetchLoginLogs(params)
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '登录日志加载失败')
  } finally {
    loading.value = false
  }
}

function search(): void {
  query.page = 1
  void load()
}

function resetQuery(): void {
  query.username = ''
  query.loginResult = undefined
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

const columns = computed<DataTableColumns<LoginLogVo>>(() => [
  { title: 'ID', key: 'id', width: 80 },
  {
    title: '登录时间',
    key: 'loginTime',
    width: 180,
    render: (row) => h('span', { class: 'text-[13px]' }, formatDateTime(row.loginTime)),
  },
  {
    title: '账号',
    key: 'username',
    width: 140,
    render: (row) => h('span', { class: 'text-[13px] font-medium' }, row.username || `#${row.adminUserId}`),
  },
  {
    title: '姓名',
    key: 'realName',
    width: 130,
    render: (row) => h('span', { class: 'text-[13px] opacity-80' }, row.realName ?? '-'),
  },
  {
    title: '登录 IP',
    key: 'loginIp',
    minWidth: 160,
    render: (row) => h('span', { class: 'font-mono text-[12.5px] opacity-80' }, row.loginIp),
  },
  {
    title: '结果',
    key: 'loginResult',
    width: 110,
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          bordered: false,
          type: row.loginResult === LoginResult.SUCCESS ? 'success' : 'error',
        },
        { default: () => LOGIN_RESULT_TEXT[row.loginResult] ?? '未知' },
      ),
  },
])

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center gap-2">
        <NInput v-model:value="query.username" placeholder="账号" clearable class="w-[150px]" @keyup.enter="search" />
        <NSelect
          v-model:value="query.loginResult"
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
        :row-key="(row: LoginLogVo) => row.id"
        :scroll-x="900"
        remote
        size="small"
      />
    </NCard>
  </div>
</template>
