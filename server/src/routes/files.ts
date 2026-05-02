import { Router, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import archiver from 'archiver'
import multer from 'multer'
import { logger } from '../utils/logger.js'

const router = Router()

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.json', '.yaml', '.yml', '.log', '.env', '.toml', '.ini', '.cfg']

function validateFileType(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext)
}

// 文件浏览器的根目录：用户 HOME 目录，允许访问 ~/openclaw.json 和 ~/.openclaw/ 等
const FILE_ROOT = process.env.HOME || '/root'

// 配置文件上传暂存目录
const UPLOAD_TEMP_DIR = path.join(process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw'), 'temp', 'uploads')
const CHUNK_DIR = path.join(UPLOAD_TEMP_DIR, 'chunks')

const upload = multer({
  dest: UPLOAD_TEMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
})

// 安全检查：确保路径在 FILE_ROOT 内
function safePath(requestPath: string): string {
  const resolved = path.resolve(FILE_ROOT, requestPath.replace(/^\//, ''))
  if (!resolved.startsWith(FILE_ROOT)) {
    throw new Error('非法路径')
  }
  return resolved
}

// 列出文件
router.get('/', async (req, res: Response) => {
  try {
    const dirPath = safePath(req.query.path as string || '/')
    const items = await fs.readdir(dirPath, { withFileTypes: true })

    const files = await Promise.all(items.map(async (item) => {
      const fullPath = path.join(dirPath, item.name)
      const stat = await fs.stat(fullPath)
      return {
        name: item.name,
        path: path.relative(FILE_ROOT, fullPath),
        type: item.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString()
      }
    }))

    res.json(files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    }))
  } catch (error) {
    logger.error('Failed to list files:', error)
    res.status(500).json({ error: '读取文件列表失败' })
  }
})

// 读取文件内容
router.get('/read', async (req, res: Response) => {
  try {
    const filePath = safePath(req.query.path as string)
    const content = await fs.readFile(filePath, 'utf-8')
    res.json(content)
  } catch (error) {
    logger.error('Failed to read file:', error)
    res.status(500).json({ error: '读取文件失败' })
  }
})

// 写入文件
router.put('/write', async (req, res: Response) => {
  try {
    const filePath = safePath(req.body.path)
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, req.body.content, 'utf-8')
    logger.info(`File written: ${req.body.path}`)
    res.json({ message: '文件已保存' })
  } catch (error) {
    logger.error('Failed to write file:', error)
    res.status(500).json({ error: '写入文件失败' })
  }
})

// 上传文件
router.post('/upload', upload.single('file'), async (req, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }
    if (!validateFileType(req.file.originalname)) {
      return res.status(400).json({ error: `不支持的文件类型，允许的类型: ${ALLOWED_EXTENSIONS.join(', ')}` })
    }
    const targetPath = safePath(req.body.path || '/')
    await fs.ensureDir(targetPath)
    await fs.move(req.file.path, path.join(targetPath, req.file.originalname), { overwrite: true })
    logger.info(`File uploaded: ${req.file.originalname}`)
    res.json({ message: '文件已上传' })
  } catch (error) {
    logger.error('Failed to upload file:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 下载文件
router.get('/download', async (req, res: Response) => {
  try {
    const filePath = safePath(req.query.path as string)
    const stat = await fs.stat(filePath)

    if (stat.isDirectory()) {
      // 打包下载目录
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(filePath)}.zip`)
      const archive = archiver('zip')
      archive.pipe(res)
      archive.directory(filePath, false)
      archive.finalize()
    } else {
      res.download(filePath)
    }
  } catch (error) {
    logger.error('Failed to download file:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 删除文件
router.delete('/', async (req, res: Response) => {
  try {
    const filePath = safePath(req.query.path as string)
    await fs.remove(filePath)
    logger.info(`File deleted: ${req.query.path}`)
    res.json({ message: '文件已删除' })
  } catch (error) {
    logger.error('Failed to delete file:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 移动/重命名文件
router.put('/move', async (req, res: Response) => {
  try {
    const oldPath = safePath(req.body.oldPath)
    const newPath = safePath(req.body.newPath)
    await fs.move(oldPath, newPath)
    logger.info(`File moved: ${req.body.oldPath} -> ${req.body.newPath}`)
    res.json({ message: '文件已移动' })
  } catch (error) {
    logger.error('Failed to move file:', error)
    res.status(500).json({ error: '移动文件失败' })
  }
})

// 创建目录
router.post('/mkdir', async (req, res: Response) => {
  try {
    const dirPath = safePath(req.body.path)
    await fs.ensureDir(dirPath)
    logger.info(`Directory created: ${req.body.path}`)
    res.json({ message: '目录已创建' })
  } catch (error) {
    logger.error('Failed to create directory:', error)
    res.status(500).json({ error: '创建目录失败' })
  }
})

/**
 * 批量上传 - 接受多个文件上传到指定目录
 * POST /api/files/batch-upload
 * Content-Type: multipart/form-data
 * Body: files[] (multiple), path (目标目录)
 */
router.post('/batch-upload', upload.array('files', 50), async (req, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    const targetDir = safePath(req.body.path || '/')
    await fs.ensureDir(CHUNK_DIR)

    const results: Array<{ name: string; size: number; status: 'success' | 'skipped' | 'error'; error?: string }> = []

    for (const file of files) {
      try {
        const targetPath = path.join(targetDir, file.originalname)
        await fs.ensureDir(path.dirname(targetPath))
        await fs.move(file.path, targetPath, { overwrite: true })
        results.push({
          name: file.originalname,
          size: file.size,
          status: 'success'
        })
        logger.info(`Batch uploaded: ${file.originalname} (${file.size} bytes)`)
      } catch (err: any) {
        // 清理临时文件
        try { await fs.remove(file.path) } catch {}
        results.push({
          name: file.originalname,
          size: file.size,
          status: 'error',
          error: err.message
        })
      }
    }

    res.json({
      message: `上传完成：${results.filter(r => r.status === 'success').length}/${results.length} 个文件`,
      results
    })
  } catch (error) {
    logger.error('Failed to batch upload files:', error)
    res.status(500).json({ error: '批量上传失败' })
  }
})

/**
 * 断点续传 - 初始化上传会话
 * POST /api/files/chunk/init
 * Body: { filename, fileSize, mimeType, targetDir }
 */
router.post('/chunk/init', async (req, res: Response) => {
  try {
    const { filename, fileSize, mimeType, targetDir } = req.body
    if (!filename || !fileSize) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const chunkSize = 5 * 1024 * 1024 // 5MB per chunk
    const totalChunks = Math.ceil(fileSize / chunkSize)
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const uploadDir = path.join(CHUNK_DIR, uploadId)

    await fs.ensureDir(uploadDir)
    // 保存会话信息
    await fs.writeJson(path.join(uploadDir, '_session.json'), {
      uploadId,
      filename,
      fileSize,
      mimeType: mimeType || 'application/octet-stream',
      targetDir: targetDir || '/',
      chunkSize,
      totalChunks,
      receivedChunks: [],
      createdAt: new Date().toISOString()
    })

    res.json({
      uploadId,
      chunkSize,
      totalChunks,
      message: `分片上传会话已创建，共 ${totalChunks} 个分片`
    })
  } catch (error) {
    logger.error('Failed to init chunk upload:', error)
    res.status(500).json({ error: '初始化上传会话失败' })
  }
})

/**
 * 断点续传 - 上传单个分片
 * POST /api/files/chunk/upload
 * Content-Type: multipart/form-data
 * Body: file (chunk binary), uploadId, chunkIndex
 */
router.post('/chunk/upload', upload.single('file'), async (req, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件分片' })
    }

    const { uploadId, chunkIndex } = req.body
    if (!uploadId || chunkIndex === undefined) {
      return res.status(400).json({ error: '缺少上传会话ID或分片序号' })
    }

    const sessionPath = path.join(CHUNK_DIR, uploadId, '_session.json')
    if (!await fs.pathExists(sessionPath)) {
      return res.status(404).json({ error: '上传会话不存在或已过期' })
    }

    const session = await fs.readJson(sessionPath)
    const chunkIndexNum = parseInt(chunkIndex, 10)

    if (chunkIndexNum < 0 || chunkIndexNum >= session.totalChunks) {
      return res.status(400).json({ error: '分片序号无效' })
    }

    // 保存分片
    const chunkPath = path.join(CHUNK_DIR, uploadId, `chunk-${chunkIndexNum}`)
    await fs.move(req.file.path, chunkPath, { overwrite: true })

    // 更新会话
    if (!session.receivedChunks.includes(chunkIndexNum)) {
      session.receivedChunks.push(chunkIndexNum)
    }
    await fs.writeJson(sessionPath, session)

    const progress = Math.round((session.receivedChunks.length / session.totalChunks) * 100)
    logger.info(`Chunk ${chunkIndexNum + 1}/${session.totalChunks} uploaded for ${session.filename} (${progress}%)`)

    res.json({
      uploadId,
      chunkIndex: chunkIndexNum,
      receivedChunks: session.receivedChunks.length,
      totalChunks: session.totalChunks,
      progress,
      complete: session.receivedChunks.length >= session.totalChunks
    })
  } catch (error) {
    logger.error('Failed to upload chunk:', error)
    res.status(500).json({ error: '上传分片失败' })
  }
})

/**
 * 断点续传 - 合并分片
 * POST /api/files/chunk/merge
 * Body: { uploadId }
 */
router.post('/chunk/merge', async (req, res: Response) => {
  try {
    const { uploadId } = req.body
    if (!uploadId) {
      return res.status(400).json({ error: '缺少上传会话ID' })
    }

    const uploadDir = path.join(CHUNK_DIR, uploadId)
    const sessionPath = path.join(uploadDir, '_session.json')
    if (!await fs.pathExists(sessionPath)) {
      return res.status(404).json({ error: '上传会话不存在或已过期' })
    }

    const session = await fs.readJson(sessionPath)
    if (session.receivedChunks.length < session.totalChunks) {
      return res.status(400).json({
        error: `分片不完整：已接收 ${session.receivedChunks.length}/${session.totalChunks}`,
        receivedChunks: session.receivedChunks,
        totalChunks: session.totalChunks
      })
    }

    const targetDir = safePath(session.targetDir || '/')
    const finalPath = path.join(targetDir, session.filename)
    await fs.ensureDir(path.dirname(finalPath))

    // 按顺序合并
    const writeStream = fs.createWriteStream(finalPath)
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk-${i}`)
      if (!await fs.pathExists(chunkPath)) {
        writeStream.destroy()
        throw new Error(`分片 ${i} 丢失`)
      }
      const data = await fs.readFile(chunkPath)
      writeStream.write(data)
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err: Error | null) => err ? reject(err) : resolve())
    })

    // 清理临时分片
    await fs.remove(uploadDir)

    const stat = await fs.stat(finalPath)
    logger.info(`Chunks merged: ${session.filename} (${stat.size} bytes)`)

    res.json({
      filename: session.filename,
      size: stat.size,
      path: path.relative(FILE_ROOT, finalPath),
      message: '文件上传完成'
    })
  } catch (error) {
    logger.error('Failed to merge chunks:', error)
    res.status(500).json({ error: '合并分片失败' })
  }
})

/**
 * 断点续传 - 查询上传状态
 * GET /api/files/chunk/status/:uploadId
 */
router.get('/chunk/status/:uploadId', async (req, res: Response) => {
  try {
    const { uploadId } = req.params
    const sessionPath = path.join(CHUNK_DIR, uploadId, '_session.json')
    if (!await fs.pathExists(sessionPath)) {
      return res.status(404).json({ error: '上传会话不存在或已过期' })
    }

    const session = await fs.readJson(sessionPath)
    // 清理敏感信息
    const { targetDir, ...safeInfo } = session

    res.json({
      ...safeInfo,
      progress: Math.round((session.receivedChunks.length / session.totalChunks) * 100),
      complete: session.receivedChunks.length >= session.totalChunks,
      missingChunks: Array.from({ length: session.totalChunks }, (_, i) => i)
        .filter(i => !session.receivedChunks.includes(i))
    })
  } catch (error) {
    logger.error('Failed to get chunk status:', error)
    res.status(500).json({ error: '获取上传状态失败' })
  }
})

/**
 * 断点续传 - 取消上传并清理
 * DELETE /api/files/chunk/cancel/:uploadId
 */
router.delete('/chunk/cancel/:uploadId', async (req, res: Response) => {
  try {
    const { uploadId } = req.params
    const uploadDir = path.join(CHUNK_DIR, uploadId)
    if (!await fs.pathExists(uploadDir)) {
      return res.status(404).json({ error: '上传会话不存在' })
    }

    await fs.remove(uploadDir)
    logger.info(`Chunk upload cancelled: ${uploadId}`)
    res.json({ message: '上传已取消，临时文件已清理' })
  } catch (error) {
    logger.error('Failed to cancel chunk upload:', error)
    res.status(500).json({ error: '取消上传失败' })
  }
})

export default router
