import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'

export interface Skill {
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
  /** 从 SKILL.md 提取的配置字段定义 */
  configOptions?: SkillConfigOption[]
}

/** 技能配置字段定义 */
export interface SkillConfigOption {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  options?: { label: string; value: string }[]
  required?: boolean
  placeholder?: string
}

export interface SkillCategory {
  id: string
  name: string
  nameZh: string
  icon: string
  count: number
}

/** 从 SKILL.md YAML frontmatter 中提取的信息 */
interface SkillMeta {
  name?: string
  description?: string
  nameZh?: string
  descriptionZh?: string
  category?: string
  tags?: string[]
  icon?: string
  homepage?: string
  config?: SkillConfigOption[]
}

class SkillService {
  private openclawDir: string
  private skillsDir: string
  private coreSkillsDir: string
  private cacheDir: string
  private skillCache: Map<string, Skill> = new Map()
  private cacheExpiry: number = 3600000 // 1小时缓存
  private lastCacheUpdate: number = 0

  constructor() {
    this.openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    this.skillsDir = path.join(this.openclawDir, 'workspace', 'skills')
    this.coreSkillsDir = path.join(this.openclawDir, '..', 'core_skills')
    this.cacheDir = path.join(this.openclawDir, 'cache', 'skills')
  }

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    await fs.ensureDir(this.skillsDir)
    await fs.ensureDir(this.cacheDir)
  }

  /**
   * 获取技能市场列表 —— 本地已安装技能 + 远程市场
   */
  async getMarketSkills(category?: string, search?: string): Promise<Skill[]> {
    try {
      // 1. 优先扫描本地已安装技能作为市场数据源
      const localSkills = await this.scanLocalSkills()
      const localMap = new Map<string, Skill>()
      for (const s of localSkills) {
        localMap.set(s.id, s)
      }

      // 2. 尝试合并远程缓存数据（如果有）
      if (Date.now() - this.lastCacheUpdate > this.cacheExpiry) {
        await this.fetchRemoteCache(localMap)
      }

      // 3. 最终列表 = 本地 + 缓存中本地没有的
      const allSkills = new Map(localMap)
      for (const [id, skill] of this.skillCache) {
        if (!allSkills.has(id)) {
          skill.installed = false
          allSkills.set(id, skill)
        }
      }

      let skills = Array.from(allSkills.values())

      // 分类过滤
      if (category) {
        skills = skills.filter(s => s.category === category)
      }

      // 搜索过滤——同时覆盖本地和远程技能
      if (search) {
        const searchLower = search.toLowerCase()
        skills = skills.filter(s =>
          s.name.toLowerCase().includes(searchLower) ||
          s.nameZh?.includes(search) ||
          s.description.toLowerCase().includes(searchLower) ||
          s.descriptionZh?.includes(search) ||
          s.tags.some(t => t.toLowerCase().includes(searchLower))
        )
      }

      return skills.sort((a, b) => b.downloads - a.downloads)
    } catch (error) {
      logger.error('Failed to get market skills:', error)
      return this.scanLocalSkills()
    }
  }

  /**
   * 获取已安装技能列表
   */
  async getInstalledSkills(): Promise<Skill[]> {
    return this.scanLocalSkills()
  }

  /**
   * 扫描本地 + core_skills 目录获取已安装技能
   */
  private async scanLocalSkills(): Promise<Skill[]> {
    const dirsToScan = [this.skillsDir]
    // 同时扫描 core_skills（如果存在且不同）
    try {
      if (await fs.pathExists(this.coreSkillsDir)) {
        dirsToScan.push(this.coreSkillsDir)
      }
    } catch { /* ignore */ }

    const skills: Skill[] = []
    const seen = new Set<string>()

    for (const dir of dirsToScan) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          if (seen.has(entry.name)) continue
          seen.add(entry.name)

          const skillPath = path.join(dir, entry.name)
          const skill = await this.loadSkillInfo(skillPath)
          if (skill) {
            skill.installed = true
            skills.push(skill)
          }
        }
      } catch {
        // 目录不存在或无权访问
      }
    }

    return skills
  }

  /**
   * 安装技能
   */
  async installSkill(skillId: string): Promise<void> {
    try {
      logger.info(`Installing skill: ${skillId}`)
      const { spawn } = await import('child_process')
      const child = spawn('npx', ['clawhub', 'install', skillId], {
        cwd: this.openclawDir,
        stdio: 'ignore'
      })
      await new Promise((resolve, reject) => {
        child.on('exit', (code) => {
          if (code === 0) {
            logger.info(`Skill ${skillId} installed successfully`)
            resolve(undefined)
          } else {
            reject(new Error(`Install failed with code ${code}`))
          }
        })
        child.on('error', reject)
      })
    } catch (error) {
      logger.error(`Failed to install skill ${skillId}:`, error)
      throw error
    }
  }

  /**
   * 卸载技能
   */
  async uninstallSkill(skillId: string): Promise<void> {
    try {
      logger.info(`Uninstalling skill: ${skillId}`)
      const paths = [path.join(this.skillsDir, skillId)]
      try {
        if (await fs.pathExists(this.coreSkillsDir)) {
          const corePath = path.join(this.coreSkillsDir, skillId)
          if (await fs.pathExists(corePath)) {
            paths.push(corePath)
          }
        }
      } catch { /* ignore */ }

      for (const p of paths) {
        if (await fs.pathExists(p)) {
          await fs.remove(p)
          logger.info(`Removed ${p}`)
        }
      }
    } catch (error) {
      logger.error(`Failed to uninstall skill ${skillId}:`, error)
      throw error
    }
  }

  /**
   * 启用/禁用技能
   */
  async toggleSkill(skillId: string, enabled: boolean): Promise<void> {
    try {
      const skillPath = await this.findSkillPath(skillId)
      if (!skillPath) {
        throw new Error(`Skill ${skillId} not found`)
      }
      const configPath = path.join(skillPath, 'config.json')
      let config: any = {}
      if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath)
      }
      config.enabled = enabled
      await fs.writeJson(configPath, config, { spaces: 2 })
      logger.info(`Skill ${skillId} ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      logger.error(`Failed to toggle skill ${skillId}:`, error)
      throw error
    }
  }

  /**
   * 配置技能
   */
  async configureSkill(skillId: string, config: any): Promise<void> {
    try {
      const skillPath = await this.findSkillPath(skillId) || path.join(this.skillsDir, skillId)
      const configPath = path.join(skillPath, 'config.json')
      await fs.ensureDir(skillPath)
      await fs.writeJson(configPath, config, { spaces: 2 })
      logger.info(`Skill ${skillId} configured`)
    } catch (error) {
      logger.error(`Failed to configure skill ${skillId}:`, error)
      throw error
    }
  }

  /**
   * 获取技能分类
   */
  async getCategories(): Promise<SkillCategory[]> {
    const skills = await this.scanLocalSkills()
    const categoryCount: Record<string, number> = {}
    for (const s of skills) {
      categoryCount[s.category] = (categoryCount[s.category] || 0) + 1
    }

    const categories: SkillCategory[] = [
      { id: 'ai', name: 'AI & ML', nameZh: '人工智能', icon: '🤖', count: 0 },
      { id: 'productivity', name: 'Productivity', nameZh: '效率工具', icon: '⚡', count: 0 },
      { id: 'communication', name: 'Communication', nameZh: '通讯', icon: '💬', count: 0 },
      { id: 'data', name: 'Data', nameZh: '数据处理', icon: '📊', count: 0 },
      { id: 'automation', name: 'Automation', nameZh: '自动化', icon: '🔄', count: 0 },
      { id: 'entertainment', name: 'Entertainment', nameZh: '娱乐', icon: '🎮', count: 0 },
      { id: 'utilities', name: 'Utilities', nameZh: '实用工具', icon: '🔧', count: 0 },
      { id: 'integration', name: 'Integration', nameZh: '集成', icon: '🔗', count: 0 }
    ]

    for (const c of categories) {
      c.count = categoryCount[c.id] || 0
    }

    return categories
  }

  /**
   * 从远程获取技能缓存
   */
  private async fetchRemoteCache(localSkills: Map<string, Skill>): Promise<void> {
    try {
      const response = await fetch('https://api.clawhub.ai/skills')
      if (response.ok) {
        const data = (await response.json()) as any
        for (const skill of data.skills || []) {
          if (!localSkills.has(skill.id)) {
            this.skillCache.set(skill.id, {
              id: skill.id,
              name: skill.name || skill.id,
              nameZh: skill.name_zh || '',
              description: skill.description || '',
              descriptionZh: skill.description_zh || '',
              author: skill.author || 'unknown',
              version: skill.version || '1.0.0',
              category: this.guessCategory(skill.tags || []),
              tags: skill.tags || [],
              rating: skill.rating || 0,
              downloads: skill.downloads || 0,
              installed: false,
              enabled: true,
              icon: skill.icon || '',
              homepage: skill.homepage || skill.repository || '',
            })
          }
        }
        this.lastCacheUpdate = Date.now()
        logger.info('Skill cache updated from remote')
      }
    } catch (error) {
      logger.warn('Failed to fetch skills from remote')
    }
  }

  /**
   * 根据标签猜测分类
   */
  private guessCategory(tags: string[]): string {
    const tag = tags.join(' ').toLowerCase()
    if (/ai|ml|nlp|chat|gpt|llm/.test(tag)) return 'ai'
    if (/productivity|todo|reminder|calendar/.test(tag)) return 'productivity'
    if (/communication|chat|email|sms/.test(tag)) return 'communication'
    if (/data|database|csv|excel/.test(tag)) return 'data'
    if (/automation|workflow|cron/.test(tag)) return 'automation'
    if (/game|fun|music/.test(tag)) return 'entertainment'
    if (/integrat|webhook|api/.test(tag)) return 'integration'
    return 'utilities'
  }

  /**
   * 查找技能路径（先在 skills 目录找，再在 core_skills 找）
   */
  private async findSkillPath(skillId: string): Promise<string | null> {
    const skillsPath = path.join(this.skillsDir, skillId)
    if (await fs.pathExists(skillsPath)) return skillsPath

    const corePath = path.join(this.coreSkillsDir, skillId)
    if (await fs.pathExists(corePath)) return corePath

    return null
  }

  /**
   * 加载技能信息 —— 从 SKILL.md 和 package.json 提取
   */
  private async loadSkillInfo(skillPath: string): Promise<Skill | null> {
    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md')
      const packagePath = path.join(skillPath, 'package.json')
      const configPath = path.join(skillPath, 'config.json')

      let name = path.basename(skillPath)
      let description = ''
      let version = '1.0.0'
      let enabled = true
      let meta: SkillMeta = {}
      let configOptions: SkillConfigOption[] = []

      // 1. 从 SKILL.md 提取信息（含 YAML frontmatter）
      if (await fs.pathExists(skillMdPath)) {
        const content = await fs.readFile(skillMdPath, 'utf-8')
        meta = this.parseSkillMeta(content)
        name = meta.name || name
        description = meta.description || description
      }

      // 2. 从 package.json 补充信息
      if (await fs.pathExists(packagePath)) {
        const pkg = await fs.readJson(packagePath)
        name = meta.name || pkg.name || name
        description = meta.description || pkg.description || description
        version = pkg.version || version
      }

      // 3. 从 SKILL.md 的 config 字段提取配置选项
      if (meta.config && meta.config.length > 0) {
        configOptions = meta.config
      } else {
        // 兜底：尝试从 package.json 的 configSchema 或 inputs 读取
        try {
          const pkg = await fs.readJson(packagePath)
          if (pkg.configSchema) {
            configOptions = pkg.configSchema
          } else if (pkg.inputs) {
            configOptions = pkg.inputs
          }
        } catch { /* ignore */ }
      }

      // 4. 读取已保存的配置状态
      if (await fs.pathExists(configPath)) {
        const localConfig = await fs.readJson(configPath)
        enabled = localConfig.enabled !== false
      }

      return {
        id: path.basename(skillPath),
        name,
        nameZh: meta.nameZh || '',
        description,
        descriptionZh: meta.descriptionZh || '',
        author: 'local',
        version,
        category: meta.category || this.guessCategory(meta.tags || []),
        tags: meta.tags || [],
        rating: meta.config ? 4.0 : 3.0,
        downloads: 0,
        installed: true,
        enabled,
        icon: meta.icon || '📦',
        homepage: meta.homepage || '',
        configOptions,
      }
    } catch (error) {
      logger.error(`Failed to load skill info: ${skillPath}`, error)
      return null
    }
  }

  /**
   * 解析 SKILL.md 的 YAML frontmatter（首行 --- 之间的内容）
   * 以及 markdown 中的中文标题和描述
   */
  private parseSkillMeta(content: string): SkillMeta {
    const meta: SkillMeta = {}

    // 提取 YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const yamlLines = frontmatterMatch[1].split('\n')
      for (const line of yamlLines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.substring(0, colonIdx).trim()
        const val = line.substring(colonIdx + 1).trim().replace(/^"|"$/g, '')

        if (key === 'name') meta.name = val
        if (key === 'description') meta.description = val
        if (key === 'name_zh' || key === 'nameZh') meta.nameZh = val
        if (key === 'description_zh' || key === 'descriptionZh') meta.descriptionZh = val
        if (key === 'homepage') meta.homepage = val
        if (key === 'icon' || key === 'emoji') meta.icon = val
        if (key === 'category') meta.category = val
        if (key === 'tags') {
          try {
            meta.tags = JSON.parse(val)
          } catch {
            meta.tags = val.split(',').map(t => t.trim())
          }
        }
        if (key === 'config' || key === 'inputs' || key === 'configSchema') {
          try {
            const parsed = JSON.parse(val)
            meta.config = parsed
          } catch {
            // YAML 格式的 config 可能无法用简单解析
          }
        }
      }
    }

    // 如果没有 name_zh/descriptionZh，尝试从正文提取中文信息
    if (!meta.nameZh) {
      const zhTitleMatch = content.match(/^#\s+([\u4e00-\u9fff]+)/m)
      if (zhTitleMatch) {
        meta.nameZh = zhTitleMatch[1]
      }
    }

    return meta
  }
}

export const skillService = new SkillService()
