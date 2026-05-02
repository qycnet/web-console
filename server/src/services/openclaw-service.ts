import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
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
  description?: string
  workspace?: string
  persona?: string
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
    model: string
    workspace: string
    createdAt: string
    config: any
  }
}

class OpenClawService extends EventEmitter {
  private openclawDir: string
  private configPath: string
  private agentsDataDir: string
  private registryPath: string
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
  // Agent 列表（从注册表 + CLI 真实数据合并）
  // ==========================================================================
  async getAgents(): Promise<AgentInfo[]> {
    try {
      // ① 从注册表 + CLI 合并得到完整列表
      const [cliAgents, registry] = await Promise.all([
        this.getAgentsFromCLIWithTimeout(),
        this.getRegistry()
      ])

      const seen = new Set<string>()
      const result: AgentInfo[] = []

      // 先加 CLI 返回的真实 Agent（排除 main 和 defaults）
      for (const a of cliAgents) {
        if (a.id === 'main' || a.id === 'default' || a.id === 'defaults') continue
        seen.add(a.id)
        const reg = registry[a.id]
        result.push({
          ...a,
          status: a.status || 'stopped',
          skills: a.skills || [],
          workspace: reg?.workspace,
          createdAt: a.createdAt || reg?.createdAt
        })
      }

      // 再加注册表中存在但 CLI 未返回的 Agent
      for (const [id, reg] of Object.entries(registry)) {
        if (!seen.has(id)) {
          seen.add(id)
          result.push({
            id,
            name: reg.name || id,
            status: 'stopped',
            model: reg.model || 'default',
            skills: [],
            workspace: reg.workspace,
            createdAt: reg.createdAt
          })
        }
      }

      return result
    } catch (error) {
      logger.error('Failed to get agents:', error)
      return []
    }
  }

  /**
   * 从 CLI 获取 Agent 列表（流式解析 + 3 秒超时）
   */
  private async getAgentsFromCLIWithTimeout(): Promise<AgentInfo[]> {
    try {
      const agents = await Promise.race([
        this.getAgentsFromCLI(),
        new Promise<AgentInfo[]>((_, reject) =>
          setTimeout(() => reject(new Error('CLI timeout')), 10000)
        )
      ])
      return agents
    } catch {
      return []
    }
  }

  private async getAgentsFromCLI(): Promise<AgentInfo[]> {
    return new Promise((resolve) => {
      const proc = spawn('openclaw', ['agents', 'list', '--json'], {
        cwd: this.openclawDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let resolved = false

      const tryResolve = () => {
        if (resolved) return
        const jsonMatch = stdout.match(/^\s*\[[\s\S]*?\]\s*/m)
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0].trim())
            if (Array.isArray(result)) {
              resolved = true
              proc.kill()
              resolve(result.map((a: any) => ({
                id: a.id || a.name || 'unknown',
                name: a.identityName || a.name || a.id || '未知',
                status: a.status || (a.running ? 'running' : 'stopped'),
                model: a.model || 'default',
                skills: a.skills || [],
                createdAt: a.createdAt || ''
              })))
            }
          } catch {}
        }
      }

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); tryResolve() })

      const timeout = setTimeout(() => {
        if (!resolved) { tryResolve(); if (!resolved) { resolved = true; proc.kill(); resolve([]) } }
      }, 3000)

      proc.on('close', () => { clearTimeout(timeout); if (!resolved) { tryResolve(); if (!resolved) { resolved = true; resolve([]) } } })
      proc.on('error', () => { clearTimeout(timeout); if (!resolved) { resolved = true; resolve([]) } })
    })
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
    const cliArgs: string[] = ['agents', 'add', name]
    if (options?.model) { cliArgs.push('--model', options.model) }
    if (options?.workspace) { cliArgs.push('--workspace', options.workspace) }
    cliArgs.push('--non-interactive', '--json')

    const result = await this._spawnWithOutput('openclaw', cliArgs, 60000)

    const agentIdFromCLI = result.id || agentId

    // ③ 更新注册表
    const registry = await this.getRegistry()
    registry[agentIdFromCLI] = {
      name,
      model: options?.model || 'default',
      workspace: workspaceDir,
      createdAt: new Date().toISOString(),
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
    persona?: string
  }): Promise<void> {
    const registry = await this.getRegistry()
    const reg = registry[agentId]

    if (updates.name || updates.emoji || updates.avatar || updates.theme || updates.persona) {
      // 更新 workspace 人设文件
      if (reg?.workspace) {
        if (updates.persona) {
          await fs.writeFile(path.join(reg.workspace, 'AGENTS.md'), updates.persona)
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

        await this._spawnWithOutput('openclaw', args, 15000)
      }
    }

    // 编辑模型 → 直接改 config.json
    if (updates.model) {
      await this._updateAgentInConfig(agentId, { model: updates.model })
      if (reg) {
        reg.model = updates.model
        await this.saveRegistry(registry)
      }
    }

    // 更新注册表中的名称
    if (updates.name && reg) {
      reg.name = updates.name
      await this.saveRegistry(registry)
    }

    logger.info(`Agent updated: ${agentId}`)
  }

  /**
   * 删除 Agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    // ① CLI 删除
    await this._spawnWithOutput('openclaw', ['agents', 'delete', agentId, '--force', '--json'], 15000)

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
   */
  private async _spawnWithOutput(cmd: string, args: string[], timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd: this.openclawDir,
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error(`Command timed out after ${timeoutMs}ms: stderr: ${stderr.substring(0, 500)}`))
      }, timeoutMs)

      proc.on('close', (code) => {
        clearTimeout(timeout)
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
          reject(new Error(`Exit code ${code}: ${stderr.substring(0, 500)}`))
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
  // Agent 生命周期：启动/停止/重启
  // ==========================================================================
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

  // ==========================================================================
  // 发送消息
  // ==========================================================================
  async sendMessage(agentId: string, message: string): Promise<string> {
    try {
      return await this._sendMessageWithAgent(agentId, message)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`sendMessage failed: ${msg}`)
      return `抱歉，发送消息失败: ${msg}`
    }
  }

  private async _sendMessageWithAgent(agentId: string, message: string, retryWithoutAgent: boolean = true): Promise<string> {
    return new Promise((resolve) => {
      const sessionId = crypto.randomUUID()
      const args = ['agent', '--local', '--json', '--message', message, '--session-id', sessionId]
      if (agentId && agentId !== 'default') args.push('--agent', agentId)

      const proc = spawn('openclaw', args, {
        cwd: this.openclawDir,
        timeout: 180000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      proc.on('close', async (code: number | null) => {
        const combinedOutput = stdout + '\n' + stderr
        if (code === 0) {
          const reply = this._extractReply(combinedOutput)
          if (reply) { resolve(reply); return }
          const text = (stdout.trim() || stderr.trim())
          if (text.length > 5) { resolve(text); return }
          resolve('Agent 已收到消息，但没有返回文本回复。')
        } else {
          const errMsg = stderr.trim() || stdout.trim()
          if (retryWithoutAgent && agentId &&
              (errMsg.toLowerCase().includes('unknown agent') || errMsg.toLowerCase().includes('not found'))) {
            logger.warn(`Agent ${agentId} not found via --agent, retrying with --session-id only`)
            try {
              const fallback = await this._sendMessageWithAgent('', message, false)
              resolve(fallback); return
            } catch {}
          }
          const reply = this._extractReply(combinedOutput)
          if (reply) { resolve(reply); return }
          if (errMsg.length > 3) {
            resolve(`Agent: ${errMsg.replace(/\n/g, ' | ').substring(0, 500)}`)
          } else {
            logger.warn(`openclaw agent exit code=${code}, stderr=${stderr}`)
            resolve(`Agent 当前不可用（退出码 ${code}），请稍后重试。`)
          }
        }
      })

      proc.on('error', (err: Error) => {
        logger.error(`Failed to spawn openclaw agent:`, err)
        resolve(`无法连接到 Agent: ${err.message}`)
      })
    })
  }

  private _extractReply(output: string): string | null {
    const jsonMatch = output.match(/\{[\s\S]*\}/m)
    if (!jsonMatch) return null

    try {
      const result = JSON.parse(jsonMatch[0].trim())
      if (result.payloads && Array.isArray(result.payloads)) {
        const texts = result.payloads.filter((p: any) => p.role === 'assistant').map((p: any) => (p.text || '').trim()).filter(Boolean)
        if (texts.length > 0) return texts.join('\n')
      }
      const reply = result.response || result.reply || result.text || result.content || ''
      if (reply) return reply
      const found = this._deepFindText(result)
      if (found) return found
    } catch {}
    return null
  }

  private _deepFindText(obj: any, depth: number = 0): string | null {
    if (depth > 5 || !obj || typeof obj !== 'object') return null
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.length > 3) return val
      const nested = this._deepFindText(val, depth + 1)
      if (nested) return nested
    }
    return null
  }

  // ==========================================================================
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

  async getAgentLogsFromCLI(agentId: string, limit: number = 100): Promise<string[]> {
    // 预留：可通过 openclaw agent logs 获取
    return this.getAgentLogs(agentId, limit)
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
