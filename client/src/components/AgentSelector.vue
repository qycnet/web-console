<template>
  <n-modal :show="visible" preset="card" title="选择 Agent" style="width: 400px;" @update:show="onShowUpdate">
    <n-input v-model:value="searchText" placeholder="搜索 Agent..." style="margin-bottom: 12px;" />
    <div class="agent-list">
      <div
        v-for="agent in filteredAgents"
        :key="agent.id"
        :class="['agent-item', { disabled: agent.disabled }]"
        :style="agent.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}"
        @click="!agent.disabled && selectAgent(agent)"
      >
        <span class="agent-name">{{ agent.name }}</span>
        <n-tag size="tiny" :type="agent.disabled ? 'default' : 'success'">
          {{ agent.disabled ? '已禁用' : '已启用' }}
        </n-tag>
      </div>
      <div v-if="filteredAgents.length === 0" class="agent-empty">暂无匹配的 Agent</div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NModal, NInput, NTag } from 'naive-ui'
import { api } from '@/api'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [agent: any]
}>()

const searchText = ref('')
const agents = ref<any[]>([])

const filteredAgents = computed(() => {
  const kw = searchText.value.toLowerCase()
  return agents.value.filter(
    (a: any) => a.name.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw)
  )
})

function onShowUpdate(val: boolean) {
  if (!val) {
    emit('update:visible', false)
    searchText.value = ''
  }
}

function selectAgent(agent: any) {
  emit('select', agent)
  emit('update:visible', false)
  searchText.value = ''
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
.agent-list {
  max-height: 300px;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.agent-item:hover {
  background: var(--n-color-hover);
}

.agent-name {
  font-weight: 500;
}

.agent-empty {
  text-align: center;
  padding: 20px;
  color: var(--n-text-color-3);
}
</style>
