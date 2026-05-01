<template>
  <div class="skills-page">
    <n-tabs v-model:value="activeTab" type="line">
      <n-tab-pane name="installed" tab="已安装">
        <n-grid cols="1 s:2 m:3" :x-gap="16" :y-gap="16">
          <n-gi v-for="skill in installedSkills" :key="skill.id">
            <n-card hoverable>
              <template #header>
                <div class="skill-title-row">
                  <span class="skill-title skill-title-ellipsis">{{ skill.nameZh || skill.name }}</span>
                  <n-tag v-if="skill.source" :type="skill.enabled ? 'success' : 'default'" size="tiny">
                    {{ skill.enabled ? '已启用' : '已禁用' }}
                  </n-tag>
                </div>
              </template>
              <p class="skill-desc">{{ skill.descriptionZh || skill.description }}</p>
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
          <!-- 搜索栏 -->
          <n-input-group>
            <n-input v-model:value="searchQuery" placeholder="搜索技能..." clearable @input="handleInput">
              <template #prefix>
                <n-icon :component="SearchOutline" />
              </template>
            </n-input>
            <n-button type="primary" @click="handleSearch">搜索</n-button>
          </n-input-group>

          <!-- 分类筛选 -->
          <n-tabs v-if="categories.length > 0" v-model:value="activeCategory" type="segment" @update:value="handleCategoryChange">
            <n-tab name="" key="all">全部</n-tab>
            <n-tab v-for="cat in categories" :key="cat.id" :name="cat.id">
              {{ cat.icon }} {{ cat.nameZh }} ({{ cat.count }})
            </n-tab>
          </n-tabs>

          <!-- 技能网格 -->
          <n-grid cols="1 s:2 m:3" :x-gap="16" :y-gap="16">
            <n-gi v-for="skill in filteredMarketSkills" :key="skill.id">
              <n-card hoverable>
                <!-- 标题行：带来源标签 -->
                <template #header>
                  <div class="skill-title-row">
                    <span class="skill-title skill-title-ellipsis">{{ skill.nameZh || skill.name }}</span>
                    <n-tag
                      v-if="skill.source"
                      :type="skill.source === 'community' ? 'warning' : 'info'"
                      size="tiny"
                      round
                      style="flex-shrink: 0;"
                    >
                      {{ skill.source === 'community' ? '社区' : 'clawhub' }}
                    </n-tag>
                  </div>
                </template>
                <template #header-extra>
                  <n-space>
                    <n-tag v-if="skill.nameZh" size="small" type="info">{{ skill.name }}</n-tag>
                    <n-rate :value="skill.rating" readonly size="small" />
                  </n-space>
                </template>
                <p class="skill-desc">{{ skill.descriptionZh || skill.description }}</p>
                <n-space style="margin-top: 8px;">
                  <n-tag v-for="tag in skill.tags" :key="tag" size="small">
                    {{ tag }}
                  </n-tag>
                </n-space>
                <p class="skill-stats" v-if="skill.downloads > 0 || skill.author">
                  📥 {{ skill.downloads >= 1000 ? (skill.downloads / 1000).toFixed(1) + 'k' : skill.downloads }} 下载
                  <span v-if="skill.author"> · 👤 {{ skill.author }}</span>
                </p>
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

          <!-- 空状态 -->
          <n-empty v-if="filteredMarketSkills.length === 0 && !isLoadingMarket" description="没有找到匹配的技能">
            <template #extra>
              <n-button size="small" @click="loadMarket">刷新</n-button>
            </template>
          </n-empty>
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
import { ref, computed, onMounted } from 'vue'
import {
  NTabs,
  NTabPane,
  NTab,
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
  NEmpty,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { api } from '@/api'

interface SkillConfigOption {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  options?: { label: string; value: string }[]
  required?: boolean
  placeholder?: string
}

interface Skill {
  id: string
  name: string
  nameZh?: string
  description: string
  descriptionZh?: string
  author: string
  version: string
  category: string
  tags: string[]
  rating: number
  downloads: number
  installed: boolean
  enabled: boolean
  icon?: string
  homepage?: string
  repository?: string
  source?: 'clawhub' | 'community'
  configOptions?: SkillConfigOption[]
}

interface SkillCategory {
  id: string
  name: string
  nameZh: string
  icon: string
  count: number
}

const message = useMessage()
const dialog = useDialog()

const activeTab = ref('installed')
const searchQuery = ref('')
const activeCategory = ref('')
const installedSkills = ref<Skill[]>([])
const marketSkills = ref<Skill[]>([])
const categories = ref<SkillCategory[]>([])
const installing = ref<string | null>(null)
const isLoadingMarket = ref(false)
const showConfig = ref(false)
const configuringSkill = ref<Skill | null>(null)
const configForm = ref<Record<string, any>>({})

// 根据分类过滤后的技能
const filteredMarketSkills = computed(() => {
  let skills = marketSkills.value
  if (activeCategory.value) {
    skills = skills.filter(s => s.category === activeCategory.value)
  }
  return skills
})

onMounted(async () => {
  await Promise.all([loadInstalled(), loadMarket()])
  loadCategories()
})

async function loadInstalled() {
  try {
    installedSkills.value = await api.skills.installed()
  } catch (err) {
    console.error('Failed to load installed skills:', err)
  }
}

async function loadMarket(search?: string) {
  isLoadingMarket.value = true
  try {
    marketSkills.value = await api.skills.list(search)
    // 加载分类信息
    loadCategories()
  } catch (err) {
    console.error('Failed to load market skills:', err)
  } finally {
    isLoadingMarket.value = false
  }
}

async function loadCategories() {
  try {
    categories.value = await api.skills.categories()
  } catch (err) {
    console.error('Failed to load categories:', err)
  }
}

// 输入时实时搜索（带防抖）
let searchTimer: ReturnType<typeof setTimeout> | null = null
function handleInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadMarket(searchQuery.value || undefined)
  }, 300)
}

function handleSearch() {
  loadMarket(searchQuery.value || undefined)
}

function handleCategoryChange(value: string) {
  activeCategory.value = value
}

function isInstalled(skillId: string) {
  return installedSkills.value.some(s => s.id === skillId)
}

async function handleInstall(skill: Skill) {
  installing.value = skill.id
  try {
    await api.skills.install(skill.id)
    message.success(`${skill.nameZh || skill.name} 安装成功`)
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
    await api.skills.toggle(skill.id, !skill.enabled)
    skill.enabled = !skill.enabled
    message.success(skill.enabled ? '已启用' : '已禁用')
  } catch (err) {
    message.error('操作失败')
  }
}

function handleUninstall(skill: Skill) {
  dialog.warning({
    title: '确认卸载',
    content: `确定要卸载 ${skill.nameZh || skill.name} 吗？`,
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

.skill-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.skill-title {
  font-weight: 500;
  font-size: 15px;
}

.skill-title-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-stats {
  color: var(--n-text-color-3);
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
