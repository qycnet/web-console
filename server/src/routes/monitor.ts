import { Router, Response } from 'express'
import si from 'systeminformation'
import os from 'os'
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
      version: '1.0.0',
      nodeVersion: process.version,
      uptime: `${days}天 ${hours}小时 ${minutes}分钟`,
      platform: `${osInfo.distro} ${osInfo.release}`,
      cpuInfo: cpu.brand,
      totalMemory: Math.round(mem.total / 1024 / 1024 / 1024) + ' GB'
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

// 获取日志
router.get('/logs', async (req, res: Response) => {
  try {
    const { level, search, limit = 100 } = req.query

    // 模拟日志数据
    const logs = [
      '[2024-01-20 10:00:00] [INFO] Server started on port 3001',
      '[2024-01-20 10:00:01] [INFO] Database connected',
      '[2024-01-20 10:00:02] [INFO] WebSocket server initialized',
      '[2024-01-20 10:05:00] [INFO] User logged in: admin',
      '[2024-01-20 10:10:00] [WARN] High CPU usage detected: 85%',
      '[2024-01-20 10:15:00] [INFO] Config reloaded',
      '[2024-01-20 10:20:00] [ERROR] Failed to connect to external API',
      '[2024-01-20 10:25:00] [INFO] Retry successful',
      '[2024-01-20 10:30:00] [DEBUG] Processing request: /api/skills',
      '[2024-01-20 10:35:00] [INFO] Skill installed: weather'
    ]

    let filteredLogs = logs
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.includes(`[${(level as string).toUpperCase()}]`))
    }
    if (search) {
      filteredLogs = filteredLogs.filter(log => log.includes(search as string))
    }

    res.json({
      logs: filteredLogs.slice(0, Number(limit)),
      total: filteredLogs.length
    })
  } catch (error) {
    logger.error('Failed to get logs:', error)
    res.status(500).json({ error: '获取日志失败' })
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

export default router
