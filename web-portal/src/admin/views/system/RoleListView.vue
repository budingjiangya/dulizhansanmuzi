<script setup lang="ts">
/** 角色权限管理：权限项分组勾选，权限码来自共享契约，与后端守卫使用同一份定义 */
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  type DataTableColumns,
} from 'naive-ui'
import type { AdminRoleVo, CreateAdminRoleDto } from '@sanmuzi/contracts'
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '@sanmuzi/contracts'
import { createRole, deleteRole, fetchRoles, updateRole } from '@/admin/api/role'
import { BizError } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import { formatDateTime } from '@/admin/utils/format'

const rows = ref<AdminRoleVo[]>([])
const loading = ref(false)

const modalVisible = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const submitting = ref(false)
const editId = ref<number | null>(null)

const form = reactive<CreateAdminRoleDto>({ roleName: '', permissions: [] })

/** 权限码 → 中文名，用于表格里展示权限摘要 */
const permissionLabelMap = new Map(
  PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => [item.code as string, item.label])),
)

const allSelected = computed(() => form.permissions.length === ALL_PERMISSIONS.length)

async function load(): Promise<void> {
  loading.value = true
  try {
    rows.value = await fetchRoles()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '角色列表加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  modalMode.value = 'create'
  editId.value = null
  form.roleName = ''
  form.permissions = []
  modalVisible.value = true
}

function openEdit(row: AdminRoleVo): void {
  modalMode.value = 'edit'
  editId.value = row.id
  form.roleName = row.roleName
  form.permissions = [...row.permissions]
  modalVisible.value = true
}

function toggleAll(value: boolean): void {
  form.permissions = value ? [...ALL_PERMISSIONS] : []
}

function toggleGroup(codes: string[], value: boolean): void {
  const set = new Set(form.permissions)
  if (value) codes.forEach((code) => set.add(code))
  else codes.forEach((code) => set.delete(code))
  form.permissions = [...set]
}

async function submitForm(): Promise<void> {
  if (!form.roleName.trim()) {
    message.warning('请输入角色名称')
    return
  }
  if (!form.permissions.length) {
    message.warning('请至少勾选一项权限')
    return
  }
  submitting.value = true
  try {
    if (modalMode.value === 'create') {
      await createRole({ roleName: form.roleName.trim(), permissions: [...form.permissions] })
      message.success('角色已创建')
    } else if (editId.value !== null) {
      await updateRole(editId.value, { roleName: form.roleName.trim(), permissions: [...form.permissions] })
      message.success('角色权限已更新，相关账号下次请求即生效')
    }
    modalVisible.value = false
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: AdminRoleVo): Promise<void> {
  try {
    await deleteRole(row.id)
    message.success('角色已删除')
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '删除失败')
  }
}

const columns = computed<DataTableColumns<AdminRoleVo>>(() => [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '角色名称',
    key: 'roleName',
    width: 160,
    render: (row) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', { class: 'text-[13.5px] font-medium' }, row.roleName),
        row.id <= 2
          ? h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, { default: () => '内置' })
          : null,
      ]),
  },
  {
    title: '权限',
    key: 'permissions',
    minWidth: 340,
    render: (row) =>
      h(
        'div',
        { class: 'flex flex-wrap gap-1 py-1' },
        row.permissions.length
          ? row.permissions.map((code) =>
              h(
                NTag,
                { size: 'tiny', bordered: false, key: code },
                { default: () => permissionLabelMap.get(code) ?? code },
              ),
            )
          : [h('span', { class: 'text-[12px] opacity-60' }, '无')],
      ),
  },
  {
    title: '账号数',
    key: 'userCount',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.userCount > 0 ? 'info' : 'default' },
        { default: () => `${row.userCount}` },
      ),
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    width: 170,
    render: (row) => h('span', { class: 'text-[12.5px] opacity-80' }, formatDateTime(row.updatedAt)),
  },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 4, wrap: false }, {
        default: () => [
          h(
            NButton,
            { size: 'tiny', quaternary: true, type: 'primary', onClick: () => openEdit(row) },
            { default: () => '编辑权限' },
          ),
          h(
            NPopconfirm,
            {
              onPositiveClick: () => void handleDelete(row),
              positiveText: '确认删除',
              negativeText: '取消',
              disabled: row.id <= 2,
            },
            {
              trigger: h(
                NButton,
                { size: 'tiny', quaternary: true, type: 'error', disabled: row.id <= 2 },
                { default: () => '删除' },
              ),
              default: () => `确认删除角色「${row.roleName}」？`,
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
      权限变更不需要重新登录：后端每次请求都会实时读取角色权限，旧 Token 不会保留已回收的权限。
    </NAlert>

    <NCard :bordered="false" size="small">
      <div class="flex items-center justify-between">
        <span class="text-[13px] opacity-70">共 {{ rows.length }} 个角色</span>
        <NButton type="primary" size="small" @click="openCreate">新增角色</NButton>
      </div>
    </NCard>

    <NCard :bordered="false" size="small">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: AdminRoleVo) => row.id"
        :scroll-x="1000"
        size="small"
      />
    </NCard>

    <NModal
      v-model:show="modalVisible"
      preset="card"
      :title="modalMode === 'create' ? '新增角色' : `编辑角色 · ${form.roleName}`"
      class="max-w-[620px]"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="角色名称">
          <NInput v-model:value="form.roleName" placeholder="例如：内容编辑" maxlength="64" />
        </NFormItem>
      </NForm>

      <div class="mb-3 flex items-center justify-between">
        <span class="text-[13px] font-medium">权限配置</span>
        <NCheckbox :checked="allSelected" @update:checked="toggleAll">全选（{{ ALL_PERMISSIONS.length }} 项）</NCheckbox>
      </div>

      <NCheckboxGroup v-model:value="form.permissions" class="space-y-3">
        <div v-for="group in PERMISSION_GROUPS" :key="group.key" class="rounded border border-black/10 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[13px] font-medium">{{ group.label }}</span>
            <NCheckbox
              :checked="group.items.every((item) => form.permissions.includes(item.code))"
              @update:checked="(value: boolean) => toggleGroup(group.items.map((item) => item.code), value)"
            >
              本组全选
            </NCheckbox>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-2">
            <NCheckbox v-for="item in group.items" :key="item.code" :value="item.code">
              {{ item.label }}
              <span class="ml-1 text-[11px] opacity-50">{{ item.code }}</span>
            </NCheckbox>
          </div>
        </div>
      </NCheckboxGroup>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="modalVisible = false">取消</NButton>
          <NButton size="small" type="primary" :loading="submitting" @click="submitForm">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
