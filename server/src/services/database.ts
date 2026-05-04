import Database, { Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import fs from 'fs-extra'

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
const DB_PATH = path.join(OPENCLAW_DIR, 'web-console.db')

// 确保数据库目录存在
fs.ensureDirSync(OPENCLAW_DIR)

const db: DatabaseType = new Database(DB_PATH)

// 初始化数据库表（会话相关表，用户表由 UserService 管理）
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
`)

export const database = {
  getSetting: (key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row ? row.value : null
  },

  setSetting: (key: string, value: string) => {
    return db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `).run(key, value)
  },

  // ===== Sessions =====
  createSession: (id: string, agentId: string, title?: string) => {
    return db.prepare(`
      INSERT INTO sessions (id, agent_id, title)
      VALUES (?, ?, ?)
    `).run(id, agentId, title || null)
  },

  getSessions: (agentId: string, limit: number = 50) => {
    return db.prepare(`
      SELECT * FROM sessions WHERE agent_id = ?
      ORDER BY updated_at DESC LIMIT ?
    `).all(agentId, limit) as any[]
  },

  getSession: (sessionId: string) => {
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  },

  updateSessionTitle: (sessionId: string, title: string) => {
    return db.prepare(`
      UPDATE sessions SET title = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, sessionId)
  },

  touchSession: (sessionId: string) => {
    return db.prepare(`
      UPDATE sessions SET updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(sessionId)
  },

  deleteSession: (sessionId: string) => {
    return db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId) &&
           db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  },

  // ===== Messages =====
  saveMessage: (sessionId: string, role: string, content: string, tokens: number = 0) => {
    return db.prepare(`
      INSERT INTO messages (session_id, role, content, tokens)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, role, content, tokens)
  },

  getMessages: (sessionId: string, limit: number = 100) => {
    return db.prepare(`
      SELECT * FROM messages WHERE session_id = ?
      ORDER BY created_at ASC LIMIT ?
    `).all(sessionId, limit) as any[]
  },

  getRecentMessages: (sessionId: string, count: number = 50) => {
    return db.prepare(`
      SELECT * FROM messages WHERE session_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(sessionId, count).reverse() as any[]
  },

  searchMessages: (sessionId: string, keyword: string) => {
    return db.prepare(`
      SELECT * FROM messages WHERE session_id = ? AND content LIKE ?
      ORDER BY created_at ASC
    `).all(sessionId, `%${keyword}%`) as any[]
  }
}

export { db }
