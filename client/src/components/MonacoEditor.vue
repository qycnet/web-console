<template>
  <div ref="editorContainer" class="monaco-editor-container" :style="{ height: height + 'px' }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'

interface Props {
  modelValue: string
  language?: string
  height?: number
  theme?: 'vs' | 'vs-dark'
  readOnly?: boolean
  options?: monaco.editor.IStandaloneEditorConstructionOptions
}

const props = withDefaults(defineProps<Props>(), {
  language: 'json',
  height: 400,
  theme: 'vs',
  readOnly: false,
  options: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!editorContainer.value) return

  // 设置主题
  monaco.editor.setTheme(props.theme)

  // 创建编辑器
  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readOnly,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    folding: true,
    tabSize: 2,
    ...props.options
  })

  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() || ''
    emit('update:modelValue', value)
    emit('change', value)
  })
})

// 监听外部值变化
watch(() => props.modelValue, (newValue) => {
  if (editor && editor.getValue() !== newValue) {
    editor.setValue(newValue)
  }
})

// 监听语言变化
watch(() => props.language, (newLang) => {
  if (editor) {
    const model = editor.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, newLang)
    }
  }
})

// 监听主题变化
watch(() => props.theme, (newTheme) => {
  monaco.editor.setTheme(newTheme)
})

// 监听只读状态变化
watch(() => props.readOnly, (newReadOnly) => {
  editor?.updateOptions({ readOnly: newReadOnly })
})

onUnmounted(() => {
  editor?.dispose()
})

// 暴露方法
defineExpose({
  getEditor: () => editor,
  getValue: () => editor?.getValue() || '',
  setValue: (value: string) => editor?.setValue(value),
  focus: () => editor?.focus(),
  format: () => {
    editor?.getAction('editor.action.formatDocument')?.run()
  }
})
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
  overflow: hidden;
}
</style>
