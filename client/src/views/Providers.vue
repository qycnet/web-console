<template>
  <div class="providers-page">
    <n-card title="供应商管理">
      <template #header-extra>
        <n-button type="primary" @click="showCreateModal = true">
          <template #icon><n-icon :component="AddOutline" /></template>
          添加供应商
        </n-button>
      </template>

      <n-data-table
        :columns="columns"
        :data="providers"
        :loading="loading"
        :row-key="(row: any) => row.name"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <!-- 添加供应商弹窗 -->
    <n-modal v-model:show="showCreateModal" preset="card" title="添加供应商" style="width: 650px;">
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="名称" required>
          <n-input v-model:value="createForm.name" placeholder="deepseek / openai / siliconflow" />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input v-model:value="createForm.apiKey" type="password" placeholder="sk-xxx..." show-password-on="click" />
        </n-form-item>
        <n-form-item label="Base URL">
          <n-input v-model:value="createForm.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </n-form-item>
        <n-form-item label="默认模型">
          <n-input v-model:value="createForm.defaultModel" placeholder="deepseek-chat" />
        </n-form-item>
        <n-form-item label="默认温度">
          <n-input-number v-model:value="createForm.defaultTemperature" :min="0" :max="2" :step="0.1" placeholder="0.7" style="width: 120px" />
        </n-form-item>
        <n-form-item label="默认 Max Tokens">
          <n-input-number v-model:value="createForm.defaultMaxTokens" :min="256" :max="32768" :step="256" placeholder="4096" style="width: 150px" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" @click="handleCreate">确定添加</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑供应商弹窗 -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑供应商" style="width: 680px;">
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="名称">
          <n-input v-model:value="editForm.name" disabled />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input v-model:value="editForm.apiKey" type="password" placeholder="sk-xxx..." show-password-on="click" />
        </n-form-item>
        <n-form-item label="Base URL">
          <n-input v-model:value="editForm.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </n-form-item>
        <n-form-item label="默认模型">
          <n-select
            v-model:value="editForm.defaultModel"
            :options="editForm.models.map((m: any) => ({ label: m.name || m.id, value: m.id }))"
            placeholder="选择默认模型"
            clearable
          />
        </n-form-item>
        <n-form-item label="默认温度">
          <n-input-number v-model:value="editForm.defaultTemperature" :min="0" :max="2" :step="0.1" placeholder="0.7" style="width: 120px" />
        </n-form-item>
        <n-form-item label="默认 Max Tokens">
          <n-input-number v-model:value="editForm.defaultMaxTokens" :min="256" :max="32768" :step="256" placeholder="4096" style="width: 150px" />
        </n-form-item>

        <n-divider>模型管理</n-divider>
        <n-form-item label="添加模型">
          <n-space>
            <n-input v-model:value="newModelId" placeholder="模型 ID（如 gpt-4o）" style="width: 200px" />
            <n-input v-model:value="newModelName" placeholder="显示名（可选）" style="width: 200px" />
            <n-button size="small" @click="handleAddModel">添加</n-button>
          </n-space>
        </n-form-item>
        <n-form-item label="已注册模型">
          <n-space wrap>
            <n-tag
              v-for="m in editForm.models"
              :key="m.id"
              closable
              :type="m.isDefault ? 'success' : 'default'"
              @close="handleRemoveModel(m.id)"
            >
              {{ m.name || m.id }}
              <n-button v-if="!m.isDefault" size="tiny" text @click="handleSetDefault(m.id)" style="margin-left: 4px;">
                ⭐
              </n-button>
            </n-tag>
          </n-space>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleEdit">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NIcon,
  NTag,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NDivider,
  useMessage,
  useDialog,
  type DataTableColumns
} from 'naive-ui'
import {
  AddOutline,
  EyeOutline,
  TrashOutline
} from '@vicons/ionicons5'
import api from '@/api'

const message = useMessage()
const dialog = useDialog()

const providers = ref<any[]>([])
const loading = ref(false)
const showCreateModal = ref(false)
const showEditModal = ref(false)

const createForm = ref({
  name: '',
  apiKey: '',
  baseUrl: '',
  defaultModel: '',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096
})

const editForm = ref<any>({
  name: '',
  apiKey: '',
  baseUrl: '',
  defaultModel: '',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  models: []
})

const newModelId = ref('')
const newModelName = ref('')

const columns: DataTableColumns<any> = [
  { title: '名称', key: 'name' },
  {
    title: 'API Key',
    key: 'apiKey',
    ellipsis: { tooltip: true }
  },
  {
    title: 'Base URL',
    key: 'baseUrl',
    ellipsis: { tooltip: true }
  },
  { title: '默认模型', key: 'defaultModel' },
  {
    title: '默认温度',
    key: 'defaultTemperature',
    width: 100
  },
  {
    title: '模型数',
    key: 'models',
    width: 80,
    render(row: any) {
      return Array.isArray(row.models) ? row.models.length : 0
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render(row: any) {
      return h(NSpace, null, {
        default: () => [
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleEditProvider(row.name)
          }, { icon: () => h(NIcon, { component: EyeOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            type: 'error' as any,
            onClick: () => handleDelete(row.name)
          }, { icon: () => h(NIcon, { component: TrashOutline }) })
        ]
      })
    }
  }
]

onMounted(() => {
  loadProviders()
})

async function loadProviders() {
  loading.value = true
  try {
    providers.value = await api.config.providers.list()
  } catch {
    message.error('加载供应商列表失败')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!createForm.value.name) {
    message.error('请输入供应商名称')
    return
  }
  try {
    await api.config.providers.create(createForm.value.name, {
      apiKey: createForm.value.apiKey,
      baseUrl: createForm.value.baseUrl,
      defaultModel: createForm.value.defaultModel,
      defaultTemperature: createForm.value.defaultTemperature,
      defaultMaxTokens: createForm.value.defaultMaxTokens
    })
    message.success('供应商添加成功')
    showCreateModal.value = false
    createForm.value = { name: '', apiKey: '', baseUrl: '', defaultModel: '', defaultTemperature: 0.7, defaultMaxTokens: 4096 }
    loadProviders()
  } catch (err: any) {
    message.error(err?.error || '添加失败')
  }
}

async function handleEditProvider(name: string) {
  try {
    const detail = await api.config.providers.get(name)
    editForm.value = {
      name: detail.name || name,
      apiKey: detail.apiKey || '',
      baseUrl: detail.baseUrl || '',
      defaultModel: detail.defaultModel || '',
      defaultTemperature: detail.defaultTemperature ?? 0.7,
      defaultMaxTokens: detail.defaultMaxTokens ?? 4096,
      models: Array.isArray(detail.models) ? detail.models.map((m: any) => ({
        id: m.id || m.name || '',
        name: m.name || m.id || '',
        isDefault: (m.id || m.name || '') === detail.defaultModel
      })) : []
    }
    showEditModal.value = true
  } catch {
    message.error('获取供应商详情失败')
  }
}

async function handleEdit() {
  try {
    await api.config.providers.update(editForm.value.name, {
      apiKey: editForm.value.apiKey,
      baseUrl: editForm.value.baseUrl,
      defaultModel: editForm.value.defaultModel,
      defaultTemperature: editForm.value.defaultTemperature,
      defaultMaxTokens: editForm.value.defaultMaxTokens,
      models: editForm.value.models.map((m: any) => ({ id: m.id, name: m.name }))
    })
    message.success('供应商更新成功')
    showEditModal.value = false
    loadProviders()
  } catch (err: any) {
    message.error(err?.error || '更新失败')
  }
}

async function handleDelete(name: string) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除供应商「${name}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.config.providers.delete(name)
        message.success('供应商已删除')
        loadProviders()
      } catch (err: any) {
        message.error(err?.error || '删除失败')
      }
    }
  })
}

async function handleAddModel() {
  if (!newModelId.value) {
    message.error('请输入模型 ID')
    return
  }
  try {
    await api.config.providers.addModel(editForm.value.name, newModelId.value, newModelName.value)
    message.success('模型添加成功')
    newModelId.value = ''
    newModelName.value = ''
    // 刷新编辑表单
    handleEditProvider(editForm.value.name)
  } catch (err: any) {
    message.error(err?.error || '添加模型失败')
  }
}

async function handleRemoveModel(modelId: string) {
  try {
    await api.config.providers.removeModel(editForm.value.name, modelId)
    message.success('模型已删除')
    handleEditProvider(editForm.value.name)
  } catch (err: any) {
    message.error(err?.error || '删除模型失败')
  }
}

async function handleSetDefault(modelId: string) {
  try {
    await api.config.providers.setDefaultModel(editForm.value.name, modelId)
    message.success('默认模型已更新')
    handleEditProvider(editForm.value.name)
  } catch (err: any) {
    message.error(err?.error || '设置默认模型失败')
  }
}
</script>

<style scoped>
.providers-page {
  height: 100%;
}
</style>
