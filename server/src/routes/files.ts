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

export default router
