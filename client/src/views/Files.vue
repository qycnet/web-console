<template>
  <div class="files-page">
    <n-card title="文件管理">
      <template #header-extra>
        <n-space>
          <n-button @click="handleUpload">
            <template #icon><n-icon :component="CloudUploadOutline" /></template>
            上传
          </n-button>
          <n-button @click="handleMkdir">
            <template #icon><n-icon :component="FolderOutline" /></template>
            新建文件夹
          </n-button>
        </n-space>
      </template>

      <!-- 路径导航 -->
      <n-breadcrumb style="margin-bottom: 16px;">
        <n-breadcrumb-item @click="navigateTo('/')">
          <n-icon :component="HomeOutline" />
        </n-breadcrumb-item>
        <n-breadcrumb-item
          v-for="(part, index) in pathParts"
          :key="index"
          @click="navigateTo(getPathUpTo(index))"
        >
          {{ part }}
        </n-breadcrumb-item>
      </n-breadcrumb>

      <!-- 文件列表 -->
      <n-data-table
        :columns="columns"
        :data="files"
        :loading="loading"
        :row-key="(row: FileItem) => row.path"
        @update:checked-row-keys="handleSelect"
      />

      <!-- 文件编辑器 -->
      <n-modal v-model:show="showEditor" preset="card" :title="`编辑: ${editingFileName}`" style="width: 900px;">
        <div class="editor-container">
          <n-space style="margin-bottom: 8px;">
            <n-select
              v-model:value="editorLanguage"
              :options="languageOptions"
              style="width: 150px;"
            />
            <n-button size="small" @click="handleFormatCode">格式化</n-button>
          </n-space>
          <MonacoEditor
            v-model="fileContent"
            :language="editorLanguage"
            :height="450"
            :theme="themeStore.isDark ? 'vs-dark' : 'vs'"
          />
        </div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showEditor = false">取消</n-button>
            <n-button type="primary" @click="handleSaveFile">保存</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 上传弹窗 -->
      <n-modal v-model:show="showUpload" preset="card" title="上传文件" style="width: 500px;">
        <n-tabs type="line" animated>
          <n-tab-pane name="simple" tab="普通上传">
            <n-upload
              multiple
              directory-dnd
              :action="uploadUrl"
              :headers="uploadHeaders"
              @finish="handleUploadFinish"
            >
              <n-upload-dragger>
                <div style="padding: 24px;">
                  <div style="font-size: 48px; margin-bottom: 12px;">📁</div>
                  <n-text style="font-size: 16px;">
                    点击或拖拽文件到此区域上传
                  </n-text>
                  <n-p depth="3" style="margin: 8px 0 0 0;">
                    支持多文件上传，单文件最大 100MB
                  </n-p>
                </div>
              </n-upload-dragger>
            </n-upload>
          </n-tab-pane>
          <n-tab-pane name="batch" tab="批量上传">
            <n-upload
              multiple
              :action="batchUploadUrl"
              :headers="uploadHeaders"
              @finish="handleBatchUploadFinish"
            >
              <n-upload-dragger>
                <div style="padding: 24px;">
                  <div style="font-size: 48px; margin-bottom: 12px;">📦</div>
                  <n-text style="font-size: 16px;">
                    批量上传文件（最多50个）
                  </n-text>
                  <n-p depth="3" style="margin: 8px 0 0 0;">
                    文件逐个传输，单个失败不影响其他
                  </n-p>
                </div>
              </n-upload-dragger>
            </n-upload>
          </n-tab-pane>
          <n-tab-pane name="chunk" tab="大文件上传">
            <div style="padding: 12px 0;">
              <n-upload
                :default-upload="false"
                @change="handleChunkFileSelect"
              >
                <n-upload-dragger>
                  <div style="padding: 24px;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🧩</div>
                    <n-text style="font-size: 16px;">
                      选择大文件上传（超过100MB）
                    </n-text>
                    <n-p depth="3" style="margin: 8px 0 0 0;">
                      自动分片上传，支持断点续传
                    </n-p>
                  </div>
                </n-upload-dragger>
              </n-upload>
              <div v-if="chunkFile" style="margin-top: 12px;">
                <n-progress
                  type="line"
                  :percentage="chunkProgress"
                  :indicator-placement="'inside'"
                  :status="chunkStatus === 'error' ? 'error' : chunkProgress >= 100 ? 'success' : undefined"
                />
                <n-text depth="3" v-if="chunkFile">
                  {{ chunkFile.name }} ({{ formatSize(chunkFile.size) }})
                  — {{ chunkReceived }}/{{ chunkTotal }} 分片
                </n-text>
                <n-space style="margin-top: 8px;" justify="end">
                  <n-button size="small" @click="handleChunkCancel" :disabled="!chunkUploadId">取消</n-button>
                  <n-button size="small" type="primary" @click="handleChunkStart"
                    :disabled="!chunkFile || chunkUploading"
                    :loading="chunkUploading">
                    {{ chunkProgress > 0 && chunkProgress < 100 ? '继续' : '开始上传' }}
                  </n-button>
                </n-space>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </n-modal>

      <!-- 新建文件夹弹窗 -->
      <n-modal v-model:show="showMkdir" preset="card" title="新建文件夹" style="width: 400px;">
        <n-input v-model:value="newFolderName" placeholder="文件夹名称" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="showMkdir = false">取消</n-button>
            <n-button type="primary" @click="handleCreateFolder">创建</n-button>
          </n-space>
        </template>
      </n-modal>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted } from 'vue'
import {
  NCard,
  NBreadcrumb,
  NBreadcrumbItem,
  NDataTable,
  NButton,
  NSpace,
  NIcon,
  NModal,
  NInput,
  NUpload,
  NUploadDragger,
  NText,
  NP,
  NSelect,
  NTabs,
  NTabPane,
  NProgress,
  useMessage,
  useDialog,
  type DataTableColumns
} from 'naive-ui'
import {
  CloudUploadOutline,
  FolderOutline,
  HomeOutline,
  DocumentOutline,
  CreateOutline,
  TrashOutline,
  DownloadOutline
} from '@vicons/ionicons5'
import { api } from '@/api'
import { useThemeStore } from '@/stores/theme'
import MonacoEditor from '@/components/MonacoEditor.vue'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

const message = useMessage()
const dialog = useDialog()
const themeStore = useThemeStore()

const currentPath = ref('/')
const files = ref<FileItem[]>([])
const loading = ref(false)
const showEditor = ref(false)
const editingFile = ref('')
const editingFileName = ref('')
const fileContent = ref('')
const editorLanguage = ref('plaintext')
const showUpload = ref(false)
const showMkdir = ref(false)
const newFolderName = ref('')

// 批量/断点续传状态
const chunkFile = ref<File | null>(null)
const chunkUploadId = ref('')
const chunkTotal = ref(0)
const chunkReceived = ref(0)
const chunkProgress = ref(0)
const chunkUploading = ref(false)
const chunkStatus = ref<'idle' | 'uploading' | 'error' | 'done'>('idle')

const pathParts = computed(() =>
  currentPath.value.split('/').filter(Boolean)
)

const uploadUrl = computed(() =>
  `/api/files/upload?path=${encodeURIComponent(currentPath.value)}`
)

const batchUploadUrl = computed(() =>
  `/api/files/batch-upload?path=${encodeURIComponent(currentPath.value)}`
)

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
}))

const languageOptions = [
  { label: 'Plain Text', value: 'plaintext' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JSON', value: 'json' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Python', value: 'python' },
  { label: 'YAML', value: 'yaml' },
  { label: 'Shell', value: 'shell' }
]

const columns: DataTableColumns<FileItem> = [
  {
    title: '名称',
    key: 'name',
    render(row) {
      return h('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
        onClick: () => row.type === 'directory' && navigateTo(row.path)
      }, [
        h(NIcon, {
          size: 20,
          component: row.type === 'directory' ? FolderOutline : DocumentOutline,
          color: row.type === 'directory' ? '#f0a020' : undefined
        }),
        h('span', row.name)
      ])
    }
  },
  {
    title: '大小',
    key: 'size',
    width: 120,
    render(row) {
      return row.type === 'directory' ? '-' : formatSize(row.size)
    }
  },
  { title: '修改时间', key: 'modified', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render(row) {
      return h(NSpace, null, {
        default: () => [
          row.type === 'file' && h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleEdit(row)
          }, { icon: () => h(NIcon, { component: CreateOutline }) }),
          row.type === 'file' && h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleDownload(row)
          }, { icon: () => h(NIcon, { component: DownloadOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleDelete(row)
          }, { icon: () => h(NIcon, { component: TrashOutline }) })
        ]
      })
    }
  }
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    py: 'python',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    vue: 'vue'
  }
  return langMap[ext || ''] || 'plaintext'
}

onMounted(() => loadFiles())

async function loadFiles() {
  loading.value = true
  try {
    files.value = await api.files.list(currentPath.value)
  } catch (err) {
    message.error('加载文件列表失败')
  } finally {
    loading.value = false
  }
}

function navigateTo(path: string) {
  currentPath.value = path
  loadFiles()
}

function getPathUpTo(index: number) {
  return '/' + pathParts.value.slice(0, index + 1).join('/')
}

async function handleEdit(file: FileItem) {
  try {
    const content = await api.files.read(file.path)
    editingFile.value = file.path
    editingFileName.value = file.name
    fileContent.value = content
    editorLanguage.value = getLanguageFromPath(file.name)
    showEditor.value = true
  } catch (err) {
    message.error('读取文件失败')
  }
}

async function handleSaveFile() {
  try {
    await api.files.write(editingFile.value, fileContent.value)
    message.success('文件已保存')
    showEditor.value = false
  } catch (err) {
    message.error('保存失败')
  }
}

function handleFormatCode() {
  // Monaco Editor 内置格式化
  message.info('使用编辑器快捷键 Shift+Alt+F 格式化')
}

async function handleDownload(file: FileItem) {
  try {
    const blob = await api.files.download(file.path)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    message.error('下载失败')
  }
}

function handleDelete(file: FileItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除 ${file.name} 吗？${file.type === 'directory' ? '文件夹内所有内容都将被删除。' : ''}`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.files.delete(file.path)
        message.success('已删除')
        loadFiles()
      } catch (err) {
        message.error('删除失败')
      }
    }
  })
}

function handleUpload() {
  showUpload.value = true
}

function handleUploadFinish({ event }: any) {
  const response = JSON.parse(event.target.response)
  if (response.message) {
    message.success('上传成功')
    showUpload.value = false
    loadFiles()
  }
}

function handleBatchUploadFinish({ event }: any) {
  const response = JSON.parse(event.target.response)
  if (response.message) {
    message.success(response.message)
    showUpload.value = false
    loadFiles()
  }
}

// 断点续传
function handleChunkFileSelect({ fileList }: any) {
  const file = fileList[0]?.file
  if (!file) return
  chunkFile.value = file
  // 重置状态
  chunkUploadId.value = ''
  chunkTotal.value = 0
  chunkReceived.value = 0
  chunkProgress.value = 0
  chunkStatus.value = 'idle'
}

async function handleChunkStart() {
  const file = chunkFile.value
  if (!file) return

  chunkUploading.value = true
  chunkStatus.value = 'uploading'

  try {
    // 如果没有uploadId，先初始化
    if (!chunkUploadId.value) {
      const init = await api.files.chunkInit(file.name, file.size, currentPath.value)
      chunkUploadId.value = init.uploadId
      chunkTotal.value = init.totalChunks
      chunkReceived.value = 0
      chunkProgress.value = 0
    } else {
      // 续传：检查当前进度
      const status = await api.files.chunkStatus(chunkUploadId.value)
      chunkTotal.value = status.totalChunks
      chunkReceived.value = status.receivedChunks.length
      chunkProgress.value = status.progress
    }

    const uploadId = chunkUploadId.value
    const chunkSize = 5 * 1024 * 1024 // 5MB

    // 上传缺失的分片
    for (let i = 0; i < chunkTotal.value; i++) {
      const status = await api.files.chunkStatus(uploadId)
      if (status.complete) {
        chunkReceived.value = status.totalChunks
        chunkProgress.value = 100
        break
      }
      if (status.receivedChunks.includes(i)) {
        // 跳过已上传的分片
        continue
      }

      // 读取分片数据
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)

      const formData = new FormData()
      formData.append('file', chunk, `chunk-${i}`)
      formData.append('uploadId', uploadId)
      formData.append('chunkIndex', String(i))

      const result = await api.files.chunkUpload(formData)
      chunkReceived.value = result.receivedChunks
      chunkProgress.value = result.progress
    }

    // 合并分片
    if (chunkProgress.value >= 100) {
      const mergeResult = await api.files.chunkMerge(uploadId)
      message.success(`文件上传完成：${mergeResult.filename}`)
      chunkStatus.value = 'done'
      chunkFile.value = null
      chunkUploadId.value = ''
      showUpload.value = false
      loadFiles()
    }
  } catch (err: any) {
    chunkStatus.value = 'error'
    const msg = err?.error || err?.message || '上传失败'
    if (msg.includes('不完整')) {
      message.warning(`上传暂停（${msg}），可稍后继续`)
    } else {
      message.error(msg)
    }
  } finally {
    chunkUploading.value = false
  }
}

async function handleChunkCancel() {
  if (!chunkUploadId.value) {
    chunkFile.value = null
    chunkUploadId.value = ''
    chunkProgress.value = 0
    return
  }
  try {
    await api.files.chunkCancel(chunkUploadId.value)
    message.info('上传已取消')
  } catch {
    // 忽略
  }
  chunkFile.value = null
  chunkUploadId.value = ''
  chunkProgress.value = 0
  chunkReceived.value = 0
  chunkTotal.value = 0
  chunkStatus.value = 'idle'
}

function handleMkdir() {
  newFolderName.value = ''
  showMkdir.value = true
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim()) {
    message.error('请输入文件夹名称')
    return
  }
  try {
    const folderPath = currentPath.value === '/'
      ? `/${newFolderName.value}`
      : `${currentPath.value}/${newFolderName.value}`
    await api.files.mkdir(folderPath)
    message.success('文件夹已创建')
    showMkdir.value = false
    loadFiles()
  } catch (err) {
    message.error('创建失败')
  }
}

function handleSelect(_keys: (string | number)[]) {
  // 多选处理
}
</script>

<style scoped>
.files-page {
  height: 100%;
}

.editor-container {
  background: var(--n-color);
  border-radius: 4px;
  padding: 12px;
}
</style>
