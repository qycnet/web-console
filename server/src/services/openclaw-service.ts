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
      const packageExists = await fs.pathExists(path.join(dir, 'package.json'))
      return configExists || packageExists
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
        return Object.entries(state).map(([id, info]: [string, any]) => ({
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
      }

      // 如果没有状态文件，返回模拟数据
      return this.getMockAgents()
    } catch (error) {
      logger.error('Failed to get agents:', error)
      return this.getMockAgents()
    }
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
   */
  async sendMessage(agentId: string, message: string): Promise<string> {
    try {
      // 通过 IPC 或 HTTP 与 Agent 通信
      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })

      const data = (await response.json()) as { response?: string }
      return data.response || ''
    } catch (error) {
      logger.error(`Failed to send message to agent ${agentId}:`, error)
      return '抱歉，无法连接到 Agent。'
    }
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
