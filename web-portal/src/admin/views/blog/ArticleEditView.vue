<script setup lang="ts">
/**
 * 文章新建 / 编辑页（同一路由组件，按是否存在 :id 区分模式）
 * 分三块：基础信息、封面模式（多图轮播 / 视频悬浮预览）、富文本正文
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import type { CoverTypeValue } from '@sanmuzi/contracts'
import { COVER_TYPE_TEXT, CoverType } from '@sanmuzi/contracts'
import { createArticle, fetchArticleDetail, updateArticle } from '@/admin/api/article'
import { fetchCategories } from '@/admin/api/category'
import { BizError } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import ImageUploader from '@/components/ImageUploader.vue'
import VideoUploader from '@/components/VideoUploader.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

const route = useRoute()
const router = useRouter()

const articleId = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' && raw ? raw : ''
})
const isEdit = computed(() => Boolean(articleId.value))

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const submitting = ref(false)
const errorText = ref('')

/** 表单内部的强类型模型：可选字段在这里收敛为必填，避免上传组件拿到 undefined */
interface ArticleFormModel {
  title: string
  shortDesc: string
  coverType: CoverTypeValue
  coverImages: string[]
  coverVideo: string | null
  coverVideoFrame: string | null
  content: string
  isRecommend: boolean
  isPublish: boolean
  sort: number
  /** 所属分类 id，未分类为 null */
  categoryId: number | null
}

const form = reactive<ArticleFormModel>({
  title: '',
  shortDesc: '',
  coverType: CoverType.IMAGE,
  coverImages: [],
  coverVideo: null,
  coverVideoFrame: null,
  content: '',
  isRecommend: true,
  isPublish: true,
  sort: 0,
  categoryId: null,
})

const videoDuration = ref<number | null>(null)
const videoResolution = ref<string | null>(null)

/** 分类下拉选项：来自后台分类接口（全量数组） */
const categoryOptions = ref<Array<{ label: string; value: number }>>([])

const rules: FormRules = {
  title: [
    { required: true, message: '请输入文章标题', trigger: ['input', 'blur'] },
    { max: 255, message: '标题不能超过 255 个字符', trigger: ['input', 'blur'] },
  ],
  shortDesc: [
    { required: true, message: '请输入首页展示摘要', trigger: ['input', 'blur'] },
    { max: 500, message: '摘要不能超过 500 个字符', trigger: ['input', 'blur'] },
  ],
}

const isImageMode = computed(() => form.coverType === CoverType.IMAGE)

function switchCoverType(value: CoverTypeValue): void {
  form.coverType = value
}

async function loadDetail(): Promise<void> {
  if (!isEdit.value) return
  loading.value = true
  errorText.value = ''
  try {
    const detail = await fetchArticleDetail(articleId.value)
    form.title = detail.title
    form.shortDesc = detail.shortDesc
    form.coverType = detail.coverType
    form.coverImages = detail.coverImages ?? []
    form.coverVideo = detail.coverVideo
    form.coverVideoFrame = detail.coverVideoFrame
    form.content = detail.content
    form.isRecommend = detail.isRecommend
    form.isPublish = detail.isPublish
    form.sort = detail.sort
    // 详情返回分类 id，未分类为 null，正好与 NSelect 的 clearable 空值一致
    form.categoryId = detail.categoryId
  } catch (error) {
    errorText.value = error instanceof BizError ? error.message : '文章详情加载失败'
  } finally {
    loading.value = false
  }
}

/** 加载分类下拉选项，失败时置空并提示，不阻塞文章编辑 */
async function loadCategories(): Promise<void> {
  try {
    const list = await fetchCategories()
    categoryOptions.value = list.map((item) => ({ label: item.name, value: item.id }))
  } catch (error) {
    categoryOptions.value = []
    message.error(error instanceof BizError ? error.message : '分类列表加载失败')
  }
}

/** 提交前业务校验：封面字段与正文不能为空 */
function validateBusiness(): string {
  if (!form.content || form.content === '<p><br></p>') return '请填写正文内容'
  if (isImageMode.value) {
    if (!form.coverImages?.length) return '多图轮播模式至少需要 1 张封面图'
  } else if (!form.coverVideo) {
    return '视频悬浮预览模式需要先上传短视频'
  }
  return ''
}

async function handleSubmit(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  const businessError = validateBusiness()
  if (businessError) {
    message.warning(businessError)
    return
  }

  submitting.value = true
  try {
    if (isEdit.value) {
      await updateArticle(articleId.value, { ...form })
      message.success('文章已保存')
    } else {
      await createArticle({ ...form })
      message.success('文章已创建')
    }
    await router.push({ name: 'admin-blog-article-list' })
  } catch (error) {
    message.error(error instanceof BizError ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

function goBack(): void {
  void router.push({ name: 'admin-blog-article-list' })
}

onMounted(async () => {
  await Promise.all([loadDetail(), loadCategories()])
})
</script>

<template>
  <NSpin :show="loading">
    <div class="space-y-3">
      <NCard :bordered="false" size="small">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h2 class="text-[16px] font-semibold">{{ isEdit ? '编辑文章' : '新建文章' }}</h2>
            <NTag v-if="isEdit" size="small" :bordered="false">ID {{ articleId }}</NTag>
            <NTag size="small" :bordered="false" type="info">{{ COVER_TYPE_TEXT[form.coverType] }}</NTag>
          </div>
          <NSpace size="small">
            <NButton size="small" @click="goBack">返回列表</NButton>
            <NButton size="small" type="primary" :loading="submitting" @click="handleSubmit">
              {{ isEdit ? '保存修改' : '创建文章' }}
            </NButton>
          </NSpace>
        </div>
      </NCard>

      <NAlert v-if="errorText" type="error" :bordered="false">{{ errorText }}</NAlert>

      <NForm ref="formRef" :model="form" :rules="rules" label-placement="top" require-mark-placement="right-hanging">
        <div class="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
          <!-- 左：内容主体 -->
          <div class="space-y-3">
            <NCard :bordered="false" size="small" title="基础信息">
              <NFormItem label="文章标题" path="title">
                <NInput v-model:value="form.title" placeholder="例如：这块 27 寸 4K 显示器，我用了两年" maxlength="80" show-count />
              </NFormItem>
              <NFormItem label="首页展示摘要" path="shortDesc">
                <NInput
                  v-model:value="form.shortDesc"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  placeholder="一句话说清推荐理由，会显示在首页卡片标题下方"
                  maxlength="200"
                  show-count
                />
              </NFormItem>
            </NCard>

            <NCard :bordered="false" size="small" title="正文（富文本）">
              <RichTextEditor v-model="form.content" :height="480" />
              <p class="mt-2 text-[12px] opacity-60">
                正文支持标题、列表、引用、表格、图片与视频；图片与视频会直接上传到对象存储。
              </p>
            </NCard>
          </div>

          <!-- 右：封面与发布设置 -->
          <div class="space-y-3">
            <NCard :bordered="false" size="small" title="封面模式">
              <NRadioGroup :value="form.coverType" size="small" @update:value="switchCoverType">
                <NRadioButton :value="CoverType.IMAGE">多图轮播</NRadioButton>
                <NRadioButton :value="CoverType.VIDEO">视频悬浮预览</NRadioButton>
              </NRadioGroup>

              <p class="mt-3 mb-3 text-[12px] leading-relaxed opacity-65">
                <template v-if="isImageMode">
                  前台默认展示第一张，鼠标悬浮后自动轮切全部图片，移开后回到第一张。
                </template>
                <template v-else>
                  前台默认只展示后端抽帧的静态图，鼠标悬浮才加载并静音播放短视频，避免首页预加载大量视频。
                </template>
              </p>

              <ImageUploader v-if="isImageMode" v-model="form.coverImages" />
              <VideoUploader
                v-else
                v-model:video-url="form.coverVideo"
                v-model:frame-url="form.coverVideoFrame"
                v-model:duration="videoDuration"
                v-model:resolution="videoResolution"
              />
            </NCard>

            <NCard :bordered="false" size="small" title="发布设置">
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-[13px] font-medium">首页推荐</p>
                    <p class="text-[12px] opacity-60">开启后才会出现在前台首页卡片列表</p>
                  </div>
                  <NSwitch v-model:value="form.isRecommend" />
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-[13px] font-medium">立即上架</p>
                    <p class="text-[12px] opacity-60">关闭则保存为草稿，前台不可访问</p>
                  </div>
                  <NSwitch v-model:value="form.isPublish" />
                </div>
                <div>
                  <p class="mb-1.5 text-[13px] font-medium">分类</p>
                  <NSelect
                    v-model:value="form.categoryId"
                    :options="categoryOptions"
                    placeholder="未分类"
                    clearable
                    class="w-full"
                  />
                  <p class="mt-1.5 text-[12px] opacity-60">前台分类页按此归类；留空表示未分类</p>
                </div>
                <div>
                  <p class="mb-1.5 text-[13px] font-medium">排序权重</p>
                  <NInputNumber v-model:value="form.sort" :min="0" :max="99999" class="w-full" />
                  <p class="mt-1.5 text-[12px] opacity-60">数字越大越靠前，仅影响首页推荐列表的顺序</p>
                </div>
              </div>
            </NCard>
          </div>
        </div>
      </NForm>
    </div>
  </NSpin>
</template>
