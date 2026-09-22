<script setup lang="ts">
/** 管理员账号管理：仅超级管理员可访问（后端接口同样校验权限码） */
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  type DataTableColumns,
  type FormInst,
  type FormRules,
  type PaginationProps,
} from 'naive-ui'
import type { AdminUserQuery, AdminUserVo, CreateAdminUserDto, UpdateAdminUserDto } from '@sanmuzi/contracts'
import { ADMIN_STATUS_TEXT, AdminStatus, PERMISSIONS } from '@sanmuzi/contracts'
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from '@/admin/api/user'
import { fetchRoles } from '@/admin/api/role'
import { BizError } from '@/admin/api/request'
import { useUserStore } from '@/admin/stores/user'
import { message } from '@/admin/utils/discrete'
import { formatDateTime } from '@/admin/utils/format'

const userStore = useUserStore()

const rows = ref<AdminUserVo[]>([])
const loading = ref(false)
const total = ref(0)
const roleOptions = ref<Array<{ label: string; value: number }>>([])

const query = reactive<AdminUserQuery>({
  page: 1,
  pageSize: 10,
  username: '',
  realName: '',
  roleId: undefined,
  status: undefined,
})

const statusFilterOptions = [
  { label: '全部状态', value: undefined },
  { label: ADMIN_STATUS_TEXT[AdminStatus.ENABLED], value: AdminStatus.ENABLED },
  { label: ADMIN_STATUS_TEXT[AdminStatus.DISABLED], value: AdminStatus.DISABLED },
]

const statusFormOptions = [
  { label: ADMIN_STATUS_TEXT[AdminStatus.ENABLED], value: AdminStatus.ENABLED },
  { label: ADMIN_STATUS_TEXT[AdminStatus.DISABLED], value: AdminStatus.DISABLED },
]

const pagination = computed<PaginationProps>(() => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 10,
  itemCount: total.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  prefix: ({ itemCount }) => `共 ${itemCount} 个账号`,
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

/* ----------------------------- 新增 / 编辑 ----------------------------- */

const modalVisible = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const editId = ref<number | null>(null)

const form = reactive<CreateAdminUserDto>({
  username: '',
  password: '',
  realName: '',
  roleId: 2,
  status: AdminStatus.ENABLED,
})

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入登录账号', trigger: ['input', 'blur'] },
    { min: 3, max: 64, message: '账号长度 3-64 位', trigger: ['input', 'blur'] },
  ],
  realName: [{ required: true, message: '请输入姓名', trigger: ['input', 'blur'] }],
  roleId: [{ required: true, type: 'number', message: '请选择角色', trigger: ['change', 'blur'] }],
  password:
    modalMode.value === 'create'
      ? [
          { required: true, message: '请输入初始密码', trigger: ['input', 'blur'] },
          { min: 6, message: '密码至少 6 位', trigger: ['input', 'blur'] },
        ]
      : [],
}))

function openCreate(): void {
  modalMode.value = 'create'
  editId.value = null
  Object.assign(form, {
    username: '',
    password: '',
    realName: '',
    roleId: roleOptions.value[1]?.value ?? roleOptions.value[0]?.value ?? 2,
    status: AdminStatus.ENABLED,
  })
  modalVisible.value = true
}

function openEdit(row: AdminUserVo): void {
  modalMode.value = 'edit'
  editId.value = row.id
  Object.assign(form, {
    username: row.username,
    password: '',
    realName: row.realName,
    roleId: row.roleId,
    status: row.status,
  })
  modalVisible.value = true
}

async function submitForm(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    if (modalMode.value === 'create') {
      await createAdminUser({ ...form })
      message.success('账号创建成功')
    } else if (editId.value !== null) {
      const payload: UpdateAdminUserDto = {
        realName: form.realName,
        roleId: form.roleId,
        status: form.status,
      }
      await updateAdminUser(editId.value, payload)
      message.success('账号信息已更新')
    }
    modalVisible.value = false
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

/* ----------------------------- 重置密码 ----------------------------- */

const resetVisible = ref(false)
const resetTarget = ref<AdminUserVo | null>(null)
const resetPassword = ref('')
const resetting = ref(false)

function openReset(row: AdminUserVo): void {
  resetTarget.value = row
  resetPassword.value = ''
  resetVisible.value = true
}

async function submitReset(): Promise<void> {
  if (!resetTarget.value) return
  if (resetPassword.value.length < 6) {
    message.warning('新密码至少 6 位')
    return
  }
  resetting.value = true
  try {
    await resetAdminUserPassword(resetTarget.value.id, { newPassword: resetPassword.value })
    message.success(`已重置 ${resetTarget.value.username} 的密码`)
    resetVisible.value = false
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '重置失败')
  } finally {
    resetting.value = false
  }
}

/* ----------------------------- 数据加载 ----------------------------- */

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await fetchAdminUsers({
      page: query.page,
      pageSize: query.pageSize,
      username: query.username || undefined,
      realName: query.realName || undefined,
      roleId: query.roleId,
      status: query.status,
    })
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '账号列表加载失败')
  } finally {
    loading.value = false
  }
}

async function loadRoles(): Promise<void> {
  try {
    const roles = await fetchRoles()
    roleOptions.value = roles.map((role) => ({ label: role.roleName, value: role.id }))
  } catch {
    roleOptions.value = []
  }
}

async function handleDelete(row: AdminUserVo): Promise<void> {
  try {
    await deleteAdminUser(row.id)
    message.success('账号已删除')
    if (rows.value.length === 1 && (query.page ?? 1) > 1) query.page = (query.page ?? 1) - 1
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '删除失败')
  }
}

function search(): void {
  query.page = 1
  void load()
}

function resetQuery(): void {
  query.username = ''
  query.realName = ''
  query.roleId = undefined
  query.status = undefined
  query.page = 1
  void load()
}

const columns = computed<DataTableColumns<AdminUserVo>>(() => [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '账号',
    key: 'username',
    minWidth: 150,
    render: (row) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', { class: 'text-[13.5px] font-medium' }, row.username),
        row.id === userStore.userInfo?.id
          ? h(NTag, { size: 'tiny', bordered: false, type: 'success' }, { default: () => '当前账号' })
          : null,
      ]),
  },
  { title: '姓名', key: 'realName', width: 130 },
  {
    title: '角色',
    key: 'roleName',
    width: 130,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.roleId === 1 ? 'error' : 'info' },
        { default: () => row.roleName },
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 96,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.status === AdminStatus.ENABLED ? 'success' : 'default' },
        { default: () => ADMIN_STATUS_TEXT[row.status] ?? '-' },
      ),
  },
  {
    title: '最后登录',
    key: 'lastLoginAt',
    width: 170,
    render: (row) => h('span', { class: 'text-[12.5px] opacity-80' }, formatDateTime(row.lastLoginAt)),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 170,
    render: (row) => h('span', { class: 'text-[12.5px] opacity-80' }, formatDateTime(row.createdAt)),
  },
  {
    title: '操作',
    key: 'actions',
    width: 190,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => [
          h(
            NButton,
            { size: 'tiny', quaternary: true, type: 'primary', onClick: () => openEdit(row) },
            { default: () => '编辑' },
          ),
          h(
            NButton,
            { size: 'tiny', quaternary: true, onClick: () => openReset(row) },
            { default: () => '重置密码' },
          ),
          h(
            NPopconfirm,
            {
              onPositiveClick: () => void handleDelete(row),
              positiveText: '确认删除',
              negativeText: '取消',
              disabled: row.id === userStore.userInfo?.id,
            },
            {
              trigger: h(
                NButton,
                {
                  size: 'tiny',
                  quaternary: true,
                  type: 'error',
                  disabled: row.id === userStore.userInfo?.id,
                },
                { default: () => '删除' },
              ),
              default: () => `确认删除账号「${row.username}」？其登录日志会一并移除。`,
            },
          ),
        ],
      }),
  },
])

onMounted(async () => {
  await loadRoles()
  await load()
})
</script>

<template>
  <div class="space-y-3">
    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center gap-2">
        <NInput v-model:value="query.username" placeholder="账号" clearable class="w-[160px]" @keyup.enter="search" />
        <NInput v-model:value="query.realName" placeholder="姓名" clearable class="w-[160px]" @keyup.enter="search" />
        <NSelect
          v-model:value="query.roleId"
          :options="roleOptions"
          placeholder="全部角色"
          clearable
          class="w-[160px]"
        />
        <NSelect
          v-model:value="query.status"
          :options="statusFilterOptions"
          class="w-[140px]"
          :consistent-menu-width="false"
        />
        <NButton type="primary" size="small" @click="search">查询</NButton>
        <NButton size="small" @click="resetQuery">重置</NButton>
        <div class="ml-auto">
          <NButton
            v-permission="PERMISSIONS.SYSTEM_USER_CREATE"
            type="primary"
            size="small"
            @click="openCreate"
          >
            新增账号
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
        :row-key="(row: AdminUserVo) => row.id"
        :scroll-x="1180"
        remote
        size="small"
      />
    </NCard>

    <!-- 新增 / 编辑账号 -->
    <NModal
      v-model:show="modalVisible"
      preset="card"
      :title="modalMode === 'create' ? '新增管理员账号' : `编辑账号 · ${form.username}`"
      class="max-w-[520px]"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="form" :rules="rules" label-placement="top">
        <NFormItem label="登录账号" path="username">
          <NInput
            v-model:value="form.username"
            :disabled="modalMode === 'edit'"
            placeholder="3-64 位，创建后不可修改"
          />
        </NFormItem>
        <NFormItem v-if="modalMode === 'create'" label="初始密码" path="password">
          <NInput v-model:value="form.password" type="password" show-password-on="click" placeholder="至少 6 位" />
        </NFormItem>
        <NFormItem label="姓名" path="realName">
          <NInput v-model:value="form.realName" placeholder="用于后台显示与日志记录" />
        </NFormItem>
        <NFormItem label="角色" path="roleId">
          <NSelect v-model:value="form.roleId" :options="roleOptions" placeholder="请选择角色" />
        </NFormItem>
        <NFormItem label="状态" path="status">
          <NSelect v-model:value="form.status" :options="statusFormOptions" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="modalVisible = false">取消</NButton>
          <NButton size="small" type="primary" :loading="submitting" @click="submitForm">保存</NButton>
        </div>
      </template>
    </NModal>

    <!-- 重置密码 -->
    <NModal
      v-model:show="resetVisible"
      preset="card"
      :title="`重置密码 · ${resetTarget?.username ?? ''}`"
      class="max-w-[440px]"
      :mask-closable="false"
    >
      <p class="mb-4 text-[13px] leading-relaxed opacity-70">
        重置后该账号的旧密码立即失效，后端会以 bcrypt 重新加密存储。请通过安全渠道告知使用人。
      </p>
      <NInput
        v-model:value="resetPassword"
        type="password"
        show-password-on="click"
        placeholder="新密码，至少 6 位"
        @keyup.enter="submitReset"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="resetVisible = false">取消</NButton>
          <NButton size="small" type="primary" :loading="resetting" @click="submitReset">确认重置</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
