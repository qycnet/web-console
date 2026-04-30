import { Router, Request, Response } from 'express'
import { alertManager, alertEmitter, evaluateMetrics, AlertRule } from '../services/alert-service'

const router = Router()

// GET /api/alerts/rules - Get all alert rules
router.get('/rules', (req: Request, res: Response) => {
  const rules = alertManager.getRules()
  res.json(rules)
})

// GET /api/alerts/rules/:id - Get a specific rule
router.get('/rules/:id', (req: Request, res: Response) => {
  const rule = alertManager.getRule(req.params.id)
  if (!rule) return res.status(404).json({ error: 'Rule not found' })
  res.json(rule)
})

// POST /api/alerts/rules - Create a new alert rule
router.post('/rules', (req: Request, res: Response) => {
  const { name, description, metric, condition, threshold, duration, severity, channels, cooldown } = req.body

  if (!name || !metric || !condition || threshold === undefined) {
    return res.status(400).json({ error: 'Missing required fields: name, metric, condition, threshold' })
  }

  const validMetrics = ['cpu', 'memory', 'disk', 'agent_down', 'skill_error', 'log_error', 'rate_limit']
  const validConditions = ['gt', 'lt', 'eq', 'contains', 'regex']
  const validSeverities = ['info', 'warning', 'critical']

  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: `Invalid metric. Valid: ${validMetrics.join(', ')}` })
  }
  if (!validConditions.includes(condition)) {
    return res.status(400).json({ error: `Invalid condition. Valid: ${validConditions.join(', ')}` })
  }
  if (severity && !validSeverities.includes(severity)) {
    return res.status(400).json({ error: `Invalid severity. Valid: ${validSeverities.join(', ')}` })
  }

  const rule = alertManager.addRule({
    name,
    description: description || '',
    metric,
    condition,
    threshold,
    duration: duration || 0,
    severity: severity || 'warning',
    enabled: true,
    channels: channels || ['console', 'log'],
    cooldown: cooldown || 300
  })

  res.status(201).json(rule)
})

// PUT /api/alerts/rules/:id - Update a rule
router.put('/rules/:id', (req: Request, res: Response) => {
  const updated = alertManager.updateRule(req.params.id, req.body)
  if (!updated) return res.status(404).json({ error: 'Rule not found' })
  res.json(updated)
})

// DELETE /api/alerts/rules/:id - Delete a rule
router.delete('/rules/:id', (req: Request, res: Response) => {
  const deleted = alertManager.deleteRule(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'Rule not found' })
  res.json({ message: 'Rule deleted' })
})

// POST /api/alerts/rules/:id/toggle - Enable/disable a rule
router.post('/rules/:id/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body
  const rule = alertManager.toggleRule(req.params.id, Boolean(enabled))
  if (!rule) return res.status(404).json({ error: 'Rule not found' })
  res.json(rule)
})

// GET /api/alerts/events - Get alert events
router.get('/events', (req: Request, res: Response) => {
  const { status, severity, ruleId, limit, offset, startDate, endDate } = req.query
  const result = alertManager.getEvents({
    status: status as any,
    severity: severity as any,
    ruleId: ruleId as string,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
    startDate: startDate as string,
    endDate: endDate as string
  })
  res.json(result)
})

// POST /api/alerts/events/:id/acknowledge - Acknowledge an alert
router.post('/events/:id/acknowledge', (req: Request, res: Response) => {
  const event = alertManager.acknowledgeEvent(req.params.id, (req as any).user?.username)
  if (!event) return res.status(404).json({ error: 'Event not found' })
  res.json(event)
})

// POST /api/alerts/events/:id/resolve - Resolve an alert
router.post('/events/:id/resolve', (req: Request, res: Response) => {
  const event = alertManager.resolveEvent(req.params.id, (req as any).user?.username)
  if (!event) return res.status(404).json({ error: 'Event not found' })
  res.json(event)
})

// POST /api/alerts/evaluate - Manually trigger metric evaluation
router.post('/evaluate', async (req: Request, res: Response) => {
  const { cpu, memory, disk } = req.body
  evaluateMetrics(cpu ?? 0, memory ?? 0, disk ?? 0)
  // Also emit to WebSocket
  try {
    const { io } = await import('../index.js')
    if (io) {
      io.emit('alerts:metrics', { cpu, memory, disk, timestamp: new Date().toISOString() })
    }
  } catch {
    // io not available, skip WebSocket emit
  }
  res.json({ message: 'Metrics evaluated' })
})

// GET /api/alerts/stats - Get alert statistics
router.get('/stats', (req: Request, res: Response) => {
  res.json(alertManager.getStats())
})

export default router
