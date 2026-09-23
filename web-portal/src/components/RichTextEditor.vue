<script setup lang="ts">
/**
 * 富文本编辑器（WangEditor 5）封装
 *
 * ── 为什么是这个结构（踩坑记录，改之前请读完）──────────────────────────
 *
 * 坑 1：不能用 `v-model` 绑定 Editor。
 *   wangEditor 5 的 Editor 是「非受控」组件。v-model 会在内容变化后把同一个响应式变量
 *   再写回编辑器，触发内部 slate 选区归一化，抛出
 *   `Cannot read properties of null (reading 'length')`（insertFragment）
 *   与 `Cannot resolve a DOM node from Slate node: {"text":""}`。
 *   实测：编辑页打开即报错，且正文可能被清空。
 *
 * 坑 2：`onCreated` 回调里立刻调用 `editor.setHtml()` 也不可靠。
 *   此时 wangEditor 内部 state 尚未装配完成（工具栏也才刚创建），
 *   setHtml 会抛 `Cannot read properties of null (reading 'length')`。
 *
 * 坑 3：给 Editor 换 `key` 重建时，如果不一起重建 Toolbar，
 *   会报 `Repeated create toolbar by selector '[object HTMLDivElement]'`。
 *
 * ── 最终方案 ────────────────────────────────────────────────────────
 * 不手动调用 setHtml，改用 wangEditor 官方支持的 `defaultHtml` + `key` 重建：
 *   - 编辑器第一次挂载时用 defaultHtml 做初始渲染；
 *   - 父级内容发生「外部替换」（打开编辑页异步回填）时，递增 key 让编辑器以新内容重建；
 *   - 编辑器自身的输入通过 on-change 回抛父级，此时父级值 === 编辑器值，不会触发重建。
 * 工具栏与编辑器一起重建，避免坑 3。
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
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

interface WangEditorInstance {
  getHtml: () => string
  destroy: () => void
}

const editorRef = shallowRef<WangEditorInstance | null>(null)

/** 编辑器当前承载的内容（仅在重建时更新，作为 defaultHtml） */
const mountedHtml = ref(props.modelValue ?? '')
/** 重建计数：内容被外部替换时递增，Editor 与 Toolbar 一起重建 */
const editorKey = ref(0)
/** 是否处于「刚重建完，等待编辑器上报内容」的状态 */
const awaitingEcho = ref(false)

/** 空内容统一用空段落占位，避免 wangEditor 处理空串时走异常分支 */
function normalizeHtml(html: string | null | undefined): string {
  return html && html.trim() ? html : '<p><br></p>'
}

const editorConfig = computed(() => ({
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
}))

const toolbarConfig = {
  excludeKeys: ['group-video', 'fullScreen'],
}

function handleCreated(editor: WangEditorInstance): void {
  editorRef.value = editor
}

function handleChange(editor: WangEditorInstance): void {
  const html = editor.getHtml()
  // 重建后的首次回调：把挂载内容同步到父级（内容一致时不会有副作用）
  if (awaitingEcho.value) {
    awaitingEcho.value = false
  }
  if (html === props.modelValue) return
  emit('update:modelValue', html)
}

/** 父级内容变化：只有真正的外部替换才重建编辑器 */
watch(
  () => props.modelValue,
  (next) => {
    const normalized = normalizeHtml(next)
    if (normalized === normalizeHtml(mountedHtml.value)) return
    mountedHtml.value = normalized
    awaitingEcho.value = true
    editorKey.value += 1
  },
)

onBeforeUnmount(() => {
  editorRef.value?.destroy?.()
  editorRef.value = null
})
</script>

<template>
  <div class="overflow-hidden rounded border border-black/10">
    <Toolbar
      :key="`toolbar-${editorKey}`"
      :editor="editorRef"
      :default-config="toolbarConfig"
      mode="default"
      class="border-b border-black/10"
    />
    <!-- 不使用 v-model；用 key + default-html 完成外部内容替换，见文件头注释 -->
    <Editor
      :key="`editor-${editorKey}`"
      :default-html="mountedHtml"
      :default-config="editorConfig"
      mode="default"
      :style="{ height: `${height}px`, overflowY: 'hidden' }"
      @on-created="handleCreated"
      @on-change="handleChange"
    />
  </div>
</template>
