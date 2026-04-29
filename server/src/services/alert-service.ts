import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Alert types
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'disabled'

export interface AlertRule {
  id: string
  name: string
  description?: string
  metric: 'cpu' | 'memory' | 'disk' | 'agent_down' | 'skill_error' | 'log_error' | 'rate_limit'
  condition: 'gt' | 'lt' | 'eq' | 'contains' | 'regex'
  threshold: number | string
  duration: number // seconds the condition must persist
  severity: AlertSeverity
  enabled: boolean
  channels: string[] // 'console', 'log'
  cooldown: number // seconds between alerts
  createdAt: string
  updatedAt: string
}

export interface AlertEvent {
  id: string
  ruleId: string
  ruleName: string
  severity: AlertSeverity
  status: AlertStatus
  message: string
  details: Record<string, any>
  value: number | string
  threshold: number | string
  triggeredAt: string
  acknowledgedAt?: string
  resolvedAt?: string
  acknowledgedBy?: string
  resolvedBy?: string
}

interface MetricSnapshot {
  cpu: number
  memory: number
  disk: number
  timestamp: number
}

// Event emitter for real-time alert notifications
export const alertEmitter = new EventEmitter()
alertEmitter.setMaxListeners(100)

class AlertManager {
  private db: Database.Database
  private rules: Map<string, AlertRule> = new Map()
  private activeAlerts: Map<string, { event: AlertEvent; count: number }> = new Map()
  private cooldowns: Map<string, number> = new Map()
  private metricHistory: MetricSnapshot[] = []
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private dbPath: string

  constructor() {
    const openclawDir = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw')
    const dataDir = path.join(openclawDir, 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    this.dbPath = path.join(dataDir, 'alerts.db')
    this.db = new Database(this.dbPath)
    this.initDatabase()
    this.loadRules()
    this.startMonitoring()
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        metric TEXT NOT NULL,
        condition TEXT NOT NULL,
        threshold TEXT NOT NULL,
        duration INTEGER DEFAULT 0,
        severity TEXT DEFAULT 'warning',
        enabled INTEGER DEFAULT 1,
        channels TEXT DEFAULT '["console","log"]',
        cooldown INTEGER DEFAULT 300,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS alert_events (
        id TEXT PRIMARY KEY,
        ruleId TEXT NOT NULL,
        ruleName TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        message TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        value TEXT,
        threshold TEXT,
        triggeredAt TEXT DEFAULT (datetime('now')),
        acknowledgedAt TEXT,
        resolvedAt TEXT,
        acknowledgedBy TEXT,
        resolvedBy TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events(status);
      CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON alert_events(severity);
      CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggeredAt);
    `)
  }

  private loadRules() {
    const rows = this.db.prepare('SELECT * FROM alert_rules').all() as any[]
    for (const row of rows) {
      this.rules.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description,
        metric: row.metric,
        condition: row.condition,
        threshold: isNaN(Number(row.threshold)) ? row.threshold : Number(row.threshold),
        duration: row.duration,
        severity: row.severity,
        enabled: Boolean(row.enabled),
        channels: JSON.parse(row.channels),
        cooldown: row.cooldown,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })
    }
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values())
  }

  getRule(id: string): AlertRule | undefined {
    return this.rules.get(id)
  }

  addRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): AlertRule {
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const newRule: AlertRule = { id, ...rule, createdAt: now, updatedAt: now }

    this.db.prepare(`
      INSERT INTO alert_rules (id, name, description, metric, condition, threshold, duration, severity, enabled, channels, cooldown, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newRule.id, newRule.name, newRule.description,
      newRule.metric, newRule.condition, String(newRule.threshold),
      newRule.duration, newRule.severity, newRule.enabled ? 1 : 0,
      JSON.stringify(newRule.channels), newRule.cooldown,
      newRule.createdAt, newRule.updatedAt
    )

    this.rules.set(id, newRule)
    return newRule
  }

  updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = this.rules.get(id)
    if (!rule) return null

    const updated = { ...rule, ...updates, updatedAt: new Date().toISOString() }

    this.db.prepare(`
      UPDATE alert_rules SET name=?, description=?, metric=?, condition=?, threshold=?, duration=?, severity=?, enabled=?, channels=?, cooldown=?, updatedAt=?
      WHERE id=?
    `).run(
      updated.name, updated.description, updated.metric, updated.condition,
      String(updated.threshold), updated.duration, updated.severity,
      updated.enabled ? 1 : 0, JSON.stringify(updated.channels),
      updated.cooldown, updated.updatedAt, id
    )

    this.rules.set(id, updated)
    return updated
  }

  deleteRule(id: string): boolean {
    const rule = this.rules.get(id)
    if (!rule) return false

    this.db.prepare('DELETE FROM alert_rules WHERE id=?').run(id)
    this.rules.delete(id)
    this.activeAlerts.delete(id)
    this.cooldowns.delete(id)
    return true
  }

  toggleRule(id: string, enabled: boolean): AlertRule | null {
    return this.updateRule(id, { enabled })
  }

  getEvents(options: {
    status?: AlertStatus
    severity?: AlertSeverity
    ruleId?: string
    limit?: number
    offset?: number
    startDate?: string
    endDate?: string
  } = {}): { events: AlertEvent[]; total: number } {
    let where = 'WHERE 1=1'
    const params: any[] = []

    if (options.status) { where += ' AND status=?'; params.push(options.status) }
    if (options.severity) { where += ' AND severity=?'; params.push(options.severity) }
    if (options.ruleId) { where += ' AND ruleId=?'; params.push(options.ruleId) }
    if (options.startDate) { where += ' AND triggeredAt>=?'; params.push(options.startDate) }
    if (options.endDate) { where += ' AND triggeredAt<=?'; params.push(options.endDate) }

    const total = (this.db.prepare(`SELECT COUNT(*) as total FROM alert_events ${where}`).get(...params) as any)?.total || 0

    let query = `SELECT * FROM alert_events ${where} ORDER BY triggeredAt DESC`
    if (options.limit) { query += ' LIMIT ?'; params.push(options.limit) }
    if (options.offset) { query += ' OFFSET ?'; params.push(options.offset) }

    const events = (this.db.prepare(query).all(...params) as any[]).map(this.rowToEvent)
    return { events, total }
  }

  acknowledgeEvent(eventId: string, by?: string): AlertEvent | null {
    const row = this.db.prepare('SELECT * FROM alert_events WHERE id=?').get(eventId) as any
    if (!row) return null
    this.db.prepare("UPDATE alert_events SET status='acknowledged', acknowledgedAt=datetime('now'), acknowledgedBy=? WHERE id=?")
      .run(by || null, eventId)
    return this.rowToEvent(this.db.prepare('SELECT * FROM alert_events WHERE id=?').get(eventId))
  }

  resolveEvent(eventId: string, by?: string): AlertEvent | null {
    const row = this.db.prepare('SELECT * FROM alert_events WHERE id=?').get(eventId) as any
    if (!row) return null
    this.db.prepare("UPDATE alert_events SET status='resolved', resolvedAt=datetime('now'), resolvedBy=? WHERE id=?")
      .run(by || null, eventId)
    this.activeAlerts.delete(row.ruleId)
    return this.rowToEvent(this.db.prepare('SELECT * FROM alert_events WHERE id=?').get(eventId))
  }

  private rowToEvent(row: any): AlertEvent {
    return {
      id: row.id,
      ruleId: row.ruleId,
      ruleName: row.ruleName,
      severity: row.severity,
      status: row.status,
      message: row.message,
      details: JSON.parse(row.details || '{}'),
      value: row.value,
      threshold: row.threshold,
      triggeredAt: row.triggeredAt,
      acknowledgedAt: row.acknowledgedAt,
      resolvedAt: row.resolvedAt,
      acknowledgedBy: row.acknowledgedBy,
      resolvedBy: row.resolvedBy
    }
  }

  pushMetric(cpu: number, memory: number, disk: number) {
    this.metricHistory.push({ cpu, memory, disk, timestamp: Date.now() })
    if (this.metricHistory.length > 600) { // Keep last hour (at 5s intervals)
      this.metricHistory.shift()
    }
  }

  private evaluateRule(rule: AlertRule, currentValue: number): boolean {
    switch (rule.condition) {
      case 'gt': return currentValue > Number(rule.threshold)
      case 'lt': return currentValue < Number(rule.threshold)
      case 'eq': return currentValue === Number(rule.threshold)
      default: return false
    }
  }

  checkMetric(metric: 'cpu' | 'memory' | 'disk', currentValue: number) {
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.metric !== metric) continue

      if (this.evaluateRule(rule, currentValue)) {
        const now = Date.now()
        const lastAlert = this.cooldowns.get(rule.id) || 0
        if (now - lastAlert < rule.cooldown * 1000) continue

        // Check duration persistence
        if (rule.duration > 0 && this.metricHistory.length >= 2) {
          const count = Math.ceil(rule.duration / 5)
          const recent = this.metricHistory.slice(-count)
          const allViolate = recent.every(d => {
            const val = metric === 'cpu' ? d.cpu : metric === 'memory' ? d.memory : d.disk
            return this.evaluateRule(rule, val)
          })
          if (!allViolate) continue
        }

        this.triggerAlert(rule, currentValue)
        this.cooldowns.set(rule.id, now)
      }
    }
  }

  private triggerAlert(rule: AlertRule, value: number | string) {
    const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const event: AlertEvent = {
      id,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'active',
      message: `[${rule.severity.toUpperCase()}] ${rule.name}: ${value} ${rule.condition} ${rule.threshold}`,
      details: { metric: rule.metric, condition: rule.condition },
      value,
      threshold: rule.threshold,
      triggeredAt: new Date().toISOString()
    }

    this.db.prepare(`
      INSERT INTO alert_events (id, ruleId, ruleName, severity, status, message, details, value, threshold, triggeredAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, event.ruleId, event.ruleName, event.severity, event.status,
      event.message, JSON.stringify(event.details), String(event.value), String(event.threshold), event.triggeredAt)

    const existing = this.activeAlerts.get(rule.id)
    if (existing) {
      existing.count++
      existing.event = event
    } else {
      this.activeAlerts.set(rule.id, { event, count: 1 })
    }

    alertEmitter.emit('alert', event)
  }

  private startMonitoring() {
    this.checkInterval = setInterval(() => {
      // Monitoring runs via evaluateMetrics
    }, 5000)
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  getStats() {
    const active = (this.db.prepare("SELECT COUNT(*) as count FROM alert_events WHERE status='active'").get() as any)?.count || 0
    const acknowledged = (this.db.prepare("SELECT COUNT(*) as count FROM alert_events WHERE status='acknowledged'").get() as any)?.count || 0
    const critical = (this.db.prepare("SELECT COUNT(*) as count FROM alert_events WHERE severity='critical'").get() as any)?.count || 0
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM alert_events').get() as any)?.count || 0

    return {
      activeRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      activeAlerts: active,
      acknowledgedAlerts: acknowledged,
      criticalAlerts: critical,
      totalEvents: total
    }
  }
}

// Singleton instance
export const alertManager = new AlertManager()

// Convenience function to push metrics and evaluate all rules
export function evaluateMetrics(cpu: number, memory: number, disk: number) {
  alertManager.pushMetric(cpu, memory, disk)
  alertManager.checkMetric('cpu', cpu)
  alertManager.checkMetric('memory', memory)
  alertManager.checkMetric('disk', disk)
}
