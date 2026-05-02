import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { config } from 'dotenv'
import { logger } from './utils/logger.js'
import { rateLimiter } from './middleware/auth.js'
import { wsAuthMiddleware } from './middleware/ws-auth.js'
import { openclawService } from './services/openclaw-service.js'
import { skillService } from './services/skill-service.js'
import { alertEmitter, evaluateMetrics } from './services/alert-service.js'
import { deviceService } from './services/device-service.js'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import filesRoutes from './routes/files.js'
import skillsRoutes from './routes/skills.js'
import agentsRoutes from './routes/agents.js'
import usersRoutes from './routes/users.js'
import monitorRoutes from './routes/monitor.js'
import alertsRoutes from './routes/alerts.js'
import devicesRoutes from './routes/devices.js'
import tasksRoutes from './routes/tasks.js'

config()

// getIO accessor for io singleton
let ioInstance: SocketServer | null = null
export function getIO(): SocketServer | null {
  return ioInstance
}

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
})
ioInstance = io

// WebSocket JWT 认证
io.use(wsAuthMiddleware)

const PORT = process.env.PORT || 3001

// HTTPS 强制重定向（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      // 只对 GET/HEAD 做 301 重定向
      if (req.method === 'GET' || req.method === 'HEAD') {
        return res.redirect(301, `https://${req.hostname}${req.originalUrl}`)
      }
      // 其他方法返回 403
      return res.status(403).json({ error: 'HTTPS is required' })
    }
    next()
  })
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Rate limiting
app.use('/api/', rateLimiter)

// Static files
app.use(express.static('public'))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/monitor', monitorRoutes)
app.use('/api/alerts', alertsRoutes)
app.use('/api/devices', devicesRoutes)
app.use('/api/tasks', tasksRoutes)

// Health check
app.get('/api/health', async (req, res) => {
  const openclawInfo = await openclawService.discover()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openclaw: openclawInfo ? {
      version: openclawInfo.version,
      installed: true
    } : {
      installed: false
    }
  })
})

// WebSocket connections
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`)

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`)
  })

  // Real-time logs
  socket.on('subscribe:logs', () => {
    socket.join('logs')
    logger.info(`Client ${socket.id} subscribed to logs`)
  })

  socket.on('unsubscribe:logs', () => {
    socket.leave('logs')
    logger.info(`Client ${socket.id} unsubscribed from logs`)
  })

// 模拟实时日志推送
let logInterval: ReturnType<typeof setInterval> | null = null
function startLogPush(): void {
  if (logInterval) return
  logInterval = setInterval(() => {
    const levels = ['INFO', 'DEBUG', 'WARN', 'ERROR']
    const messages = [
      'Processing request',
      'Cache hit',
      'Database query executed',
      'API response sent',
      'Memory usage normal'
    ]

    const log = {
      level: levels[Math.floor(Math.random() * levels.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    }
    io.to('logs').emit('log', log)
  }, 3000)
}

function stopLogPushIfEmpty(): void {
  const room = io.sockets.adapter.rooms.get('logs')
  if (!room || room.size === 0) {
    if (logInterval) {
      clearInterval(logInterval)
      logInterval = null
    }
  }
}

  // Agent status
  socket.on('subscribe:agents', () => {
    socket.join('agents')
    logger.info(`Client ${socket.id} subscribed to agents`)
  })

  socket.on('unsubscribe:agents', () => {
    socket.leave('agents')
    logger.info(`Client ${socket.id} unsubscribed from agents`)
  })
})

// Forward alerts to WebSocket
alertEmitter.on('alert', (event) => {
  io.emit('alerts:new', event)
})

// Forward agent events to WebSocket
openclawService.on('agent:status', (agent) => {
  io.to('agents').emit('agent:status', agent)
})

openclawService.on('agent:started', (data) => {
  io.to('agents').emit('agent:started', data)
})

openclawService.on('agent:stopped', (data) => {
  io.to('agents').emit('agent:stopped', data)
})

openclawService.on('agent:error', (data) => {
  io.to('agents').emit('agent:error', data)
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  })
})

// Initialize services
async function init() {
  try {
    // Discover OpenClaw
    const openclawInfo = await openclawService.discover()
    if (openclawInfo) {
      logger.info(`OpenClaw found: v${openclawInfo.version} at ${openclawInfo.installDir}`)
    } else {
      logger.warn('OpenClaw not found, running in standalone mode')
    }

    // Initialize skill service
    await skillService.init()
    logger.info('Skill service initialized')

    // Initialize device service
    await deviceService.init()
    logger.info('Device service initialized')

    // Initialize task service
    taskService.startCleanup()

    // Register task runners for heavy CLI operations
    taskService.onTask('agent:create', async (_task, payload: any) => {
      const { name, model, workspace, persona } = payload
      const result = await openclawService.createAgent(name, { model, workspace, persona })
      return result
    })

    taskService.onTask('agent:update', async (_task, payload: any) => {
      const { agentId, updates } = payload
      await openclawService.updateAgent(agentId, updates)
      return { message: 'Agent 已更新' }
    })

    taskService.onTask('agent:delete', async (_task, payload: any) => {
      const { agentId } = payload
      await openclawService.deleteAgent(agentId)
      return { message: 'Agent 已删除' }
    })
    logger.info('Task service initialized')

    // Agent monitoring
    openclawService.monitorAgents()

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`)
      logger.info(`📚 API docs: http://localhost:${PORT}/api/health`)
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to initialize:', error)
    process.exit(1)
  }
}

init()

export { io }
