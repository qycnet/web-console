import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'

export interface AgentInfo {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  pid?: number
  model: string
  skills: string[]
  uptime?: number
  memoryUsage?: number
  cpuUsage?: number
  lastActive?: Date
  createdAt?: string
  updatedAt?: string
  description?: string
  workspace?: string
  persona?: string

  // === 新字段：模型配置 ===
  provider?: string         // 'deepseek' | 'openai' | 'cm-plan' | 'siliconflow'
  apiKey?: string           // 留空使用全局 key
  temperature?: number      // default: 0.7
  maxTokens?: number        // default: 4096
  contextWindow?: number    // 上下文窗口大小

  // === 新字段：展示 ===
  avatar?: string           // emoji/头像URL
  theme?: string            // 主题色

  // === 新字段：启停 ===
  disabled?: boolean         // 是否被禁用

  // === 新字段：会话统计 ===
  sessionCount?: number
  lastActiveAt?: string
}

export interface OpenClawConfig {
  version: string
  installDir: string
  configPath: string
  dataDir: string
  logPath: string
}

interface AgentRegistry {
  [agentId: string]: {
    name: string
    description?: string
    avatar?: string          // emoji/头像URL
    model: string
    provider?: string        // 'deepseek' | 'openai' | 'cm-plan'
    apiKey?: string          // 留空使用全局 key
    temperature?: number     // default: 0.7
    maxTokens?: number       // default: 4096
    contextWindow?: number
    theme?: string
    skills?: string[]
    workspace: string
    persona?: string
    createdAt: string
    updatedAt?: string
    config: any
  }
}

class OpenClawService extends EventEmitter {
  private openclawDir: string
  private configPath: string
  private agentsDataDir: string
  private registryPath: string
  private disabledStatePath: string           // 禁用状态独立文件
  private agents: Map<string, AgentInfo> = new Map()
  private openclawProcess: ChildProcess | null = null
  private isInitialized: boolean = false

  constructor() {
    super()
    this.openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    this.configPath = path.join(this.openclawDir, 'config.json')
    // web-console 自己的 Agent 数据目录（存放角色 workspace）
    this.agentsDataDir = path.join(process.cwd(), 'data', 'agents')
    this.registryPath = path.join(this.agentsDataDir, 'registry.json')
    // 禁用状态独立文件（不受 OpenClaw config.json 覆盖影响）
    this.disabledStatePath = path.join(process.cwd(), 'data', 'agent-disabled.json')
  }

  /**
   * 读取禁用状态映射表
   */
  private async getDisabledMap(): Promise<Record<string, boolean>> {
    try {
      if (await fs.pathExists(this.disabledStatePath)) {
        return await fs.readJson(this.disabledStatePath)
      }
    } catch {}
    return {}
  }

  /**
   * 写入禁用状态映射表
   */
  private async saveDisabledMap(map: Record<string, boolean>): Promise<void> {
    await fs.ensureDir(path.dirname(this.disabledStatePath))
    await fs.writeJson(this.disabledStatePath, map, { spaces: 2 })
  }

  /**
   * 读取 web-console Agent 注册表
   */
  private async getRegistry(): Promise<AgentRegistry> {
    try {
      if (await fs.pathExists(this.registryPath)) {
        return await fs.readJson(this.registryPath)
      }
    } catch {}
    return {}
  }

  /**
   * 保存 web-console Agent 注册表
   */
  private async saveRegistry(registry: AgentRegistry): Promise<void> {
    await fs.ensureDir(path.dirname(this.registryPath))
    await fs.writeJson(this.registryPath, registry, { spaces: 2 })
  }

  /**
   * 自动发现 OpenClaw 安装目录
   */
  async discover(): Promise<OpenClawConfig | null> {
    const possiblePaths = [
      this.openclawDir,
      path.join(process.env.HOME || '', '.openclaw'),
      '/opt/openclaw',
      '/usr/local/openclaw'
    ]

    for (const dir of possiblePaths) {
      if (await this.isValidOpenClawDir(dir)) {
        const config: OpenClawConfig = {
          version: await this.getVersion(dir),
          installDir: dir,
          configPath: path.join(dir, 'config.json'),
          dataDir: path.join(dir, 'data'),
          logPath: path.join(dir, 'logs')
        }
        this.openclawDir = dir
        this.configPath = config.configPath
        this.isInitialized = true
        logger.info(`OpenClaw discovered at: ${dir}`)
        return config
      }
    }

    logger.warn('OpenClaw installation not found')
    return null
  }

  private async isValidOpenClawDir(dir: string): Promise<boolean> {
    try {
      return await fs.pathExists(path.join(dir, 'config.json')) ||
             await fs.pathExists(path.join(dir, 'openclaw.json')) ||
             await fs.pathExists(path.join(dir, 'package.json'))
    } catch { return false }
  }

  private async getVersion(dir: string): Promise<string> {
    try {
      const pkg = await fs.readJson(path.join(dir, 'package.json'))
      return pkg.version || 'unknown'
    } catch { return 'unknown' }
  }

  async getConfig(): Promise<any> {
    try {
      if (await fs.pathExists(this.configPath)) {
        return await fs.readJson(this.configPath)
      }
      return {}
    } catch (error) {
      logger.error('Failed to read OpenClaw config:', error)
      return {}
    }
  }

  async updateConfig(config: any): Promise<void> {
    try {
      await fs.writeJson(this.configPath, config, { spaces: 2 })
      logger.info('OpenClaw config updated')
      this.emit('config:updated', config)
    } catch (error) {
      logger.error('Failed to update OpenClaw config:', error)
      throw error
    }
  }

  async reloadConfig(): Promise<void> {
    try {
      if (this.openclawProcess) {
        this.openclawProcess.kill('SIGHUP')
        logger.info('Sent SIGHUP to OpenClaw for config reload')
      }
      this.emit('config:reloaded')
    } catch (error) {
      logger.error('Failed to reload config:', error)
      throw error
    }
  }

  // ==========================================================================
  // Agent 列表（从 config.json 的 agents.list + registry 合并）
  // ==========================================================================
  async getAgents(): Promise<AgentInfo[]> {
    try {
      const config = await this.getConfig()
      const registry = await this.getRegistry()
      const list: any[] = config?.agents?.list || []
      const disabledMap = await this.getDisabledMap()

      const result: AgentInfo[] = []

      for (const a of list) {
        if (a.id === 'main' || a.id === 'default' || a.id === 'defaults') continue
        const reg = registry[a.id]

        // 从 model 字段解析 provider（格式: provider/model，如 deepseek/deepseek-chat）
        const model = a.model || reg?.model || config?.agents?.defaults?.model?.primary || 'default'
        let provider = reg?.provider || a.provider || ''
        if (!provider && model.includes('/')) {
          provider = model.split('/')[0]
        }

        result.push({
          id: a.id || '',
          name: a.name || a.id || reg?.name || '未知',
          status: 'stopped',                 // 从 config.json 读不到实时状态，默认 stopped
          disabled: disabledMap[a.id] ?? false, // 从独立文件读取，不受 config.json 覆盖影响
          model,
          skills: a.skills || reg?.skills || [],
          workspace: reg?.workspace,
          createdAt: a.createdAt || reg?.createdAt || '',
          updatedAt: reg?.updatedAt,
          description: reg?.description || a.description,
          persona: reg?.persona || a.persona || '',
          provider,
          apiKey: reg?.apiKey || a.apiKey || '',
          temperature: reg?.temperature ?? a.temperature ?? 0.7,
          maxTokens: reg?.maxTokens ?? a.maxTokens ?? 4096,
          contextWindow: reg?.contextWindow,
          avatar: reg?.avatar,
          theme: reg?.theme
        })
      }

      // 补充 registry 中有但 config agents.list 中没有的 Agent
      const listedIds = new Set(list.map((a: any) => a.id))
      for (const [id, reg] of Object.entries(registry)) {
        if (listedIds.has(id)) continue
        const model = reg.model || config?.agents?.defaults?.model?.primary || 'default'
        let provider = reg.provider || ''
        if (!provider && model.includes('/')) {
          provider = model.split('/')[0]
        }
        result.push({
          id,
          name: reg.name || id,
          status: 'stopped',
          disabled: false,                    // 未在 agents.list 中的视为启用
          model,
          skills: reg.skills || [],
          workspace: reg.workspace,
          createdAt: reg.createdAt,
          updatedAt: reg.updatedAt,
          description: reg.description,
          persona: reg.persona || '',
          provider,
          apiKey: reg.apiKey || '',
          temperature: reg.temperature ?? 0.7,
          maxTokens: reg.maxTokens ?? 4096,
          contextWindow: reg.contextWindow,
          avatar: reg.avatar,
          theme: reg.theme
        })
      }

      return result
    } catch (error) {
      logger.error('Failed to get agents:', error)
      return []
    }
  }

  async getAgent(agentId: string): Promise<AgentInfo | null> {
    const agents = await this.getAgents()
    return agents.find(a => a.id === agentId) || null
  }

  // ==========================================================================
  // Agent CRUD（符合方案：不动 main，只操作 agents.list）
  // ==========================================================================

  /**
   * 创建 Agent
   * 步骤：
   * ① 在 web-console/server/data/agents/<id>/ workspace 写入人设文件
   * ② 调用 openclaw agents add
   * ③ 记录到 registry.json
   */
  async createAgent(name: string, options?: {
    model?: string
    workspace?: string
    persona?: string
    description?: string
    provider?: string
    temperature?: number
    maxTokens?: number
    avatar?: string
    theme?: string
  }): Promise<{ id: string; name: string }> {
    const agentId = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()

    // ① 准备 workspace 目录
    const workspaceDir = options?.workspace || path.join(this.agentsDataDir, agentId, 'workspace')
    await fs.ensureDir(workspaceDir)

    // 写入角色人设文件
    const personaContent = options?.persona || `# ${name}\n\n这是一个自定义 Agent 角色。`
    await fs.writeFile(path.join(workspaceDir, 'AGENTS.md'), personaContent)
    await fs.writeFile(path.join(workspaceDir, 'IDENTITY.md'), `# ${name}`)
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '')
    await fs.ensureDir(path.join(workspaceDir, 'memory'))

    // ② 调用 CLI
    const cliArgs: string[] = ['agents', 'add', name, '--workspace', workspaceDir]
    if (options?.model) { cliArgs.push('--model', options.model) }
    cliArgs.push('--non-interactive', '--json')

    const result = await this._spawnWithOutput('openclaw', cliArgs, 60000)

    const agentIdFromCLI = result.id || agentId

    // ③ 更新注册表
    const registry = await this.getRegistry()
    registry[agentIdFromCLI] = {
      name,
      description: options?.description,
      avatar: options?.avatar,
      theme: options?.theme,
      model: options?.model || 'default',
      provider: options?.provider,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      skills: [],
      workspace: workspaceDir,
      persona: personaContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {}
    }
    await this.saveRegistry(registry)

    logger.info(`Agent created: ${agentIdFromCLI} (${name}), workspace: ${workspaceDir}`)
    return { id: agentIdFromCLI, name }
  }

  /**
   * 更新 Agent
   * 编辑人设 → 写 workspace 文件 → 调用 set-identity
   * 编辑模型 → 直接改 config.json 的 agents.list
   */
  async updateAgent(agentId: string, updates: {
    name?: string
    emoji?: string
    avatar?: string
    theme?: string
    model?: string
    provider?: string
    temperature?: number
    maxTokens?: number
    contextWindow?: number
    persona?: string
    description?: string
  }): Promise<void> {
    const registry = await this.getRegistry()
    const reg = registry[agentId]

    if (updates.name || updates.emoji || updates.avatar || updates.theme || updates.persona || updates.description) {
      // 更新 workspace 人设文件
      if (reg?.workspace) {
        if (updates.persona) {
          await fs.writeFile(path.join(reg.workspace, 'AGENTS.md'), updates.persona)
        }
        if (updates.description) {
          await fs.writeFile(path.join(reg.workspace, 'DESCRIPTION.md'), updates.description)
        }
        // 调用 set-identity 重新加载
        const args = ['agents', 'set-identity', '--agent', agentId]
        if (updates.name) {
          args.push('--name', updates.name)
          await fs.writeFile(path.join(reg.workspace, 'IDENTITY.md'), `# ${updates.name}`)
        }
        if (updates.emoji) args.push('--emoji', updates.emoji)
        if (updates.avatar) args.push('--avatar', updates.avatar)
        if (updates.theme) args.push('--theme', updates.theme)
        args.push('--json')

        await this._spawnWithOutput('openclaw', args, 60000)
      }
    }

    // 编辑模型 → 直接改 config.json
    if (updates.model) {
      await this._updateAgentInConfig(agentId, { model: updates.model })
    }

    // 更新 registry（保存所有字段）
    if (reg) {
      const now = new Date().toISOString()
      if (updates.name) reg.name = updates.name
      if (updates.description !== undefined) reg.description = updates.description
      if (updates.avatar !== undefined) reg.avatar = updates.avatar
      if (updates.theme !== undefined) reg.theme = updates.theme
      if (updates.model) reg.model = updates.model
      if (updates.provider !== undefined) reg.provider = updates.provider
      if (updates.temperature !== undefined) reg.temperature = updates.temperature
      if (updates.maxTokens !== undefined) reg.maxTokens = updates.maxTokens
      if (updates.contextWindow !== undefined) reg.contextWindow = updates.contextWindow
      if (updates.persona) reg.persona = updates.persona
      reg.updatedAt = now
      await this.saveRegistry(registry)
    }

    logger.info(`Agent updated: ${agentId}`)
  }

  /**
   * 删除 Agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    // ① CLI 删除
    await this._spawnWithOutput('openclaw', ['agents', 'delete', agentId, '--force', '--json'], 60000)

    // ② 清理 web-console workspace 目录
    const reg = (await this.getRegistry())[agentId]
    if (reg?.workspace) {
      try { await fs.remove(path.dirname(reg.workspace)) } catch {}
    }

    // ③ 从注册表移除
    const registry = await this.getRegistry()
    delete registry[agentId]
    await this.saveRegistry(registry)

    logger.info(`Agent deleted: ${agentId}`)
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 精确修改 config.json 中 agents.list 的某个 agent 字段
   * 不动 defaults，不动其他配置
   */
  private async _updateAgentInConfig(agentId: string, updates: Record<string, any>): Promise<void> {
    const cfg = await this.getConfig()
    if (!cfg.agents?.list) throw new Error('config.json has no agents.list')
    const idx = cfg.agents.list.findIndex((a: any) => a.id === agentId)
    if (idx === -1) throw new Error(`Agent ${agentId} not found in config`)
    Object.assign(cfg.agents.list[idx], updates)
    await this.updateConfig(cfg)
  }

  /**
   * spawn 并等待输出
   * 注意：使用手动 timeout（setTimeout + proc.kill）而非 spawn 内置的 timeout，
   * 因为内置 timeout 会在超时时立刻 SIGTERM 进程并使 exit code 为 null，
   * 导致 close 事件拿到的 stderr 被截断。
   * 手动 timeout 可以等到 stderr 收集完整后再 reject。
   */
  private async _spawnWithOutput(cmd: string, args: string[], timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd: this.openclawDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let killed = false

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      const timeout = setTimeout(() => {
        killed = true
        proc.kill()
        reject(new Error(`Command timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (killed) return // 超时 kill 触发的 close，已由 timeout 回调 reject
        if (code === 0) {
          if (stdout) {
            try {
              const json = this._extractFirstJSON(stdout)
              resolve(json || {})
            } catch {
              resolve({})
            }
          } else {
            resolve({})
          }
        } else {
          const errText = stderr.substring(0, 500) || stdout.substring(0, 500)
          reject(new Error(`Exit code ${code}: ${errText}`))
        }
      })

      proc.on('error', (err) => { clearTimeout(timeout); reject(err) })
    })
  }

  /**
   * 从混合输出中提取第一个完整 JSON
   */
  private _extractFirstJSON(output: string): any | null {
    const patterns = [/^\s*\{[\s\S]*?\}\s*/m, /^\s*\[[\s\S]*?\]\s*/m]
    for (const p of patterns) {
      const match = output.match(p)
      if (match) {
        try { return JSON.parse(match[0].trim()) } catch {}
      }
    }
    return null
  }

  // ==========================================================================
  // Agent 生命周期：启动/停止/重启 → 启用/禁用语义
  // ==========================================================================

  /**
   * 启用 Agent：从独立禁用状态文件中移除
   */
  async enableAgent(agentId: string): Promise<void> {
    logger.info(`Enabling agent: ${agentId}`)
    try {
      const map = await this.getDisabledMap()
      delete map[agentId]
      await this.saveDisabledMap(map)
      logger.info(`Agent ${agentId} enabled`)
      this.emit('agent:started', { agentId })
    } catch (error) {
      logger.error(`Failed to enable agent ${agentId}:`, error)
      throw error
    }
  }

  /**
   * 禁用 Agent：写入独立禁用状态文件
   */
  async disableAgent(agentId: string): Promise<void> {
    logger.info(`Disabling agent: ${agentId}`)
    try {
      const map = await this.getDisabledMap()
      map[agentId] = true
      await this.saveDisabledMap(map)
      logger.info(`Agent ${agentId} disabled`)
      this.emit('agent:stopped', { agentId })
    } catch (error) {
      logger.error(`Failed to disable agent ${agentId}:`, error)
      throw error
    }
  }

  /**
   * 重启 Agent：先禁用再启用
   */
  async restartAgent2(agentId: string): Promise<void> {
    await this.disableAgent(agentId)
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.enableAgent(agentId)
  }

  // 以下方法保留，但不被 routes 调用（兼容旧调用者）
  async startAgent(agentId: string): Promise<void> {
    logger.info(`Starting agent: ${agentId}`)
    const child = spawn('openclaw', ['agent', 'start', agentId], {
      cwd: this.openclawDir,
      env: { ...process.env, NODE_ENV: 'production' }
    })
    child.on('error', (error) => { logger.error(`Failed to start agent ${agentId}:`, error); this.emit('agent:error', { agentId, error }) })
    child.on('exit', (code) => {
      if (code === 0) { logger.info(`Agent ${agentId} started`); this.emit('agent:started', { agentId }) }
      else { logger.error(`Agent ${agentId} start exit code=${code}`); this.emit('agent:error', { agentId, error: new Error(`Exit: ${code}`) }) }
    })
  }

  async stopAgent(agentId: string): Promise<void> {
    logger.info(`Stopping agent: ${agentId}`)
    const child = spawn('openclaw', ['agent', 'stop', agentId], { cwd: this.openclawDir })
    child.on('exit', (code) => { if (code === 0) { logger.info(`Agent ${agentId} stopped`); this.emit('agent:stopped', { agentId }) } })
  }

  async restartAgent(agentId: string): Promise<void> {
    await this.stopAgent(agentId)
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.startAgent(agentId)
  }

  // 日志 / 监控
  // ==========================================================================
  async getAgentLogs(agentId: string, limit: number = 100): Promise<string[]> {
    try {
      const logPath = path.join(this.openclawDir, 'logs', `agent-${agentId}.log`)
      if (await fs.pathExists(logPath)) {
        const content = await fs.readFile(logPath, 'utf-8')
        return content.split('\n').slice(-limit)
      }
      return []
    } catch (error) {
      logger.error(`Failed to get logs for agent ${agentId}:`, error)
      return []
    }
  }

  // ==========================================================================
  // 模型列表（从 OpenClaw 配置动态读取）
  // ==========================================================================
  async getAvailableModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
    try {
      // 从 config.json 的 models.providers 读取
      const config = await this.getConfig()
      const providers = config?.models?.providers
      if (providers && typeof providers === 'object') {
        const result: Array<{ id: string; name: string; provider: string }> = []
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          if (providerConfig && typeof providerConfig === 'object') {
            // 两种可能的结构：{ models: [...] } 或 { model: "..." }
            const modelList = (providerConfig as any).models
            if (Array.isArray(modelList)) {
              for (const m of modelList) {
                const id = m.id || m.name || m.model || ''
                if (id) {
                  result.push({ id, name: m.name || id, provider: providerName })
                }
              }
            } else if ((providerConfig as any).model) {
              result.push({
                id: (providerConfig as any).model,
                name: (providerConfig as any).model,
                provider: providerName
              })
            }
          }
        }
        return result
      }
      return []
    } catch (error) {
      logger.error('Failed to get available models:', error)
      return []
    }
  }

  async monitorAgents(): Promise<void> {
    setInterval(async () => {
      const agents = await this.getAgents()
      for (const agent of agents) {
        this.emit('agent:status', agent)
      }
    }, 5000)
  }
}

export const openclawService = new OpenClawService()
