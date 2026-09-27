<script setup lang="ts">
/**
 * 分类管理页（后台）
 * 接口返回的是全量数组（不分页），直接铺到 NDataTable；
 * 新增 / 编辑走弹窗表单，删除走 NPopconfirm，按钮按分类权限码显隐。
 * 删除时若分类下仍有文章，后端返回 40900，message 里带「还有 N 篇文章」，这里原样提示。
 */
import { computed, h, onMounted, reactive, ref, resolveDirective, withDirectives } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,

  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import type { CategoryVo, CreateCategoryDto } from '@sanmuzi/contracts'
import { PERMISSIONS } from '@sanmuzi/contracts'
import { createCategory, deleteCategory, fetchCategories, updateCategory } from '@/admin/api/category'
import { BizError } from '@/admin/api/request'
import { useUserStore } from '@/admin/stores/user'
import { message } from '@/admin/utils/discrete'
import { formatDateTime } from '@/admin/utils/format'

const userStore = useUserStore()

/**
 * 表格里的按钮是 render 函数渲染的，模板语法 v-permission 用不了；
 * 这里取回全局注册的同一条指令，用 withDirectives 应用，语义与 v-permission 完全一致。
 */
const permissionDirective = resolveDirective('permission')!

const rows = ref<CategoryVo[]>([])
const loading = ref(false)

const canUpdate = computed(() => userStore.hasPermission(PERMISSIONS.BLOG_CATEGORY_UPDATE))
const canDelete = computed(() => userStore.hasPermission(PERMISSIONS.BLOG_CATEGORY_DELETE))
/** 两个操作都无权限时不渲染「操作」列，避免出现一整列空白 */
const showActions = computed(() => canUpdate.value || canDelete.value)

/* ----------------------------- 新增 / 编辑 ----------------------------- */

const modalVisible = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const editId = ref<number | null>(null)

/** 表单内部强类型模型：sort 收敛为必填，避免 NInputNumber 拿到 undefined */
interface CategoryFormModel {
  name: string
  sort: number
}

const form = reactive<CategoryFormModel>({ name: '', sort: 0 })

const rules: FormRules = {
  name: [
    { required: true, message: '请输入分类名称', trigger: ['input', 'blur'] },
    { max: 64, message: '分类名称不能超过 64 个字符', trigger: ['input', 'blur'] },
  ],
}

function openCreate(): void {
  modalMode.value = 'create'
  editId.value = null
  form.name = ''
  form.sort = 0
  modalVisible.value = true
}

function openEdit(row: CategoryVo): void {
  modalMode.value = 'edit'
  editId.value = row.id
  form.name = row.name
  form.sort = row.sort
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
    const payload: CreateCategoryDto = { name: form.name.trim(), sort: form.sort ?? 0 }
    if (modalMode.value === 'create') {
      await createCategory(payload)
      message.success('分类已创建')
    } else if (editId.value !== null) {
      await updateCategory(editId.value, payload)
      message.success('分类已更新')
    }
    modalVisible.value = false
    await load()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: CategoryVo): Promise<void> {
  try {
    await deleteCategory(row.id)
    message.success(`分类「${row.name}」已删除`)
    await load()
  } catch (error) {
    // 被文章占用时后端返回 40900，message 形如「该分类下还有 N 篇文章」，原样透出
    message.error(error instanceof BizError ? error.message : '删除失败')
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    rows.value = await fetchCategories()
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '分类列表加载失败')
  } finally {
    loading.value = false
  }
}

const columns = computed<DataTableColumns<CategoryVo>>(() => {
  const list: DataTableColumns<CategoryVo> = [
    { title: 'ID', key: 'id', width: 70 },
    {
      title: '名称',
      key: 'name',
      minWidth: 180,
      render: (row) => h('span', { class: 'text-[13.5px] font-medium' }, row.name),
    },
    {
      title: '排序',
      key: 'sort',
      width: 100,
      render: (row) =>
        h(NTag, { size: 'small', bordered: false, type: 'info' }, { default: () => `${row.sort}` }),
    },
    {
      title: '文章数',
      key: 'articleCount',
      width: 110,
      render: (row) =>
        h(
          NTag,
          { size: 'small', bordered: false, type: row.articleCount > 0 ? 'success' : 'default' },
          { default: () => `${row.articleCount}` },
        ),
    },
    {
      title: '更新时间',
      key: 'updatedAt',
      width: 170,
      render: (row) => h('span', { class: 'text-[12.5px] opacity-80' }, formatDateTime(row.updatedAt)),
    },
  ]

  if (showActions.value) {
    list.push({
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (row) =>
        h(NSpace, { size: 4, wrap: false }, {
          default: () => [
            withDirectives(
              h(
                NButton,
                { size: 'tiny', quaternary: true, type: 'primary', onClick: () => openEdit(row) },
                { default: () => '编辑' },
              ),
              [[permissionDirective, PERMISSIONS.BLOG_CATEGORY_UPDATE]],
            ),
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
                  [[permissionDirective, PERMISSIONS.BLOG_CATEGORY_DELETE]],
                ),
                default: () =>
                  row.articleCount > 0
                    ? `分类「${row.name}」下还有 ${row.articleCount} 篇文章，删除会被后端拒绝，需先把文章改到其它分类。`
                    : `确认删除分类「${row.name}」？`,
              },
            ),
          ],
        }),
    })
  }

  return list
})

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <NAlert type="info" :bordered="false" size="small">
      分类删除前会校验归属文章：若分类下仍有文章，后端会拒绝删除并返回「还有 N 篇文章」，请先把这些文章改到其它分类。
    </NAlert>

    <NCard :bordered="false" size="small">
      <div class="flex items-center justify-between">
        <span class="text-[13px] opacity-70">共 {{ rows.length }} 个分类</span>
        <NButton
          v-permission="PERMISSIONS.BLOG_CATEGORY_CREATE"
          type="primary"
          size="small"
          @click="openCreate"
        >
          新增分类
        </NButton>
      </div>
    </NCard>

    <NCard :bordered="false" size="small">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: CategoryVo) => row.id"
        :scroll-x="860"
        size="small"
      />
    </NCard>

    <!-- 新增 / 编辑分类 -->
    <NModal
      v-model:show="modalVisible"
      preset="card"
      :title="modalMode === 'create' ? '新增分类' : `编辑分类 · ${form.name}`"
      class="max-w-[460px]"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="form" :rules="rules" label-placement="top">
        <NFormItem label="分类名称" path="name">
          <NInput
            v-model:value="form.name"
            placeholder="例如：数码好物"
            maxlength="64"
            show-count
            @keyup.enter="submitForm"
          />
        </NFormItem>
        <NFormItem label="排序" path="sort">
          <NInputNumber v-model:value="form.sort" :min="0" :max="99999" class="w-full" placeholder="默认 0" />
        </NFormItem>
        <p class="text-[12px] leading-relaxed opacity-60">排序数字越大越靠前，前台分类列表按该值倒序展示。</p>
      </NForm>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="modalVisible = false">取消</NButton>
          <NButton size="small" type="primary" :loading="submitting" @click="submitForm">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
