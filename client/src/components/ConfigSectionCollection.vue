<template>
  <div>
    <!-- 空状态 -->
    <div v-if="Object.keys(items).length === 0" class="empty-state">
      <n-empty :description="`暂无${title}，点击添加`">
        <template #extra>
          <n-dropdown :options="addDropdownOptions" @select="onAddSelect">
            <n-button type="primary" ghost>添加{{ title }}</n-button>
          </n-dropdown>
        </template>
      </n-empty>
    </div>

    <!-- 列表 -->
    <n-space vertical v-else>
      <n-space justify="end">
        <n-dropdown :options="addDropdownOptions" @select="onAddSelect">
          <n-button type="primary" ghost>添加{{ title }}</n-button>
        </n-dropdown>
      </n-space>

      <n-card
        v-for="(itemVal, itemKey) in items"
        :key="itemKey"
        :title="itemKey"
        size="small"
        :segmented="true"
      >
        <template #header-extra>
          <n-space>
            <n-button size="tiny" quaternary @click="onEditItem(itemKey)">
              <template #icon><n-icon :component="CreateOutline" /></template>
            </n-button>
            <n-popconfirm @positive-click="onDeleteItem(itemKey)">
              <template #trigger>
                <n-button size="tiny" quaternary type="error">
                  <template #icon><n-icon :component="TrashOutline" /></template>
                </n-button>
              </template>
              确定删除 {{ itemKey }} 吗？
            </n-popconfirm>
          </n-space>
        </template>

        <!-- 渲染 item 的字段摘要 -->
        <n-descriptions :column="2" size="small" bordered>
          <n-descriptions-item
            v-for="(fieldVal, fieldKey) in filteredFields(itemVal)"
            :key="fieldKey"
            :label="fieldKey"
          >
            <n-ellipsis style="max-width: 200px;">
              {{ formatFieldValue(fieldVal) }}
            </n-ellipsis>
          </n-descriptions-item>
        </n-descriptions>

        <!-- 递归显示嵌套数组（如 models 列表） -->
        <template v-if="itemVal.models && itemVal.models.length">
          <n-divider>模型列表</n-divider>
          <n-data-table
            :columns="subTableColumns"
            :data="itemVal.models.map((m: any, i: number) => ({ ...m, _idx: i }))"
            size="small"
            :bordered="false"
          />
          <n-space justify="end" style="margin-top: 8px;">
            <n-button size="tiny" @click="onAddSubItem(itemKey)">添加模型</n-button>
          </n-space>
        </template>
      </n-card>
    </n-space>

    <!-- 编辑项弹窗 -->
    <n-modal v-model:show="showEditDialog" preset="card" :title="`编辑 ${editTitle}`" style="width: 600px;">
      <n-form>
        <n-form-item label="名称">
          <n-input v-model:value="editKey" :disabled="isEditingExisting" />
        </n-form-item>
        <n-form-item
          v-for="(_, fieldKey) in editFields"
          :key="fieldKey"
          :label="fieldLabel(fieldKey)"
        >
          <n-input
            v-if="fieldType(fieldKey) === 'string'"
            v-model:value="editFields[fieldKey]"
            :type="fieldKey.toLowerCase().includes('key') || fieldKey.toLowerCase().includes('secret') ? 'password' : 'text'"
            :show-password-on="fieldKey.toLowerCase().includes('key') || fieldKey.toLowerCase().includes('secret') ? 'click' : undefined"
            :placeholder="fieldPlaceholder(fieldKey)"
          />
          <n-select
            v-else-if="fieldType(fieldKey) === 'select'"
            v-model:value="editFields[fieldKey]"
            :options="fieldOptions(fieldKey)"
          />
          <n-input-number
            v-else-if="fieldType(fieldKey) === 'number'"
            v-model:value="editFields[fieldKey]"
          />
          <n-switch
            v-else-if="fieldType(fieldKey) === 'switch'"
            v-model:value="editFields[fieldKey]"
          />
        </n-form-item>
      </n-form>
      <n-space justify="center">
        <n-button @click="showEditDialog = false">取消</n-button>
        <n-button type="primary" @click="onSaveItem">保存</n-button>
      </n-space>
    </n-modal>

    <!-- 添加子项弹窗（如模型） -->
    <n-modal v-model:show="showSubDialog" preset="card" :title="`添加${subItemLabel}`" style="width: 500px;">
      <n-form>
        <n-form-item
          v-for="(_, fieldKey) in subFields"
          :key="fieldKey"
          :label="fieldKey"
        >
          <n-input
            v-if="fieldType(fieldKey, subFieldTypes) === 'string'"
            v-model:value="subFields[fieldKey]"
          />
          <n-input-number
            v-else-if="fieldType(fieldKey, subFieldTypes) === 'number'"
            v-model:value="subFields[fieldKey]"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showSubDialog = false">取消</n-button>
          <n-button type="primary" @click="onSaveSubItem">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  NCard,
  NSpace,
  NButton,
  NIcon,
  NEmpty,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NPopconfirm,
  NModal,
  NEllipsis,
  NDropdown,
  type DataTableColumns,
  type SelectMixedOption
} from 'naive-ui'
import { CreateOutline, TrashOutline } from '@vicons/ionicons5'

export interface CollectionPreset {
  label: string
  keyPrefix?: string
  fields: Record<string, any>  // 字段默认值
  fieldTypes?: Record<string, 'string' | 'number' | 'switch' | 'select'>
  fieldLabels?: Record<string, string>
  fieldPlaceholders?: Record<string, string>
  fieldOptions?: Record<string, { label: string; value: string }[]>
}

export interface SubItemConfig {
  label: string
  fields: Record<string, any>
  fieldTypes?: Record<string, 'string' | 'number'>
}

const props = defineProps<{
  title: string
  items: Record<string, any>
  presets?: CollectionPreset[]
  subItemConfig?: SubItemConfig
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: any): void
  (e: 'delete', key: string): void
  (e: 'add-sub', parentKey: string, value: any): void
}>()

// 添加按钮下拉选项
const addDropdownOptions = computed(() => {
  const options: any[] = []
  if (props.presets) {
    for (const p of props.presets) {
      options.push({ label: p.label, key: `preset::${p.label}` })
    }
  }
  options.push({ label: '自定义...', key: 'custom' })
  return options
})

// 编辑弹窗
const showEditDialog = ref(false)
const isEditingExisting = ref(false)
const editKey = ref('')
const originalKey = ref('')
const editTitle = ref('')
const editFields = reactive<Record<string, any>>({})
const editFieldTypes = ref<Record<string, 'string' | 'number' | 'switch' | 'select'>>({})
const editFieldLabels = ref<Record<string, string>>({})
const editFieldPlaceholders = ref<Record<string, string>>({})
const editFieldOptions = ref<Record<string, SelectMixedOption[]>>({})

// 子项弹窗
const showSubDialog = ref(false)
const subFields = reactive<Record<string, any>>({})
const subFieldTypes = ref<Record<string, 'string' | 'number'>>({})
const subItemLabel = ref('')
const editingParentKey = ref('')

function onAddSelect(key: string) {
  if (key === 'custom') {
    // 自定义 - 清空字段
    isEditingExisting.value = false
    originalKey.value = ''
    editKey.value = ''
    for (const k of Object.keys(editFields)) {
      delete editFields[k]
    }
    editTitle.value = `自定义 ${props.title}`
    editFieldTypes.value = {}
    editFieldLabels.value = {}
    editFieldPlaceholders.value = {}
    editFieldOptions.value = {}
    showEditDialog.value = true
    return
  }

  // 预设
  const preset = props.presets?.find(p => `preset::${p.label}` === key)
  if (preset) {
    isEditingExisting.value = false
    originalKey.value = ''
    editKey.value = preset.keyPrefix || preset.label
    for (const [k, v] of Object.entries(preset.fields)) {
      editFields[k] = v ?? ''
    }
    editFieldTypes.value = preset.fieldTypes || {}
    editFieldLabels.value = preset.fieldLabels || {}
    editFieldPlaceholders.value = preset.fieldPlaceholders || {}
    editFieldOptions.value = preset.fieldOptions || {}
    editTitle.value = preset.label
    showEditDialog.value = true
  }
}

function onEditItem(key: string) {
  isEditingExisting.value = true
  originalKey.value = key
  editKey.value = key
  const item = props.items[key] || {}
  for (const [k, v] of Object.entries(item)) {
    if (k !== 'models') {
      editFields[k] = typeof v === 'object' ? JSON.stringify(v) : v
    }
  }
  editTitle.value = key
  showEditDialog.value = true
}

function onSaveItem() {
  const newKey = editKey.value.trim()
  if (!newKey) {
    window.$message?.error('名称不能为空')
    return
  }

  // 构建值
  const value: Record<string, any> = {}
  for (const [k, v] of Object.entries(editFields)) {
    value[k] = v
  }

  emit('update', newKey, value)
  showEditDialog.value = false
}

function onDeleteItem(key: string) {
  emit('delete', key)
}

function onAddSubItem(parentKey: string) {
  if (!props.subItemConfig) return
  editingParentKey.value = parentKey
  subItemLabel.value = props.subItemConfig.label
  subFieldTypes.value = props.subItemConfig.fieldTypes || {}
  for (const [k, v] of Object.entries(props.subItemConfig.fields)) {
    subFields[k] = v ?? ''
  }
  showSubDialog.value = true
}

function onSaveSubItem() {
  const value: Record<string, any> = {}
  for (const [k, v] of Object.entries(subFields)) {
    value[k] = v
  }
  emit('add-sub', editingParentKey.value, value)
  showSubDialog.value = false
}

// 辅助方法
function filteredFields(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'models' && typeof v !== 'object') {
      result[k] = v
    }
  }
  return result
}

function formatFieldValue(val: any): string {
  if (val === true) return '是'
  if (val === false) return '否'
  if (val === null || val === undefined) return '-'
  return String(val).substring(0, 64)
}

function fieldType(fieldKey: string, types?: Record<string, string>): string {
  const t = types || editFieldTypes.value
  return t[fieldKey] || (fieldKey.toLowerCase().includes('enabled') ? 'switch' : 'string')
}

function fieldLabel(fieldKey: string): string {
  return editFieldLabels.value[fieldKey] || fieldKey
}

function fieldPlaceholder(fieldKey: string): string {
  return editFieldPlaceholders.value[fieldKey] || ''
}

function fieldOptions(fieldKey: string): any[] {
  return editFieldOptions.value[fieldKey] || []
}

const subTableColumns: DataTableColumns<any> = [
  { title: '模型 ID', key: 'id', width: 200 },
  { title: '名称', key: 'name' },
  { title: '上下文窗口', key: 'contextWindow', width: 120 },
  { title: '最大 Token', key: 'maxTokens', width: 120 },
]
</script>

<style scoped>
.empty-state {
  padding: 40px 0;
}
</style>
