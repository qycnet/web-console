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

// 列出所有配置备份
router.get('/backups', async (_, res: Response) => {
  try {
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '/root', '.openclaw')
    const backupDir = path.join(openclawDir, 'backups')
    await fs.ensureDir(backupDir)

    const files = await fs.readdir(backupDir)
    const backups = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 50)
        .map(async (f) => {
          const stat = await fs.stat(path.join(backupDir, f))
          return {
            id: f.replace('.json', ''),
            filename: f,
            size: stat.size,
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString()
          }
        })
    )
    res.json(backups)
  } catch (error) {
    logger.error('Failed to list config backups:', error)
    res.status(500).json({ error: '获取备份列表失败' })
  }
})

// 从备份恢复配置
router.post('/restore/:backupId', async (req, res: Response) => {
  try {
    const { backupId } = req.params
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '/root', '.openclaw')
    const backupFile = path.join(openclawDir, 'backups', `${backupId}.json`)

    if (!await fs.pathExists(backupFile)) {
      return res.status(404).json({ error: '备份文件不存在' })
    }

    const backupConfig = await fs.readJson(backupFile)
    const configPath = await getConfigFilePath()
    await fs.writeJson(configPath, backupConfig, { spaces: 2 })

    logger.info(`Config restored from backup: ${backupId}`)
    res.json({ message: '配置已恢复，请执行热重载使其生效' })
  } catch (error) {
    logger.error('Failed to restore config:', error)
    res.status(500).json({ error: '恢复配置失败' })
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
    // 尝试通过 openclawService 热重载
    await openclawService.reloadConfig()
    // 也触发 alertNotifier 重新加载通知配置
    const configPath = await getConfigFilePath()
    const { alertNotifier } = await import('../services/alert-service.js')
    alertNotifier.loadConfig(configPath)
    logger.info('Config reloaded successfully')
    res.json({ message: '配置已重载' })
  } catch (error) {
    logger.error('Failed to reload config:', error)
    // 即使 reload 失败，配置本身可能已更新
    res.json({ message: '配置已保存，热重载可能失败，建议重启服务' })
  }
})

export default router
