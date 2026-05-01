import { Router, Response, Request } from 'express'
import si from 'systeminformation'
import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'

const router = Router()

// 获取系统信息
router.get('/system', async (_, res: Response) => {
  try {
    const [cpu, mem, disk, osInfo, currentLoad] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.currentLoad()
    ])

    const uptime = os.uptime()
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)

    res.json({
      cpu: Math.round(currentLoad.currentLoad),
      memory: Math.round((mem.used / mem.total) * 100),
      diskUsed: disk[0]?.used || 0,
      diskTotal: disk[0]?.size || 0,
      diskUsage: disk[0] ? Math.round(((disk[0].size - disk[0].available) / disk[0].size) * 100) : 0,
      version: '1.0.0',
      nodeVersion: process.version,
      uptime: `${days}天 ${hours}小时 ${minutes}分钟`,
      platform: `${osInfo.distro} ${osInfo.release}`,
      cpuInfo: cpu.brand,
      totalMemory: Math.round(mem.total / 1024 / 1024 / 1024) + ' GB',
      usedMemory: Math.round(mem.used / 1024 / 1024 / 1024) + ' GB'
    })
  } catch (error) {
    logger.error('Failed to get system info:', error)
    res.status(500).json({ error: '获取系统信息失败' })
  }
})

// 获取进程列表
router.get('/processes', async (_, res: Response) => {
  try {
    const processes = await si.processes()
    const list = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 20)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        memory: Math.round(p.mem * 10) / 10,
        status: p.state
      }))
    res.json(list)
  } catch (error) {
    logger.error('Failed to get processes:', error)
    res.status(500).json({ error: '获取进程列表失败' })
  }
})

// 获取真实日志
router.get('/logs', async (req, res: Response) => {
  try {
    const { level, search, limit = 100 } = req.query
    const maxLines = Math.min(Math.max(Number(limit) || 100, 10), 5000)

    const logPaths = getLogPaths()
    const allLogs: string[] = []

    for (const logPath of logPaths) {
      try {
        if (await fs.pathExists(logPath)) {
          const content = await fs.readFile(logPath, 'utf-8')
          const lines = content.split('\n').filter(Boolean)
          allLogs.push(...lines.reverse())
        }
      } catch {
        continue
      }
    }

    let filteredLogs = allLogs

    if (level) {
      const levelUpper = (level as string).toUpperCase()
      filteredLogs = filteredLogs.filter(log => extractLogLevel(log) === levelUpper)
    }

    if (search) {
      const searchStr = (search as string).toLowerCase()
      filteredLogs = filteredLogs.filter(log => log.toLowerCase().includes(searchStr))
    }

    res.json({
      logs: filteredLogs.slice(0, maxLines),
      total: filteredLogs.length
    })
  } catch (error) {
    logger.error('Failed to get logs:', error)
    res.status(500).json({ error: '获取日志失败' })
  }
})

/**
 * 日志导出
 */
router.get('/export', async (req, res: Response) => {
  try {
    const { level, search, format = 'txt' } = req.query
    const logPaths = getLogPaths()
    const allLogs: string[] = []

    for (const logPath of logPaths) {
      try {
        if (await fs.pathExists(logPath)) {
          const content = await fs.readFile(logPath, 'utf-8')
          allLogs.push(...content.split('\n').filter(Boolean).reverse())
        }
      } catch {
        continue
      }
    }

    let filteredLogs = allLogs
    if (level) {
      const lu = (level as string).toUpperCase()
      filteredLogs = filteredLogs.filter(l => extractLogLevel(l) === lu)
    }
    if (search) {
      const ss = (search as string).toLowerCase()
      filteredLogs = filteredLogs.filter(l => l.toLowerCase().includes(ss))
    }

    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const fn = `logs-export-${Date.now()}`

    if (format === 'json') {
      const data = filteredLogs.slice(0, 5000).map(l => ({
        timestamp: extractTimestamp(l),
        level: extractLogLevel(l),
        message: l
      }))
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=${fn}.json`)
      res.json(data)
    } else {
      const header = `# SkillHub Log Export\n# Generated: ${ts}\n# Total: ${filteredLogs.length}\n${'='.repeat(60)}\n\n`
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=${fn}.txt`)
      res.send(header + filteredLogs.slice(0, 5000).join('\n'))
    }
  } catch (error) {
    logger.error('Failed to export logs:', error)
    res.status(500).json({ error: '日志导出失败' })
  }
})

/**
 * GET /api/monitor/network
 * 获取网络流量统计（读取 /proc/net/dev）
 */
router.get('/network', async (_req, res: Response) => {
  try {
    const fs = await import('fs')
    const data = fs.readFileSync('/proc/net/dev', 'utf-8')
    const lines = data.split('\n').filter(Boolean)

    const interfaces: Array<{
      name: string
      rxBytes: number
      rxPackets: number
      rxErrors: number
      rxDrop: number
      txBytes: number
      txPackets: number
      txErrors: number
      txDrop: number
      speed?: string
    }> = []

    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim()
      const parts = line.split(/\s+/)
      if (parts.length < 10) continue

      const name = parts[0].replace(':', '')
      const entry = {
        name,
        rxBytes: parseInt(parts[1], 10) || 0,
        rxPackets: parseInt(parts[2], 10) || 0,
        rxErrors: parseInt(parts[3], 10) || 0,
        rxDrop: parseInt(parts[4], 10) || 0,
        txBytes: parseInt(parts[9], 10) || 0,
        txPackets: parseInt(parts[10], 10) || 0,
        txErrors: parseInt(parts[11], 10) || 0,
        txDrop: parseInt(parts[12], 10) || 0
      }
      interfaces.push(entry)
    }

    // 尝试获取接口速率（仅 Linux 支持）
    for (const iface of interfaces) {
      try {
        const speedPath = `/sys/class/net/${iface.name}/speed`
        const speedData = fs.readFileSync(speedPath, 'utf-8').trim()
        if (speedData && speedData !== '-1') {
          iface.speed = `${speedData} Mbps`
        }
      } catch {
        // 忽略，部分接口没有 speed 文件
      }
    }

    res.json(interfaces)
  } catch (error) {
    logger.error('Failed to get network stats:', error)
    res.status(500).json({ error: '获取网络流量信息失败' })
  }
})

// 接收前端错误上报
router.post('/errors', async (req, res: Response) => {
  try {
    const error = req.body
    logger.error('Frontend Error:', error)
    res.json({ received: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to record error' })
  }
})

/**
 * 获取可能的日志文件路径
 */
function getLogPaths(): string[] {
  const openclawDir = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw')
  const homeDir = os.homedir()
  return [
    path.join(openclawDir, 'logs', 'server.log'),
    path.join(openclawDir, 'logs', 'app.log'),
    path.join(openclawDir, 'logs', 'error.log'),
    path.join(homeDir, '.pm2', 'logs', 'openclaw-out.log'),
    path.join(homeDir, '.pm2', 'logs', 'openclaw-error.log'),
    '/var/log/syslog',
    '/var/log/messages'
  ]
}

function extractLogLevel(log: string): string {
  const m = log.match(/\[(INFO|DEBUG|WARN|ERROR|FATAL)\]/i)
  return m ? m[1].toUpperCase() : 'INFO'
}

function extractTimestamp(log: string): string {
  const m = log.match(/^\[([^\]]+)\]/)
  return m ? m[1] : ''
}

export default router
