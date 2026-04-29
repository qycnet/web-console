<template>
  <div class="skills-page">
    <n-tabs v-model:value="activeTab" type="line">
      <n-tab-pane name="installed" tab="已安装">
        <n-grid :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="skill in installedSkills" :key="skill.id">
            <n-card :title="skill.name" hoverable>
              <template #header-extra>
                <n-tag :type="skill.enabled ? 'success' : 'default'">
                  {{ skill.enabled ? '已启用' : '已禁用' }}
                </n-tag>
              </template>
              <p class="skill-desc">{{ skill.description }}</p>
              <template #footer>
                <n-space>
                  <n-button size="small" @click="handleConfigure(skill)">
                    配置
                  </n-button>
                  <n-button size="small" @click="handleToggle(skill)">
                    {{ skill.enabled ? '禁用' : '启用' }}
                  </n-button>
                  <n-button size="small" type="error" @click="handleUninstall(skill)">
                    卸载
                  </n-button>
                </n-space>
              </template>
            </n-card>
          </n-gi>
        </n-grid>
      </n-tab-pane>

      <n-tab-pane name="market" tab="技能市场">
        <n-space vertical size="large">
          <n-input-group>
            <n-input v-model:value="searchQuery" placeholder="搜索技能..." clearable>
              <template #prefix>
                <n-icon :component="SearchOutline" />
              </template>
            </n-input>
            <n-button type="primary">搜索</n-button>
          </n-input-group>

          <n-grid :cols="3" :x-gap="16" :y-gap="16">
            <n-gi v-for="skill in marketSkills" :key="skill.id">
              <n-card :title="skill.name" hoverable>
                <template #header-extra>
                  <n-rate :value="skill.rating" readonly size="small" />
                </template>
                <p class="skill-desc">{{ skill.description }}</p>
                <n-space style="margin-top: 8px;">
                  <n-tag v-for="tag in skill.tags" :key="tag" size="small">
                    {{ tag }}
                  </n-tag>
                </n-space>
                <template #footer>
                  <n-button
                    type="primary"
                    size="small"
                    :loading="installing === skill.id"
                    :disabled="isInstalled(skill.id)"
                    @click="handleInstall(skill)"
                  >
                    {{ isInstalled(skill.id) ? '已安装' : '安装' }}
                  </n-button>
                </template>
              </n-card>
            </n-gi>
          </n-grid>
        </n-space>
      </n-tab-pane>
    </n-tabs>

    <!-- 配置弹窗 -->
    <n-modal v-model:show="showConfig" preset="card" title="技能配置" style="width: 600px;">
      <n-form v-if="configuringSkill" label-placement="left" label-width="120px">
        <n-form-item
          v-for="option in configuringSkill.configOptions"
          :key="option.key"
          :label="option.label"
        >
          <n-input v-if="option.type === 'string'" v-model:value="configForm[option.key]" />
          <n-input-number v-else-if="option.type === 'number'" v-model:value="configForm[option.key]" />
          <n-switch v-else-if="option.type === 'boolean'" v-model:value="configForm[option.key]" />
          <n-select v-else-if="option.type === 'select'" v-model:value="configForm[option.key]" :options="option.options" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showConfig = false">取消</n-button>
          <n-button type="primary" @click="handleSaveConfig">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  NTabs,
  NTabPane,
  NGrid,
  NGi,
  NCard,
  NTag,
  NButton,
  NSpace,
  NRate,
  NInputGroup,
  NInput,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInputNumber,
  NSwitch,
  NSelect,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { api } from '@/api'

interface Skill {
  id: string
  name: string
  description: string
  enabled: boolean
  configOptions?: any[]
}

interface MarketSkill extends Skill {
  rating: number
  tags: string[]
}

const message = useMessage()
const dialog = useDialog()

const activeTab = ref('installed')
const searchQuery = ref('')
const installedSkills = ref<Skill[]>([])
const marketSkills = ref<MarketSkill[]>([])
const installing = ref<string | null>(null)
const showConfig = ref(false)
const configuringSkill = ref<Skill | null>(null)
const configForm = ref<Record<string, any>>({})

onMounted(async () => {
  await Promise.all([loadInstalled(), loadMarket()])
})

async function loadInstalled() {
  try {
    installedSkills.value = await api.skills.installed()
  } catch (err) {
    console.error('Failed to load installed skills:', err)
  }
}

async function loadMarket() {
  try {
    marketSkills.value = await api.skills.list()
  } catch (err) {
    console.error('Failed to load market skills:', err)
  }
}

function isInstalled(skillId: string) {
  return installedSkills.value.some(s => s.id === skillId)
}

async function handleInstall(skill: MarketSkill) {
  installing.value = skill.id
  try {
    await api.skills.install(skill.id)
    message.success(`${skill.name} 安装成功`)
    await loadInstalled()
  } catch (err) {
    message.error('安装失败')
  } finally {
    installing.value = null
  }
}

function handleConfigure(skill: Skill) {
  configuringSkill.value = skill
  configForm.value = {}
  showConfig.value = true
}

async function handleSaveConfig() {
  if (!configuringSkill.value) return
  try {
    await api.skills.configure(configuringSkill.value.id, configForm.value)
    message.success('配置已保存')
    showConfig.value = false
  } catch (err) {
    message.error('保存失败')
  }
}

async function handleToggle(skill: Skill) {
  try {
    await api.skills.configure(skill.id, { enabled: !skill.enabled })
    skill.enabled = !skill.enabled
    message.success(skill.enabled ? '已启用' : '已禁用')
  } catch (err) {
    message.error('操作失败')
  }
}

function handleUninstall(skill: Skill) {
  dialog.warning({
    title: '确认卸载',
    content: `确定要卸载 ${skill.name} 吗？`,
    positiveText: '卸载',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.skills.uninstall(skill.id)
        message.success('已卸载')
        loadInstalled()
      } catch (err) {
        message.error('卸载失败')
      }
    }
  })
}
</script>

<style scoped>
.skills-page {
  padding: 16px;
}

.skill-desc {
  color: var(--n-text-color-2);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
</style>
