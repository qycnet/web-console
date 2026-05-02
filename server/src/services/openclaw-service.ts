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
}

export interface OpenClawConfig {
  version: string
  installDir: string
  configPath: string
  dataDir: string
  logPath: string
}

class OpenClawService extends EventEmitter {
  private openclawDir: string
  private configPath: string
  private agents: Map<string, AgentInfo> = new Map()
  private openclawProcess: ChildProcess | null = null
  private isInitialized: boolean = false

  constructor() {
    super()
    this.openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    this.configPath = path.join(this.openclawDir, 'config.json')
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

  /**
   * 验证是否为有效的 OpenClaw 目录
   */
  private async isValidOpenClawDir(dir: string): Promise<boolean> {
    try {
      const configExists = await fs.pathExists(path.join(dir, 'config.json'))
      const openclawConfigExists = await fs.pathExists(path.join(dir, 'openclaw.json'))
      const packageExists = await fs.pathExists(path.join(dir, 'package.json'))
      return configExists || openclawConfigExists || packageExists
    } catch {
      return false
    }
  }

  /**
   * 获取 OpenClaw 版本
   */
  private async getVersion(dir: string): Promise<string> {
    try {
      const pkgPath = path.join(dir, 'package.json')
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath)
        return pkg.version || 'unknown'
      }
    } catch {}
    return 'unknown'
  }

  /**
   * 读取 OpenClaw 配置
   */
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

  /**
   * 更新 OpenClaw 配置
   */
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

  /**
   * 热重载配置
   */
  async reloadConfig(): Promise<void> {
    try {
      // 发送 SIGHUP 信号触发热重载
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

  /**
   * 获取所有 Agent 列表
   * 优先级：状态文件 → CLI(带超时) → 配置文件 → []
   */
  async getAgents(): Promise<AgentInfo[]> {
    try {
      // ① 从 OpenClaw 状态文件读取
      const statePath = path.join(this.openclawDir, 'state', 'agents.json')
      if (await fs.pathExists(statePath)) {
        const state = await fs.readJson(statePath)
        const agents = Object.entries(state).map(([id, info]: [string, any]) => ({
          id,
          name: info.name || id,
          status: info.status || 'stopped',
          pid: info.pid,
          model: info.model || 'default',
          skills: info.skills || [],
          uptime: info.uptime,
          memoryUsage: info.memoryUsage,
          cpuUsage: info.cpuUsage,
          lastActive: info.lastActive ? new Date(info.lastActive) : undefined
        }))
        return agents
      }

      // ② 通过 openclaw CLI 读取真实 Agent 列表（加超时避免卡死）
      try {
        const agents = await Promise.race([
          this.getAgentsFromCLI(),
          new Promise<AgentInfo[]>((_, reject) =>
            setTimeout(() => reject(new Error('CLI timeout')), 10000)
          )
        ])
        if (agents.length > 0) return agents
      } catch {
        // CLI 超时或失败，继续降级
      }

      // ③ 从 OpenClaw 配置文件中读取 agents 配置
      try {
        const config = await this.getConfig()
        if (config.agents && Array.isArray(config.agents) && config.agents.length > 0) {
          return config.agents
        }
      } catch {}

      // ④ 无数据时返回空列表
      return []
    } catch (error) {
      logger.error('Failed to get agents:', error)
      return []
    }
  }

  /**
   * 通过 CLI 获取真实 Agent 列表
   * 注意: openclaw agents list --json 的 stderr 可能混有插件警告,
   * 导致进程不退出或退出码非0。
   * 改为：读取到 stdout 中的 [] 或 {} 后立即解析并 resolve，不等 close
   * 同时保留 3 秒超时兜底
   */
  private async getAgentsFromCLI(): Promise<AgentInfo[]> {
    return new Promise((resolve) => {
      const proc = spawn('openclaw', ['agents', 'list', '--json'], {
        cwd: this.openclawDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let resolved = false

      // 辅助函数：尝试从当前 stdout 中提取 JSON 并 resolve
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

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
        tryResolve()
      })

      // 3 秒超时：最多等 3 秒，解析已有的 stdout
      const timeout = setTimeout(() => {
        if (!resolved) {
          tryResolve()
          if (!resolved) {
            resolved = true
            proc.kill()
            resolve([])
          }
        }
      }, 3000)

      proc.on('close', () => {
        clearTimeout(timeout)
        if (!resolved) {
          tryResolve()
          if (!resolved) {
            resolved = true
            resolve([])
          }
        }
      })

      proc.on('error', () => {
        clearTimeout(timeout)
        if (!resolved) {
          resolved = true
          resolve([])
        }
      })
    })
  }

  /**
   * 获取单个 Agent 信息
   */
  async getAgent(agentId: string): Promise<AgentInfo | null> {
    const agents = await this.getAgents()
    return agents.find(a => a.id === agentId) || null
  }

  /**
   * 启动 Agent
   */
  async startAgent(agentId: string): Promise<void> {
    try {
      logger.info(`Starting agent: ${agentId}`)

      // 通过 OpenClaw CLI 启动
      const child = spawn('openclaw', ['agent', 'start', agentId], {
        cwd: this.openclawDir,
        env: { ...process.env, NODE_ENV: 'production' }
      })

      child.on('error', (error) => {
        logger.error(`Failed to start agent ${agentId}:`, error)
        this.emit('agent:error', { agentId, error })
      })

      child.on('exit', (code) => {
        if (code === 0) {
          logger.info(`Agent ${agentId} started successfully`)
          this.emit('agent:started', { agentId })
        } else {
          logger.error(`Agent ${agentId} failed to start with code ${code}`)
          this.emit('agent:error', { agentId, error: new Error(`Exit code: ${code}`) })
        }
      })
    } catch (error) {
      logger.error(`Failed to start agent ${agentId}:`, error)
      throw error
    }
  }

  /**
   * 停止 Agent
   */
  async stopAgent(agentId: string): Promise<void> {
    try {
      logger.info(`Stopping agent: ${agentId}`)

      const child = spawn('openclaw', ['agent', 'stop', agentId], {
        cwd: this.openclawDir
      })

      child.on('exit', (code) => {
        if (code === 0) {
          logger.info(`Agent ${agentId} stopped successfully`)
          this.emit('agent:stopped', { agentId })
        }
      })
    } catch (error) {
      logger.error(`Failed to stop agent ${agentId}:`, error)
      throw error
    }
  }

  /**
   * 重启 Agent
   */
  async restartAgent(agentId: string): Promise<void> {
    await this.stopAgent(agentId)
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.startAgent(agentId)
  }

  /**
   * 向 Agent 发送消息
   * 通过 openclaw agent CLI（--local 嵌入模式）与 Agent 通信
   *
   * 策略：
   * 1. 优先使用 --agent <id> --session-id <uuid>
   * 2. 如果 --agent 方式失败（agent id 不存在），fallback 到
   *    --session-id 方式（不指定 agent，走默认路由）
   */
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
      if (agentId && agentId !== 'default') {
        args.push('--agent', agentId)
      }

      const proc = spawn('openclaw', args, {
        cwd: this.openclawDir,
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', async (code: number | null) => {
        // 注意：openclaw agent CLI 的 JSON 回复可能输出到 stderr（插件日志也在 stderr）
        // 需要同时从 stdout 和 stderr 中提取 JSON 回复
        const combinedOutput = stdout + '\n' + stderr
        if (code === 0) {
          const reply = this._extractReply(combinedOutput)
          if (reply) {
            resolve(reply)
            return
          }
          // 也尝试纯文本
          const text = (stdout.trim() || stderr.trim())
          if (text.length > 5) {
            resolve(text)
            return
          }
          resolve('Agent 已收到消息，但没有返回文本回复。')
        } else {
          const errMsg = stderr.trim() || stdout.trim()
          // 如果 --agent 方式失败且 agentId 不存在，用 --session-id 重试
          if (retryWithoutAgent && agentId &&
              (errMsg.toLowerCase().includes('unknown agent') ||
               errMsg.toLowerCase().includes('not found'))) {
            logger.warn(`Agent ${agentId} not found via --agent, retrying with --session-id only`)
            try {
              const fallback = await this._sendMessageWithAgent('', message, false)
              resolve(fallback)
              return
            } catch {}
          }
          // 返回真实错误（从 combinedOutput 中提取）
          if (errMsg && errMsg.length > 3) {
            // 但先检查 stderr 中是否包含真正的回复 JSON（非错误）
            const reply = this._extractReply(combinedOutput)
            if (reply) {
              resolve(reply)
              return
            }
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

  /**
   * 从混合输出（stdout + stderr）中提取 JSON 回复文本
   *
   * 注意：openclaw agent CLI 的 JSON 回复结构：
   * {
   *   "payloads": [
   *     { "role": "assistant", "text": "回复内容" }
   *   ]
   * }
   *
   * 搜索路径：payloads[0].text → response → reply → text → content
   */
  private _extractReply(output: string): string | null {
    // 先尝试提取最外层的完整 JSON 对象（贪婪匹配到最后一个 }）
    // 兼容 stdout/stderr 混有插件 stderr 警告的情况
    const jsonMatch = output.match(/\{[\s\S]*\}/m)
    if (!jsonMatch) return null

    try {
      const result = JSON.parse(jsonMatch[0].trim())

      // 优先取 payloads 数组中的文本
      if (result.payloads && Array.isArray(result.payloads)) {
        const texts = result.payloads
          .filter((p: any) => p.role === 'assistant')
          .map((p: any) => (p.text || '').trim())
          .filter(Boolean)
        if (texts.length > 0) return texts.join('\n')
      }

      // 降级：搜索顶层字段
      const reply = result.response || result.reply || result.text || result.content || ''
      if (reply) return reply

      // 如果顶层也没有，遍历 payloads 之外的嵌套字段
      const found = this._deepFindText(result)
      if (found) return found
    } catch {}

    return null
  }

  /**
   * 深度递归搜索对象中的文本内容
   */
  private _deepFindText(obj: any, depth: number = 0): string | null {
    if (depth > 5 || !obj || typeof obj !== 'object') return null
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.length > 3) return val
      const nested = this._deepFindText(val, depth + 1)
      if (nested) return nested
    }
    return null
  }

  /**
   * 获取 Agent 运行日志
   */
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

  /**
   * 创建 Agent（通过 openclaw agents add CLI）
   */
  async createAgent(name: string, options?: { model?: string; workspace?: string }): Promise<{ id: string; name: string }> {
    return new Promise((resolve, reject) => {
      const args = ['agents', 'add', name, '--non-interactive']
      if (options?.model) args.push('--model', options.model)
      if (options?.workspace) args.push('--workspace', options.workspace)
      args.push('--json')

      const proc = spawn('openclaw', args, {
        cwd: this.openclawDir,
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const result = JSON.parse(stdout)
            resolve({ id: result.id || result.name || name, name })
          } catch {
            resolve({ id: name, name })
          }
        } else {
          reject(new Error(`openclaw agents add exited with code ${code}`))
        }
      })
      proc.on('error', reject)
    })
  }

  /**
   * 更新 Agent 身份信息（通过 openclaw agents set-identity CLI）
   */
  async updateAgent(agentId: string, updates: { name?: string; emoji?: string; avatar?: string; theme?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['agents', 'set-identity', '--agent', agentId]
      if (updates.name) args.push('--name', updates.name)
      if (updates.emoji) args.push('--emoji', updates.emoji)
      if (updates.avatar) args.push('--avatar', updates.avatar)
      if (updates.theme) args.push('--theme', updates.theme)
      args.push('--json')

      const proc = spawn('openclaw', args, {
        cwd: this.openclawDir,
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`openclaw agents set-identity exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  }

  /**
   * 删除 Agent（通过 openclaw agents delete CLI）
   */
  async deleteAgent(agentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('openclaw', ['agents', 'delete', agentId, '--force', '--json'], {
        cwd: this.openclawDir,
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      proc.on('close', (code) => {
        if (code === 0) {
          logger.info(`Agent deleted: ${agentId}`)
          resolve()
        } else {
          reject(new Error(`openclaw agents delete exited with code ${code}`))
        }
      })
      proc.on('error', reject)
    })
  }

  /**
   * 监控 Agent 状态
   */
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
