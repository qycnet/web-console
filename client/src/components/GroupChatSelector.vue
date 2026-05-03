<template>
  <n-modal v-model:show="visible" preset="card" title="创建群聊" style="width: 450px;">
    <div class="group-hint">选择多个 Agent 加入群聊，他们将协作回答你的问题</div>
    <n-input v-model:value="searchText" placeholder="搜索 Agent..." style="margin-bottom: 12px;" />
    <div class="agent-list">
      <div
        v-for="agent in filteredAgents"
        :key="agent.id"
        :class="['agent-item', { selected: selectedIds.has(agent.id) }]"
        @click="toggleAgent(agent)"
      >
        <span class="agent-check">
          <span :class="['check-box', { checked: selectedIds.has(agent.id) }]">
            <span v-if="selectedIds.has(agent.id)" class="check-mark">✓</span>
          </span>
        </span>
        <span class="agent-name">{{ agent.name }}</span>
        <n-tag size="tiny" :type="agent.status === 'running' ? 'success' : 'default'">
          {{ agent.status === 'running' ? '运行中' : '已停止' }}
        </n-tag>
      </div>
      <div v-if="filteredAgents.length === 0" class="agent-empty">暂无匹配的 Agent</div>
    </div>
    <div v-if="selectedIds.size > 0" class="selected-info">
      已选择 <strong>{{ selectedIds.size }}</strong> 个 Agent
    </div>
    <template #footer>
      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" :disabled="selectedIds.size < 2" @click="createGroup">
          创建群聊 ({{ selectedIds.size }})
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NModal, NInput, NTag, NButton, NSpace, useMessage } from 'naive-ui'
import { api } from '@/api'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'create': [agents: Array<{ id: string; name: string }>]
}>()

const message = useMessage()
const searchText = ref('')
const agents = ref<any[]>([])
const selectedIds = ref<Set<string>>(new Set())
const selectedAgents = ref<any[]>([])

const filteredAgents = computed(() => {
  const kw = searchText.value.toLowerCase()
  return agents.value.filter(
    (a: any) => a.name.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw)
  )
})

function toggleAgent(agent: any) {
  if (selectedIds.value.has(agent.id)) {
    selectedIds.value.delete(agent.id)
    selectedAgents.value = selectedAgents.value.filter(a => a.id !== agent.id)
  } else {
    selectedIds.value.add(agent.id)
    selectedAgents.value.push(agent)
  }
}

function createGroup() {
  if (selectedAgents.value.length < 2) {
    message.warning('请至少选择 2 个 Agent')
    return
  }
  emit('create', selectedAgents.value.map(a => ({ id: a.id, name: a.name })))
  close()
}

function close() {
  emit('update:visible', false)
  searchText.value = ''
  selectedIds.value.clear()
  selectedAgents.value = []
}

onMounted(() => {
  loadAgents()
})

async function loadAgents() {
  try {
    agents.value = await api.agents.list()
  } catch {
    // ignore
  }
}
</script>

<style scoped>
.group-hint {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--n-color-embedded);
  border-radius: 6px;
}

.agent-list {
  max-height: 300px;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.agent-item:hover {
  background: var(--n-color-hover);
}

.agent-item.selected {
  background: rgba(59, 130, 246, 0.1);
}

.agent-check {
  flex-shrink: 0;
}

.check-box {
  width: 18px;
  height: 18px;
  border: 2px solid var(--n-border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.check-box.checked {
  background: #3b82f6;
  border-color: #3b82f6;
}

.check-mark {
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.agent-name {
  flex: 1;
  font-weight: 500;
}

.agent-empty {
  text-align: center;
  padding: 20px;
  color: var(--n-text-color-3);
}

.selected-info {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--n-color-embedded);
  border-radius: 6px;
  font-size: 13px;
  color: var(--n-text-color-3);
}
</style>
