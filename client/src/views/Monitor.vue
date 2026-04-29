<template>
  <div class="monitor-page">
    <n-grid :cols="2" :x-gap="16" :y-gap="16">
      <!-- CPU 使用率 -->
      <n-gi>
        <n-card title="CPU 使用率">
          <div ref="cpuChartRef" style="height: 250px;"></div>
        </n-card>
      </n-gi>

      <!-- 内存使用率 -->
      <n-gi>
        <n-card title="内存使用率">
          <div ref="memChartRef" style="height: 250px;"></div>
        </n-card>
      </n-gi>

      <!-- 磁盘使用 -->
      <n-gi>
        <n-card title="磁盘使用">
          <div ref="diskChartRef" style="height: 250px;"></div>
        </n-card>
      </n-gi>

      <!-- 网络流量 -->
      <n-gi>
        <n-card title="网络流量">
          <div ref="netChartRef" style="height: 250px;"></div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 进程列表 -->
    <n-card title="进程管理" style="margin-top: 16px;">
      <n-data-table
        :columns="processColumns"
        :data="processes"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  NGrid,
  NGi,
  NCard,
  NDataTable,
  NButton,
  NProgress,
  type DataTableColumns
} from 'naive-ui'
import * as echarts from 'echarts'
import { api } from '@/api'

interface Process {
  pid: number
  name: string
  cpu: number
  memory: number
  status: string
}

const loading = ref(false)
const processes = ref<Process[]>([])

let cpuChart: echarts.ECharts | null = null
let memChart: echarts.ECharts | null = null
let diskChart: echarts.ECharts | null = null
let netChart: echarts.ECharts | null = null

const cpuChartRef = ref<HTMLElement>()
const memChartRef = ref<HTMLElement>()
const diskChartRef = ref<HTMLElement>()
const netChartRef = ref<HTMLElement>()

const processColumns: DataTableColumns<Process> = [
  { title: 'PID', key: 'pid', width: 100 },
  { title: '名称', key: 'name' },
  {
    title: 'CPU',
    key: 'cpu',
    width: 150,
    render(row) {
      return h(NProgress, {
        type: 'line',
        percentage: row.cpu,
        indicatorPlacement: 'inside',
        status: row.cpu > 80 ? 'error' : row.cpu > 50 ? 'warning' : 'success'
      })
    }
  },
  {
    title: '内存',
    key: 'memory',
    width: 150,
    render(row) {
      return h(NProgress, {
        type: 'line',
        percentage: row.memory,
        indicatorPlacement: 'inside',
        status: row.memory > 80 ? 'error' : row.memory > 50 ? 'warning' : 'success'
      })
    }
  },
  { title: '状态', key: 'status', width: 100 }
]

let timer: number

onMounted(async () => {
  initCharts()
  await loadData()
  timer = setInterval(loadData, 5000)
})

onUnmounted(() => {
  clearInterval(timer)
  cpuChart?.dispose()
  memChart?.dispose()
  diskChart?.dispose()
  netChart?.dispose()
})

function initCharts() {
  if (cpuChartRef.value) {
    cpuChart = echarts.init(cpuChartRef.value)
    cpuChart.setOption({
      series: [{
        type: 'gauge',
        detail: { formatter: '{value}%' },
        data: [{ value: 0 }]
      }]
    })
  }

  if (memChartRef.value) {
    memChart = echarts.init(memChartRef.value)
    memChart.setOption({
      series: [{
        type: 'gauge',
        detail: { formatter: '{value}%' },
        data: [{ value: 0 }]
      }]
    })
  }

  if (diskChartRef.value) {
    diskChart = echarts.init(diskChartRef.value)
    diskChart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['50%', '70%'],
        data: [
          { value: 0, name: '已用' },
          { value: 100, name: '可用' }
        ]
      }]
    })
  }

  if (netChartRef.value) {
    netChart = echarts.init(netChartRef.value)
    netChart.setOption({
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [
        { name: '入站', type: 'line', smooth: true, data: [] },
        { name: '出站', type: 'line', smooth: true, data: [] }
      ]
    })
  }
}

async function loadData() {
  try {
    const [sys, procs] = await Promise.all([
      api.monitor.system(),
      api.monitor.processes()
    ])

    cpuChart?.setOption({
      series: [{ data: [{ value: sys.cpu }] }]
    })

    memChart?.setOption({
      series: [{ data: [{ value: sys.memory }] }]
    })

    diskChart?.setOption({
      series: [{
        data: [
          { value: sys.diskUsed, name: '已用' },
          { value: sys.diskTotal - sys.diskUsed, name: '可用' }
        ]
      }]
    })

    processes.value = procs
  } catch (err) {
    console.error('Failed to load monitor data:', err)
  }
}
</script>

<style scoped>
.monitor-page {
  max-width: 1400px;
}
</style>
