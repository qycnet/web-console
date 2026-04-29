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
      />

      <!-- 文件编辑器 -->
      <n-modal v-model:show="showEditor" preset="card" title="编辑文件" style="width: 800px;">
        <n-input
          v-model:value="fileContent"
          type="textarea"
          :rows="20"
          :placeholder="'文件内容'"
        />
        <template #footer>
          <n-space justify="end">
            <n-button @click="showEditor = false">取消</n-button>
            <n-button type="primary" @click="handleSaveFile">保存</n-button>
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

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

const message = useMessage()
const dialog = useDialog()

const currentPath = ref('/')
const files = ref<FileItem[]>([])
const loading = ref(false)
const showEditor = ref(false)
const editingFile = ref('')
const fileContent = ref('')

const pathParts = computed(() =>
  currentPath.value.split('/').filter(Boolean)
)

const columns: DataTableColumns<FileItem> = [
  {
    title: '名称',
    key: 'name',
    render(row) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        h(NIcon, { size: 20, component: row.type === 'directory' ? FolderOutline : DocumentOutline }),
        row.name
      ])
    }
  },
  { title: '大小', key: 'size', width: 120 },
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
    fileContent.value = content
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
    content: `确定要删除 ${file.name} 吗？`,
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
  message.info('上传功能开发中...')
}

function handleMkdir() {
  message.info('新建文件夹功能开发中...')
}
</script>

<style scoped>
.files-page {
  height: 100%;
}
</style>
