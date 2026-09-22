<script setup lang="ts">
/**
 * 富文本编辑器（WangEditor 5）
 * - 复用封装的 axios 上传接口，正文内嵌图片直接进对象存储
 * - 编辑器实例用 shallowRef 持有，避免 Vue 深度响应式代理导致光标/选区异常
 * - 组件卸载时必须 destroy，否则会全局泄漏 DOM 事件监听
 */
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { uploadImage, uploadVideo } from '@/admin/api/file'
import { BizError, resolveAssetUrl } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    height?: number
  }>(),
  { placeholder: '开始写正文，支持插入图片与视频…', height: 460 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editorRef = shallowRef()
const valueHtml = ref(props.modelValue ?? '')
const isUpdatingFromParent = ref(false)

const toolbarConfig = {
  excludeKeys: ['group-video', 'fullScreen'],
}

const editorConfig = {
  placeholder: props.placeholder,
  scroll: true,
  MENU_CONF: {
    uploadImage: {
      async customUpload(file: File, insertFn: (url: string, alt?: string, href?: string) => void) {
        try {
          const result = await uploadImage(file)
          insertFn(resolveAssetUrl(result.url), result.originalName, resolveAssetUrl(result.url))
        } catch (error) {
          message.error(error instanceof BizError ? error.message : '正文图片上传失败')
        }
      },
    },
    uploadVideo: {
      async customUpload(file: File, insertFn: (url: string, poster?: string) => void) {
        try {
          const result = await uploadVideo(file)
          insertFn(resolveAssetUrl(result.url), resolveAssetUrl(result.coverVideoFrame))
        } catch (error) {
          message.error(error instanceof BizError ? error.message : '正文视频上传失败')
        }
      },
    },
  },
}

function handleCreated(editor: unknown): void {
  editorRef.value = editor
}

function handleChange(editor: { getHtml: () => string }): void {
  if (isUpdatingFromParent.value) return
  const html = editor.getHtml()
  valueHtml.value = html
  emit('update:modelValue', html)
}

/** 父级异步回填（编辑页加载详情）时同步进编辑器 */
watch(
  () => props.modelValue,
  (next) => {
    if (next === valueHtml.value) return
    isUpdatingFromParent.value = true
    valueHtml.value = next ?? ''
    const editor = editorRef.value as { setHtml?: (html: string) => void } | undefined
    editor?.setHtml?.(next ?? '')
    window.setTimeout(() => {
      isUpdatingFromParent.value = false
    }, 0)
  },
)

onBeforeUnmount(() => {
  const editor = editorRef.value as { destroy?: () => void } | undefined
  editor?.destroy?.()
  editorRef.value = undefined
})
</script>

<template>
  <div class="overflow-hidden rounded border border-black/10">
    <Toolbar
      :editor="editorRef"
      :default-config="toolbarConfig"
      mode="default"
      class="border-b border-black/10"
    />
    <Editor
      v-model="valueHtml"
      :default-config="editorConfig"
      mode="default"
      :style="{ height: `${height}px`, overflowY: 'hidden' }"
      @on-created="handleCreated"
      @on-change="handleChange"
    />
  </div>
</template>
