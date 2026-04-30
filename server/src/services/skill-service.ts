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

      // 搜索过滤——同时覆盖本地和远程技能，支持中英文搜索
      if (search) {
        const searchLower = search.toLowerCase()
        skills = skills.filter(s =>
          // 英文名匹配
          s.name.toLowerCase().includes(searchLower) ||
          // 中文名匹配
          s.nameZh?.includes(search) ||
          // 中文标签匹配
          this.getChineseTags(s.tags).some(t => t.includes(search)) ||
          // 英文描述匹配
          s.description.toLowerCase().includes(searchLower) ||
          // 中文描述匹配
          s.descriptionZh?.includes(search) ||
          // 标签匹配（中英文）
          s.tags.some(t => t.toLowerCase().includes(searchLower)) ||
          // 根据中文关键词推测对应的英文 skill
          this.searchByChineseKeyword(searchLower, s)
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
   * 从远程获取技能缓存 —— 使用 clawhub CLI 替代已失效的 HTTP API
   */
  private async fetchRemoteCache(localSkills: Map<string, Skill>): Promise<void> {
    try {
      const { execSync } = await import('child_process')
      const output = execSync('npx clawhub explore --limit 80', {
        cwd: this.openclawDir,
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 1024 * 1024
      })

      const lines = output.split('\n').filter(Boolean)
      // clawhub explore 输出格式：
      // 技能名  描述  分类  标签
      // 每行用空格分隔
      for (const line of lines) {
        const parts = line.trim().split(/\s{2,}/)
        if (parts.length < 1) continue
        const skillId = parts[0].trim()
        if (!skillId || skillId.startsWith('─') || skillId.startsWith('名') || skillId.startsWith('━')) continue

        if (!localSkills.has(skillId) && !this.skillCache.has(skillId)) {
          const name = parts[1] || skillId
          const desc = parts[2] || ''
          this.skillCache.set(skillId, {
            id: skillId,
            name,
            nameZh: '',
            description: desc,
            descriptionZh: '',
            author: 'market',
            version: '1.0.0',
            category: 'utilities',
            tags: (parts[3] || '').split(',').map(t => t.trim()).filter(Boolean),
            rating: 3.0,
            downloads: 0,
            installed: false,
            enabled: true,
            configOptions: [],
          })
        }
      }

      this.lastCacheUpdate = Date.now()
      logger.info(`Skill cache updated from clawhub explore (${this.skillCache.size} market skills)`)
    } catch (error) {
      logger.warn('Failed to fetch skills from clawhub: ' + (error as Error).message)
      // 兜底：尝试 HTTP API
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
                category: this.guessCategory(skill.tags || [], skill.name, skill.description),
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
          logger.info('Skill cache updated from HTTP API fallback')
        }
      } catch {
        // 都失败就算了，至少本地技能可用
      }
    }
  }

  /**
   * 根据标签和名称描述猜测分类 —— 不再全部归类为 utilities
   */
  private guessCategory(tags: string[], name?: string, description?: string): string {
    const text = [tags.join(' '), name || '', description || ''].join(' ').toLowerCase()
    if (/ai|ml|nlp|chat|gpt|llm|deepseek|claude|openai|translate/.test(text)) return 'ai'
    if (/productivity|todo|reminder|calendar|schedule|task|笔记/.test(text)) return 'productivity'
    if (/communication|chat|email|sms|wechat|feishu|dingtalk|wecom/.test(text)) return 'communication'
    if (/data|database|csv|excel|report|统计|数据/.test(text)) return 'data'
    if (/automation|workflow|cron|deploy|自动化/.test(text)) return 'automation'
    if (/game|fun|music|video|image|娱乐|音乐/.test(text)) return 'entertainment'
    if (/integrat|webhook|api|connect|集成/.test(text)) return 'integration'
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

      // 3. 提取 configOptions
      // 优先尝试 SKILL.md frontmatter 中的 config 或 metadata.openclaw.config
      configOptions = await this.extractConfigOptions(skillMdPath, meta, packagePath)

      // 4. 读取已保存的配置状态
      if (await fs.pathExists(configPath)) {
        const localConfig = await fs.readJson(configPath)
        enabled = localConfig.enabled !== false
      }

      return {
        id: path.basename(skillPath),
        name,
        nameZh: meta.nameZh || this.getChineseName(skillPath, meta),
        description,
        descriptionZh: meta.descriptionZh || '',
        author: 'local',
        version,
        category: meta.category || this.guessCategory(meta.tags || [], meta.name, meta.description),
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
   * 提取配置项定义 —— 从 SKILL.md frontmatter、metadata 或 package.json
   */
  private async extractConfigOptions(
    skillMdPath: string,
    meta: SkillMeta,
    packagePath: string
  ): Promise<SkillConfigOption[]> {
    // 优先级1：从 meta 中直接读取已解析的 config
    if (meta.config && meta.config.length > 0) {
      return meta.config
    }

    // 优先级2：从 metadata.openclaw.config 提取
    const mdContent = await fs.readFile(skillMdPath, 'utf-8').catch(() => '')
    const frontmatterMatch = mdContent.match(/^---\s*\n([\s\S]*?)\n---/)
    if (frontmatterMatch) {
      const lines = frontmatterMatch[1].split('\n')
      // 读取 metadata 行（可能是多行 YAML 对象）
      const metaStr = this.extractYamlField(lines, 'metadata')
      if (metaStr) {
        try {
          const metaObj = JSON.parse(metaStr)
          const configFields = metaObj?.openclaw?.config || metaObj?.config
          if (Array.isArray(configFields) && configFields.length > 0) {
            return configFields
          }
        } catch { /* 非 JSON 格式的 YAML 对象 */ }
      }

      // 读取 inputs 行
      const inputsStr = this.extractYamlField(lines, 'inputs')
      if (inputsStr) {
        try {
          const inputs = JSON.parse(inputsStr)
          if (Array.isArray(inputs) && inputs.length > 0) {
            return inputs.map((i: any) => ({
              key: i.key || i.id || i.name || '',
              label: i.label || i.name || i.key || '',
              type: i.type || 'string',
              ...i
            }))
          }
        } catch { /* 非 JSON 格式 */ }
      }
    }

    // 优先级3：从 package.json 的 configSchema 或 inputs
    try {
      if (await fs.pathExists(packagePath)) {
        const pkg = await fs.readJson(packagePath)
        const schema = pkg.configSchema || pkg.inputs
        if (Array.isArray(schema) && schema.length > 0) {
          return schema.map((i: any) => ({
            key: i.key || i.id || i.name || '',
            label: i.label || i.name || i.key || '',
            type: i.type || 'string',
            ...i
          }))
        }
      }
    } catch { /* ignore */ }

    // 优先级4：从 SKILL.md 正文的 ## Config 或 ## Configuration 段落提取
    const configSection = mdContent.match(/^##\s*(Config|Configuration|配置)\s*\n([\s\S]*?)(?=\n##|\n---|$)/m)
    if (configSection) {
      const configText = configSection[2]
      // 尝试解析 JSON 数组
      const jsonMatch = configText.match(/\[\s*\{[\s\S]*?\}\s*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) {
            return parsed.map((i: any) => ({
              key: i.key || i.id || i.name || '',
              label: i.label || i.name || i.key || '',
              type: i.type || 'string',
              ...i
            }))
          }
        } catch { /* ignore */ }
      }
      // 尝试解析 key-value 行
      const kvMatch = configText.match(/-?\s*`?(\w+)`?\s*:\s*(.+)/gm)
      if (kvMatch) {
        return kvMatch.map((line) => {
          const m = line.match(/`?(\w+)`?\s*:\s*(.+)/)
          if (m) {
            return { key: m[1], label: m[1], type: 'string', placeholder: m[2].replace(/`/g, '').trim() }
          }
          return null
        }).filter(Boolean) as SkillConfigOption[]
      }
    }

    return []
  }

  /**
   * 从 YAML 行中提取指定字段的多行值
   */
  private extractYamlField(lines: string[], field: string): string {
    let result = ''
    let inField = false
    let braceDepth = 0

    for (const line of lines) {
      if (!inField) {
        if (line.trim().startsWith(field + ':')) {
          inField = true
          const val = line.substring(line.indexOf(':') + 1).trim()
          if (val) {
            // 单行值
            const curlyMatch = val.match(/\{/)
            if (curlyMatch) braceDepth = 1
            result = val
          }
        }
        continue
      }

      // 多行值
      result += '\n' + line
      // 统计花括号
      for (const ch of line) {
        if (ch === '{') braceDepth++
        if (ch === '}') braceDepth--
      }
      if (braceDepth <= 0) break
    }

    return result
  }

  /**
   * 获取中文标签
   */
  private getChineseTags(tags: string[]): string[] {
    return tags.filter(t => /[\u4e00-\u9fff]/.test(t))
  }

  /**
   * 通过中文关键词推测英文 skill
   */
  private searchByChineseKeyword(keyword: string, skill: Skill): boolean {
    const text = (skill.name + ' ' + skill.tags.join(' ')).toLowerCase()
    const mappings: [string, string][] = [
      ['天气', 'weather'], ['翻译', 'translate'], ['提醒', 'reminder'],
      ['新闻', 'news'], ['日历', 'calendar'], ['邮件', 'email'],
      ['图片', 'image'], ['视频', 'video'], ['音乐', 'music'],
      ['搜索', 'search'], ['地图', 'map'], ['文档', 'doc'],
      ['文件', 'file'], ['浏览', 'browser'], ['画图', 'draw'],
      ['代码', 'code'], ['数据', 'data'], ['报告', 'report'],
      ['会议', 'meeting'], ['笔记', 'note'], ['配置', 'config'],
      ['部署', 'deploy'], ['工具', 'tool'], ['自动化', 'auto'],
      ['聊天', 'chat'], ['客服', 'support'],
    ]
    for (const [zh, en] of mappings) {
      if ((keyword.includes(zh) || keyword.includes(en)) && text.includes(en)) return true
    }
    return false
  }

  /**
   * 从 SKILL.md 正文中提取中文名称或使用常用映射表兜底
   */
  private getChineseName(skillPath: string, meta: SkillMeta): string {
    if (meta.nameZh) return meta.nameZh
    const name = path.basename(skillPath)
    const common: Record<string, string> = {
      'weather': '天气查询',
      'translator': '翻译助手',
      'reminder': '提醒助手',
      'news': '新闻资讯',
      'calendar': '日程管理',
      'email': '邮件助手',
      'search': '搜索工具',
      'image': '图像处理',
      'file': '文件管理',
      'browser': '浏览器控制',
      'codex': '代码执行',
      'deploy': '部署工具',
      'report': '报告生成',
      'chat': '智能对话',
      'note': '笔记管理',
      'data': '数据处理',
      'music': '音乐播放',
      'video': '视频处理',
      'draw': '绘画工具',
      'agent_reach': 'Agent 连接',
      'ab-test-setup': 'A/B 测试',
      'alphaear-predictor': '股价预测',
      'autonomous-tasks': '自主任务',
      'brainstorming': '头脑风暴',
      'claw-art': '图像生成',
      'content-workflow': '内容工作流',
      'creative-thought-partner': '创意伙伴',
      'daily-hot-news': '每日热点',
      'deep-search-and-insight-synthesize': '深度搜索',
      'frontend-design': '前端设计',
      'frontend-ui-ux-engineer': 'UI/UX 工程',
      'general-writing': '通用写作',
      'html-ux-guidance': 'HTML UX 设计',
      'huashu-nuwa': '女娲数算',
      'humanizer-cn': '文本人性化',
      'humanizer-zh': '文本人性化',
      'imap-smtp-email': '邮件收发',
      'markitdown': 'Markdown 转换',
      'meitu-skills': '美图秀秀',
      'minimax-music-gen': '音乐生成',
      'minimax-pdf': 'PDF 处理',
      'multi-search-engine': '多引擎搜索',
      'natural-language-planner': '自然语言规划',
      'office-automation': '办公自动化',
      'opengfx': 'Logo 设计',
      'paper-daily': '论文日报',
      'pptx': 'PPT 生成',
      'pptx-posters': 'PPT 海报',
      'prd-writer': 'PRD 撰写',
      'proactive-agent': '主动 Agent',
      'proactive-tasks': '主动任务',
      'product-manager': '产品经理',
      'pua': 'PUA 分析',
      'read-arxiv-paper': '论文阅读',
      'recipe-to-list': '食谱转清单',
      'remotion-video-toolkit': '视频制作',
      'seedance-video-gen': '视频生成',
      'seedream-image-gen': '图像生成',
      'self-improving-agent': '自我进化',
      'ship-learn-next': 'Ship Learn Next',
      'skill-creator': '技能创建',
      'skill-vetter': '技能审核',
      'smart-followups': '智能跟进',
      'social-agent': '社交 Agent',
      'startup-advisor': '创业顾问',
      'story-demo': '故事演示',
      'surprise-me': '惊喜生成',
      'test-case-generator': '测试用例生成',
      'todobot': '待办机器人',
      'today-task': '今日任务',
      'tts': '语音合成',
      'user-research': '用户研究',
      'ux-designer': 'UX 设计师',
      'vercel-deploy': 'Vercel 部署',
      'vercel-react-best-practices': 'React 最佳实践',
      'visual-creative': '视觉创意',
      'web-content-fetcher': '网页内容获取',
      'web-design-guidelines': '网页设计规范',
      'webapp-testing': 'Web 测试',
      'wecom-bot-setup': '企业微信机器人',
      'weixin-clawbot-setup': '微信机器人',
      'write-a-prd': 'PRD 撰写',
      'writing-inspiration': '写作灵感',
      'writing-style-iterator': '写作风格优化',
      'amap-jsapi-skill': '高德地图',
      'brainhole-factory': '平行宇宙生成器',
      'copywriter': '文案撰写',
      'bdpan-storage': '百度网盘',
      'best-minds': '最佳思维',
      'canvas-design': '画板设计',
      'baoyu-url-to-markdown': 'URL 转 Markdown',
      'xiaoyi-HarmonyOSSmartHome-skill': '华为智慧家居',
      'xiaoyi-cloud-database': '云数据库',
      'xiaoyi-doc-convert': '文档转换',
      'xiaoyi-docx': 'Word 文档',
      'xiaoyi-health': '健康管理',
      'xiaoyi-image-search': '图片搜索',
      'xiaoyi-image-understanding': '图像理解',
      'xiaoyi-image-translation': '图片翻译',
      'xiaoyi-pdf': 'PDF 阅读',
      'xiaoyi-podcast-gen': '播客生成',
      'xiaoyi-ppt': 'PPT 生成',
      'xiaoyi-report': '报告生成',
      'xiaoyi-tts': '语音合成',
      'xiaoyi-web-deploy': 'Web 部署',
      'xiaoyi-web-search': '网络搜索',
      'xiaoyi-xlsx': 'Excel 处理',
      'yanxue-course-manager': '研学课程管理',
    }
    return common[name] || ''
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
