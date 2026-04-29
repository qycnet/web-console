<template>
  <div class="dashboard">
    <n-grid :cols="4" :x-gap="16" :y-gap="16">
      <n-gi>
        <n-card>
          <n-statistic label="运行中的 Agent" :value="stats.agents">
            <template #prefix>
              <n-icon :component="RocketOutline" />
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="已安装技能" :value="stats.skills">
            <template #prefix>
              <n-icon :component="AppsOutline" />
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="CPU 使用率" :value="stats.cpu" suffix="%">
            <template #prefix>
              <n-icon :component="SpeedometerOutline" />
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="内存使用率" :value="stats.memory" suffix="%">
            <template #prefix>
              <n-icon :component="HardwareChipOutline" />
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
    </n-grid>

    <n-grid :cols="2" :x-gap="16" :y-gap="16" style="margin-top: 16px;">
      <n-gi>
        <n-card title="系统状态">
          <n-descriptions :column="1" bordered>
            <n-descriptions-item label="OpenClaw 版本">
              {{ systemInfo.version }}
            </n-descriptions-item>
            <n-descriptions-item label="Node.js 版本">
              {{ systemInfo.nodeVersion }}
            </n-descriptions-item>
            <n-descriptions-item label="运行时间">
              {{ systemInfo.uptime }}
            </n-descriptions-item>
            <n-descriptions-item label="平台">
              {{ systemInfo.platform }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card title="最近活动">
          <n-list>
            <n-list-item v-for="activity in activities" :key="activity.id">
              <n-thing :title="activity.title" :description="activity.time">
                {{ activity.description }}
              </n-thing>
            </n-list-item>
          </n-list>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  NGrid,
  NGi,
  NCard,
  NStatistic,
  NIcon,
  NDescriptions,
  NDescriptionsItem,
  NList,
  NListItem,
  NThing
} from 'naive-ui'
import {
  RocketOutline,
  AppsOutline,
  SpeedometerOutline,
  HardwareChipOutline
} from '@vicons/ionicons5'
import { api } from '@/api'

const stats = ref({
  agents: 0,
  skills: 0,
  cpu: 0,
  memory: 0
})

const systemInfo = ref({
  version: '-',
  nodeVersion: '-',
  uptime: '-',
  platform: '-'
})

const activities = ref<any[]>([])

onMounted(async () => {
  try {
    const [sys, agents, skills] = await Promise.all([
      api.monitor.system(),
      api.agents.list(),
      api.skills.installed()
    ])

    stats.value.cpu = sys.cpu
    stats.value.memory = sys.memory
    stats.value.agents = agents.filter((a: any) => a.status === 'running').length
    stats.value.skills = skills.length

    systemInfo.value = {
      version: sys.version,
      nodeVersion: sys.nodeVersion,
      uptime: sys.uptime,
      platform: sys.platform
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
  }
})
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
}
</style>
