import { Router, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'
import { openclawService } from '../services/openclaw-service.js'

const router = Router()

/**
 * 获取 openclaw.json 的路径。
 * 优先通过 discover() 找到 OpenClaw 目录 -> openclaw.json
 * 兜底：HOME/openclaw.json
 */
async function getConfigFilePath(): Promise<string> {
  const discovered = await openclawService.discover()
  if (discovered) {
    const jsonPath = path.join(discovered.installDir, 'openclaw.json')
    if (await fs.pathExists(jsonPath)) {
      return jsonPath
    }
    // fallback to config.json if discover returned that dir
    const cfgPath = path.join(discovered.installDir, 'config.json')
    if (await fs.pathExists(cfgPath)) {
      return cfgPath
    }
  }

  // 兜底：HOME/openclaw.json
  const homeConfig = path.join(process.env.HOME || '/root', 'openclaw.json')
  if (await fs.pathExists(homeConfig)) {
    return homeConfig
  }

  // 最后兜底
  return path.join(process.env.HOME || '/root', '.openclaw', 'config.json')
}

// 获取所有配置
router.get('/', async (_, res: Response) => {
  try {
    const configPath = await getConfigFilePath()
    const configExists = await fs.pathExists(configPath)
    if (!configExists) {
      return res.json({})
    }
    const config = await fs.readJson(configPath)
    res.json(config)
  } catch (error) {
    logger.error('Failed to read config:', error)
    res.status(500).json({ error: '读取配置失败' })
  }
})

// 备份配置（需在 /:key 之前注册，避免被通配路由吞掉）
router.get('/backup', async (_, res: Response) => {
  try {
    const configPath = await getConfigFilePath()
    const configExists = await fs.pathExists(configPath)
    if (!configExists) {
      return res.status(404).json({ error: '配置文件不存在' })
    }
    const config = await fs.readJson(configPath)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=openclaw-config-backup-${Date.now()}.json`)
    res.send(JSON.stringify(config, null, 2))
  } catch (error) {
    logger.error('Failed to backup config:', error)
    res.status(500).json({ error: '备份配置失败' })
  }
})

// 获取单个配置项
router.get('/:key', async (req, res: Response) => {
  try {
    const configPath = await getConfigFilePath()
    const configExists = await fs.pathExists(configPath)
    if (!configExists) {
      return res.json({})
    }
    const config = await fs.readJson(configPath)
    res.json(config[req.params.key])
  } catch (error) {
    logger.error('Failed to read config key:', error)
    res.status(500).json({ error: '读取配置失败' })
  }
})

// 更新配置
router.put('/:key', async (req, res: Response) => {
  try {
    const configPath = await getConfigFilePath()

    // 确保父目录存在
    await fs.ensureDir(path.dirname(configPath))

    const configExists = await fs.pathExists(configPath)

    if (req.params.key === 'all') {
      // 全量替换
      await fs.writeJson(configPath, req.body.value, { spaces: 2 })
    } else {
      // 单字段更新
      let config: Record<string, any> = {}
      if (configExists) {
        config = await fs.readJson(configPath)
      }
      config[req.params.key] = req.body.value
      await fs.writeJson(configPath, config, { spaces: 2 })
    }

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
    // TODO: 触发 OpenClaw 的配置重载
    logger.info('Config reloaded')
    res.json({ message: '配置已重载' })
  } catch (error) {
    logger.error('Failed to reload config:', error)
    res.status(500).json({ error: '重载配置失败' })
  }
})

export default router
