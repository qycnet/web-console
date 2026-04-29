import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import configRoutes from '../src/routes/config.js'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    readJson: vi.fn(),
    writeJson: vi.fn()
  }
}))

import fs from 'fs-extra'

const app = express()
app.use(express.json())
app.use('/api/config', configRoutes)

describe('Config Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/config', () => {
    it('should return empty object if config not exists', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)

      const response = await request(app)
        .get('/api/config')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({})
    })

    it('should return config if exists', async () => {
      const mockConfig = { appName: 'OpenClaw', port: 3000 }
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readJson).mockResolvedValue(mockConfig)

      const response = await request(app)
        .get('/api/config')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockConfig)
    })
  })

  describe('PUT /api/config/:key', () => {
    it('should update config', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readJson).mockResolvedValue({})
      vi.mocked(fs.writeJson).mockResolvedValue(undefined)

      const response = await request(app)
        .put('/api/config/appName')
        .send({ value: 'NewName' })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('配置已保存')
    })
  })

  describe('POST /api/config/reload', () => {
    it('should reload config', async () => {
      const response = await request(app)
        .post('/api/config/reload')

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('配置已重载')
    })
  })
})
