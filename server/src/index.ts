import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { config } from 'dotenv'
import { logger } from './utils/logger.js'
import { rateLimiter } from './middleware/auth.js'
import { openclawService } from './services/openclaw-service.js'
import { skillService } from './services/skill-service.js'
import { alertEmitter, evaluateMetrics } from './services/alert-service.js'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import filesRoutes from './routes/files.js'
import skillsRoutes from './routes/skills.js'
import agentsRoutes from './routes/agents.js'
import usersRoutes from './routes/users.js'
import monitorRoutes from './routes/monitor.js'
import alertsRoutes from './routes/alerts.js'

config()

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
})

const PORT = process.env.PORT || 3001

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
