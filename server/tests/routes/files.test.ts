import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import filesRoutes from '../src/routes/files.js'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    ensureDir: vi.fn(),
    remove: vi.fn(),
    move: vi.fn()
  }
}))

import fs from 'fs-extra'

const app = express()
app.use(express.json())
app.use('/api/files', filesRoutes)

describe('Files Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/files', () => {
    it('should return file list', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'folder1', isDirectory: () => true }
      ] as any)
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024, mtime: new Date() } as any)

      const response = await request(app)
        .get('/api/files')
        .query({ path: '/' })

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
    })
  })

  describe('GET /api/files/read', () => {
    it('should return file content', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('file content')

      const response = await request(app)
        .get('/api/files/read')
        .query({ path: '/test.txt' })

      expect(response.status).toBe(200)
    })
  })

  describe('PUT /api/files/write', () => {
    it('should write file', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const response = await request(app)
        .put('/api/files/write')
        .send({ path: '/test.txt', content: 'hello' })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('文件已保存')
    })
  })

  describe('DELETE /api/files', () => {
    it('should delete file', async () => {
      vi.mocked(fs.remove).mockResolvedValue(undefined)

      const response = await request(app)
        .delete('/api/files')
        .query({ path: '/test.txt' })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('文件已删除')
    })
  })

  describe('POST /api/files/mkdir', () => {
    it('should create directory', async () => {
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)

      const response = await request(app)
        .post('/api/files/mkdir')
        .send({ path: '/new-folder' })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('目录已创建')
    })
  })
})
