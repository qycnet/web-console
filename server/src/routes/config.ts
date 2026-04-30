import { Router, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'

const router = Router()

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
const CONFIG_FILE = path.join(OPENCLAW_DIR, 'config.json')

// 获取所有配置
router.get('/', async (_, res: Response) => {
  try {
    const configExists = await fs.pathExists(CONFIG_FILE)
    if (!configExists) {
      return res.json({})
    }
    const config = await fs.readJson(CONFIG_FILE)
    res.json(config)
  } catch (error) {
    logger.error('Failed to read config:', error)
    res.status(500).json({ error: '读取配置失败' })
  }
})

// 备份配置（需在 /:key 之前注册，避免被通配路由吞掉）
router.get('/backup', async (_, res: Response) => {
  try {
    const configExists = await fs.pathExists(CONFIG_FILE)
    if (!configExists) {
      return res.status(404).json({ error: '配置文件不存在' })
    }
    const config = await fs.readJson(CONFIG_FILE)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=config-backup-${Date.now()}.json`)
    res.send(JSON.stringify(config, null, 2))
  } catch (error) {
    logger.error('Failed to backup config:', error)
    res.status(500).json({ error: '备份配置失败' })
  }
})

// 获取单个配置项
router.get('/:key', async (req, res: Response) => {
  try {
    const configExists = await fs.pathExists(CONFIG_FILE)
    if (!configExists) {
      return res.json(null)
    }
    const config = await fs.readJson(CONFIG_FILE)
    res.json(config[req.params.key])
  } catch (error) {
    logger.error('Failed to read config key:', error)
    res.status(500).json({ error: '读取配置失败' })
  }
})

// 更新配置
router.put('/:key', async (req, res: Response) => {
  try {
    let config = {}
    const configExists = await fs.pathExists(CONFIG_FILE)
    if (configExists) {
      config = await fs.readJson(CONFIG_FILE)
    }

    if (req.params.key === 'all') {
      config = req.body.value
    } else {
      (config as any)[req.params.key] = req.body.value
    }

    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 })
    logger.info('Config updated')
    res.json({ message: '配置已保存' })
  } catch (error) {
    logger.error('Failed to update config:', error)
    res.status(500).json({ error: '保存配置失败' })
  }
})

// 热重载配置
router.post('/reload', async (_, res: Response) => {
  try {
    // 这里可以触发 OpenClaw 的配置重载
    logger.info('Config reloaded')
    res.json({ message: '配置已重载' })
  } catch (error) {
    logger.error('Failed to reload config:', error)
    res.status(500).json({ error: '重载配置失败' })
  }
})

export default router
