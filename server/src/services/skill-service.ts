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
}

export interface SkillCategory {
  id: string
  name: string
  nameZh: string
  icon: string
  count: number
}

class SkillService {
  private openclawDir: string
  private skillsDir: string
  private cacheDir: string
  private skillCache: Map<string, Skill> = new Map()
  private cacheExpiry: number = 3600000 // 1小时缓存
  private lastCacheUpdate: number = 0

  constructor() {
    this.openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    this.skillsDir = path.join(this.openclawDir, 'workspace', 'skills')
    this.cacheDir = path.join(this.openclawDir, 'cache', 'skills')
  }

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    await fs.ensureDir(this.skillsDir)
    await fs.ensureDir(this.cacheDir)
    await this.loadInstalledSkills()
  }

  /**
   * 获取技能市场列表
   */
  async getMarketSkills(category?: string, search?: string): Promise<Skill[]> {
    try {
      // 检查缓存是否过期
      if (Date.now() - this.lastCacheUpdate > this.cacheExpiry) {
        await this.fetchSkillCache()
      }

      let skills = Array.from(this.skillCache.values())

      // 分类过滤
      if (category) {
        skills = skills.filter(s => s.category === category)
      }

      // 搜索过滤
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

      // 标记已安装状态
      const installedIds = await this.getInstalledIds()
      skills = skills.map(s => ({
        ...s,
        installed: installedIds.includes(s.id)
      }))

      return skills.sort((a, b) => b.downloads - a.downloads)
    } catch (error) {
      logger.error('Failed to get market skills:', error)
      return this.getMockMarketSkills()
    }
  }

  /**
   * 获取已安装技能列表
   */
  async getInstalledSkills(): Promise<Skill[]> {
    try {
      const dirs = await fs.readdir(this.skillsDir, { withFileTypes: true })
      const skills: Skill[] = []

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const skillPath = path.join(this.skillsDir, dir.name)
        const skill = await this.loadSkillInfo(skillPath)
        if (skill) {
          skill.installed = true
          skills.push(skill)
        }
      }

      return skills
    } catch (error) {
      logger.error('Failed to get installed skills:', error)
      return []
    }
  }

  /**
   * 安装技能
   */
  async installSkill(skillId: string): Promise<void> {
    try {
      logger.info(`Installing skill: ${skillId}`)

      // 从缓存或远程获取技能信息
      const skillInfo = this.skillCache.get(skillId)
      if (!skillInfo) {
        throw new Error(`Skill ${skillId} not found in cache`)
      }

      // 使用 openclaw CLI 安装
      const { spawn } = await import('child_process')
      const child = spawn('openclaw', ['skill', 'install', skillId], {
        cwd: this.openclawDir
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

      // 更新缓存
      skillInfo.installed = true
      this.skillCache.set(skillId, skillInfo)
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

      const skillPath = path.join(this.skillsDir, skillId)
      if (await fs.pathExists(skillPath)) {
        await fs.remove(skillPath)
        logger.info(`Skill ${skillId} uninstalled successfully`)
      }

      // 更新缓存
      const skillInfo = this.skillCache.get(skillId)
      if (skillInfo) {
        skillInfo.installed = false
        this.skillCache.set(skillId, skillInfo)
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
      const skillPath = path.join(this.skillsDir, skillId)
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
      const skillPath = path.join(this.skillsDir, skillId)
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
    return [
      { id: 'ai', name: 'AI & ML', nameZh: '人工智能', icon: '🤖', count: 0 },
      { id: 'productivity', name: 'Productivity', nameZh: '效率工具', icon: '⚡', count: 0 },
      { id: 'communication', name: 'Communication', nameZh: '通讯', icon: '💬', count: 0 },
      { id: 'data', name: 'Data', nameZh: '数据处理', icon: '📊', count: 0 },
      { id: 'automation', name: 'Automation', nameZh: '自动化', icon: '🔄', count: 0 },
      { id: 'entertainment', name: 'Entertainment', nameZh: '娱乐', icon: '🎮', count: 0 },
      { id: 'utilities', name: 'Utilities', nameZh: '实用工具', icon: '🔧', count: 0 },
      { id: 'integration', name: 'Integration', nameZh: '集成', icon: '🔗', count: 0 }
    ]
  }

  /**
   * 从远程获取技能缓存
   */
  private async fetchSkillCache(): Promise<void> {
    try {
      // 尝试从腾讯云技能站 API 获取
      const response = await fetch('https://api.clawhub.ai/skills')
      if (response.ok) {
        const data = await response.json()
        for (const skill of data.skills || []) {
          this.skillCache.set(skill.id, {
            ...skill,
            nameZh: skill.name_zh || await this.translateToChinese(skill.name),
            descriptionZh: skill.description_zh || await this.translateToChinese(skill.description)
          })
        }
        this.lastCacheUpdate = Date.now()
        logger.info('Skill cache updated from remote')
        return
      }
    } catch (error) {
      logger.warn('Failed to fetch skills from remote, using mock data')
    }

    // 使用模拟数据
    this.loadMockCache()
  }

  /**
   * AI 翻译为中文
   */
  private async translateToChinese(text: string): Promise<string> {
    // TODO: 调用翻译 API
    return text
  }

  /**
   * 加载已安装技能
   */
  private async loadInstalledSkills(): Promise<void> {
    try {
      const skills = await this.getInstalledSkills()
      for (const skill of skills) {
        this.skillCache.set(skill.id, skill)
      }
    } catch (error) {
      logger.error('Failed to load installed skills:', error)
    }
  }

  /**
   * 获取已安装技能 ID 列表
   */
  private async getInstalledIds(): Promise<string[]> {
    try {
      const dirs = await fs.readdir(this.skillsDir, { withFileTypes: true })
      return dirs.filter(d => d.isDirectory()).map(d => d.name)
    } catch {
      return []
    }
  }

  /**
   * 加载技能信息
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

      // 读取 SKILL.md
      if (await fs.pathExists(skillMdPath)) {
        const content = await fs.readFile(skillMdPath, 'utf-8')
        const titleMatch = content.match(/^#\s+(.+)$/m)
        if (titleMatch) name = titleMatch[1]
        const descMatch = content.match(/^>\s*(.+)$/m)
        if (descMatch) description = descMatch[1]
      }

      // 读取 package.json
      if (await fs.pathExists(packagePath)) {
        const pkg = await fs.readJson(packagePath)
        name = pkg.name || name
        description = pkg.description || description
        version = pkg.version || version
      }

      // 读取配置
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath)
        enabled = config.enabled !== false
      }

      return {
        id: path.basename(skillPath),
        name,
        description,
        author: 'local',
        version,
        category: 'utilities',
        tags: [],
        rating: 0,
        downloads: 0,
        installed: true,
        enabled
      }
    } catch (error) {
      logger.error('Failed to load skill info:', error)
      return null
    }
  }

  /**
   * 加载模拟缓存数据
   */
  private loadMockCache(): void {
    const mockSkills: Skill[] = [
      {
        id: 'weather',
        name: 'Weather',
        nameZh: '天气查询',
        description: 'Get real-time weather information for any location',
        descriptionZh: '查询全球各地实时天气信息',
        author: 'openclaw',
        version: '1.0.0',
        category: 'utilities',
        tags: ['weather', 'forecast', 'temperature'],
        rating: 4.5,
        downloads: 1500,
        installed: false,
        enabled: true,
        icon: '🌤️'
      },
      {
        id: 'translator',
        name: 'Translator',
        nameZh: '翻译助手',
        description: 'Multi-language translation service',
        descriptionZh: '多语言实时翻译服务',
        author: 'openclaw',
        version: '1.2.0',
        category: 'ai',
        tags: ['translate', 'language', 'nlp'],
        rating: 4.8,
        downloads: 2300,
        installed: false,
        enabled: true,
        icon: '🌐'
      },
      {
        id: 'reminder',
        name: 'Reminder',
        nameZh: '提醒助手',
        description: 'Smart reminder and todo management',
        descriptionZh: '智能提醒和待办事项管理',
        author: 'openclaw',
        version: '1.1.0',
        category: 'productivity',
        tags: ['reminder', 'todo', 'schedule'],
        rating: 4.3,
        downloads: 1800,
        installed: false,
        enabled: true,
        icon: '⏰'
      },
      {
        id: 'news',
        name: 'News',
        nameZh: '新闻资讯',
        description: 'Get latest news and trending topics',
        descriptionZh: '获取最新新闻资讯和热点事件',
        author: 'openclaw',
        version: '1.0.0',
        category: 'information',
        tags: ['news', 'trending', 'headlines'],
        rating: 4.2,
        downloads: 1200,
        installed: false,
        enabled: true,
        icon: '📰'
      },
      {
        id: 'calendar',
        name: 'Calendar',
        nameZh: '日程管理',
        description: 'Calendar and schedule management',
        descriptionZh: '日历和日程安排管理',
        author: 'openclaw',
        version: '1.3.0',
        category: 'productivity',
        tags: ['calendar', 'schedule', 'events'],
        rating: 4.6,
        downloads: 2100,
        installed: false,
        enabled: true,
        icon: '📅'
      },
      {
        id: 'email',
        name: 'Email',
        nameZh: '邮件助手',
        description: 'Email sending and management',
        descriptionZh: '邮件发送和管理服务',
        author: 'openclaw',
        version: '1.0.0',
        category: 'communication',
        tags: ['email', 'smtp', 'mail'],
        rating: 4.1,
        downloads: 900,
        installed: false,
        enabled: true,
        icon: '📧'
      }
    ]

    for (const skill of mockSkills) {
      this.skillCache.set(skill.id, skill)
    }
    this.lastCacheUpdate = Date.now()
  }

  /**
   * 获取模拟市场数据
   */
  private getMockMarketSkills(): Skill[] {
    this.loadMockCache()
    return Array.from(this.skillCache.values())
  }
}

export const skillService = new SkillService()
