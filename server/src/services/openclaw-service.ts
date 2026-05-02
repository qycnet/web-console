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
   */
  async getAgents(): Promise<AgentInfo[]> {
    try {
      // 从 OpenClaw 状态文件读取
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

      // 通过 openclaw CLI 读取真实 Agent 列表
      try {
        const agents = await this.getAgentsFromCLI()
        if (agents.length > 0) return agents
      } catch {
        // CLI 不可用时，从 OpenClaw 配置文件读取
      }

      // 从 OpenClaw 配置文件中读取 agents 配置
      try {
        const config = await this.getConfig()
        if (config.agents && Array.isArray(config.agents) && config.agents.length > 0) {
          return config.agents
        }
      } catch {}

      // 无数据时返回空列表而非 Mock
      return []
    } catch (error) {
      logger.error('Failed to get agents:', error)
      return []
    }
  }

  /**
   * 通过 CLI 获取真实 Agent 列表
   * 注意: openclaw agents list --json 的 stderr 可能混有插件警告,
   * 需要从 stdout 中提取 JSON
   */
  private async getAgentsFromCLI(): Promise<AgentInfo[]> {
    return new Promise((resolve) => {
      const proc = spawn('openclaw', ['agents', 'list', '--json'], {
        cwd: this.openclawDir,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          // 从 stdout 中尝试提取 JSON（去掉可能混入的 stderr 警告）
          const jsonMatch = stdout.match(/^\s*\[[\s\S]*\]\s*/m)
          const jsonStr = jsonMatch ? jsonMatch[0].trim() : stdout.trim()
          if (jsonStr) {
            try {
              const result = JSON.parse(jsonStr)
              const list = Array.isArray(result) ? result : (result.agents || [result])
              resolve(list.map((a: any) => ({
                id: a.id || a.name || 'unknown',
                name: a.identityName || a.name || a.id || '未知',
                status: a.status || (a.running ? 'running' : 'stopped'),
                model: a.model || 'default',
                skills: a.skills || [],
                createdAt: a.createdAt || ''
              })))
              return
            } catch (e) {
              logger.warn('Failed to parse agents list JSON:', String(e))
            }
          }
        }
        resolve([])
      })

      proc.on('error', () => resolve([]))
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
   */
  async sendMessage(agentId: string, message: string): Promise<string> {
    try {
      return new Promise((resolve) => {
        const proc = spawn('openclaw', ['agent', '--agent', agentId, '--message', message, '--local', '--json'], {
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

        proc.on('close', (code: number | null) => {
          if (code === 0 && stdout) {
            // 从 stdout 提取 JSON（忽略混入的 stderr 警告）
            const cleanStdout = this.extractJSON(stdout)
            if (cleanStdout) {
              try {
                const result = JSON.parse(cleanStdout)
                const reply = result.response || result.reply || result.text || result.content || ''
                if (reply) {
                  resolve(reply)
                  return
                }
              } catch {
                // JSON 解析失败，尝试直接输出
              }
            }
            // 非 JSON 或 response 为空
            const text = stdout.trim()
            if (text.length > 5) {
              resolve(text)
            } else {
              resolve('Agent 已收到消息，但没有返回文本回复。')
            }
          } else {
            // 非 0 退出：尝试从 stdout/stderr 提取错误信息
            const errMsg = stderr.trim() || stdout.trim()
            if (errMsg && errMsg.length > 3) {
              // 返回真实错误而不是固定字符串
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`sendMessage unexpected error:`, msg)
      return `抱歉，发送消息失败: ${msg}`
    }
  }

  /**
   * 从混合输出中提取 JSON 数组/对象
   */
  private extractJSON(text: string): string | null {
    // 先找 `[` 或 `{` 开头到对应的 `]` 或 `}`
    // 兼容 stdout 中混有 stderr 插件警告的情况
    const patterns = [
      /^\s*\{[\s\S]*?\}\s*/m,    // JSON object
      /^\s*\[[\s\S]*?\]\s*/m     // JSON array
    ]
    for (const p of patterns) {
      const match = text.match(p)
      if (match) {
        try {
          JSON.parse(match[0].trim())
          return match[0].trim()
        } catch {}
      }
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
   * 模拟 Agent 数据（开发环境）
   */
  private getMockAgents(): AgentInfo[] {
    return [
      {
        id: 'agent-main',
        name: '主 Agent',
        status: 'running',
        pid: 12345,
        model: 'gpt-4',
        skills: ['weather', 'translator', 'reminder'],
        uptime: 3600,
        memoryUsage: 256,
        cpuUsage: 15,
        lastActive: new Date()
      },
      {
        id: 'agent-writer',
        name: '写作助手',
        status: 'stopped',
        model: 'claude-3',
        skills: ['translator'],
        lastActive: new Date(Date.now() - 3600000)
      }
    ]
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
