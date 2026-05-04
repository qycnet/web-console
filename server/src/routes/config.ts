import { Router, Response, Request } from 'express'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'
import { openclawService } from '../services/openclaw-service.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { encryptSensitiveFields, decryptSensitiveFields } from '../services/encryption-service.js'

const router = Router()

// 所有配置路由需要 JWT 认证 + admin 角色（配置含敏感 API Key）
router.use(authMiddleware)
router.use(requireRole('admin'))

/**
 * 获取 config.json 的路径。
 * 优先通过 discover() 找到 OpenClaw 目录 -> config.json
 * 兜底：HOME/.openclaw/config.json
 */
async function getConfigFilePath(): Promise<string> {
  const discovered = await openclawService.discover()
  if (discovered) {
    const cfgPath = path.join(discovered.installDir, 'config.json')
    if (await fs.pathExists(cfgPath)) {
      return cfgPath
    }
  }

  // 兜底
  const homeCfg = path.join(process.env.HOME || '/root', '.openclaw', 'config.json')
  if (await fs.pathExists(homeCfg)) {
    return homeCfg
  }

  return homeCfg
}

/**
 * 读取完整 config（自动解密敏感字段）
 */
async function readFullConfig(): Promise<any> {
  const configPath = await getConfigFilePath()
  if (!await fs.pathExists(configPath)) return {}
  const raw = await fs.readJson(configPath)
  return decryptSensitiveFields(raw)
}

/**
 * 写入完整 config（自动加密敏感字段）
 */
async function writeFullConfig(config: any): Promise<void> {
  const configPath = await getConfigFilePath()
  await fs.ensureDir(path.dirname(configPath))
  await fs.writeJson(configPath, encryptSensitiveFields(config), { spaces: 2 })
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
// ============================================================================
// 供应商管理（Provider CRUD）
// config.json 结构：{ models: { providers: { name: { apiKey, baseUrl, ... } } } }
// ============================================================================

/**
 * GET /api/config/providers
 * 获取所有供应商列表（含模型）
 */
router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const providers = config?.models?.providers || {}
    const result: Array<{
      name: string
      label: string
      apiKey: string
      baseUrl: string
      defaultModel: string
      defaultTemperature: number
      defaultMaxTokens: number
      models: Array<{ id: string; name: string }>
    }> = []

    for (const [name, cfg] of Object.entries(providers) as [string, any][]) {
      const modelList = cfg.models || []
      const models = Array.isArray(modelList)
        ? modelList.map((m: any) => ({
            id: m.id || m.name || m.model || '',
            name: m.name || m.id || m.model || ''
          }))
        : []

      result.push({
        name,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        apiKey: cfg.apiKey ? cfg.apiKey.substring(0, 8) + '***' : '',
        baseUrl: cfg.baseUrl || '',
        defaultModel: cfg.defaultModel || (models.length > 0 ? models[0].id : ''),
        defaultTemperature: cfg.defaultTemperature ?? 0.7,
        defaultMaxTokens: cfg.defaultMaxTokens ?? 4096,
        models
      })
    }

    // 按 name 排序
    result.sort((a, b) => a.name.localeCompare(b.name))
    res.json(result)
  } catch (error) {
    logger.error('Failed to get providers:', error)
    res.status(500).json({ error: '获取供应商列表失败' })
  }
})

/**
 * GET /api/config/providers/:name
 * 获取单个供应商详情（含完整 apiKey）
 */
router.get('/providers/:name', async (req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }
    res.json({
      name: req.params.name,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      defaultModel: provider.defaultModel || '',
      defaultTemperature: provider.defaultTemperature ?? 0.7,
      defaultMaxTokens: provider.defaultMaxTokens ?? 4096,
      models: (provider.models || []).map((m: any) => ({
        id: m.id || m.name || m.model || '',
        name: m.name || m.id || m.model || ''
      }))
    })
  } catch (error) {
    logger.error('Failed to get provider:', error)
    res.status(500).json({ error: '获取供应商详情失败' })
  }
})

/**
 * POST /api/config/providers
 * 添加供应商
 */
router.post('/providers', async (req: Request, res: Response) => {
  try {
    const { name, apiKey, baseUrl, defaultModel, defaultTemperature, defaultMaxTokens, models } = req.body
    if (!name) {
      return res.status(400).json({ error: '供应商名称不能为空' })
    }

    const config = await readFullConfig()
    if (config.models?.providers?.[name]) {
      return res.status(400).json({ error: '供应商已存在' })
    }

    // 检查是否有 Agent 在使用此供应商（仅在删除时检查，此处忽略）

    const providerConfig: any = {
      apiKey: apiKey || '',
      baseUrl: baseUrl || '',
      defaultModel: defaultModel || '',
      defaultTemperature: defaultTemperature ?? 0.7,
      defaultMaxTokens: defaultMaxTokens ?? 4096,
      models: Array.isArray(models) ? models : []
    }

    if (!config.models) config.models = {}
    if (!config.models.providers) config.models.providers = {}
    config.models.providers[name] = providerConfig
    await writeFullConfig(config)

    logger.info(`Provider added: ${name}`)
    res.status(201).json({ message: '供应商添加成功', name })
  } catch (error) {
    logger.error('Failed to add provider:', error)
    res.status(500).json({ error: '添加供应商失败' })
  }
})

/**
 * PUT /api/config/providers/:name
 * 更新供应商
 */
router.put('/providers/:name', async (req: Request, res: Response) => {
  try {
    const { apiKey, baseUrl, defaultModel, defaultTemperature, defaultMaxTokens, models } = req.body
    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    if (apiKey !== undefined) provider.apiKey = apiKey
    if (baseUrl !== undefined) provider.baseUrl = baseUrl
    if (defaultModel !== undefined) provider.defaultModel = defaultModel
    if (defaultTemperature !== undefined) provider.defaultTemperature = defaultTemperature
    if (defaultMaxTokens !== undefined) provider.defaultMaxTokens = defaultMaxTokens
    if (models !== undefined) provider.models = Array.isArray(models) ? models : []

    await writeFullConfig(config)
    logger.info(`Provider updated: ${req.params.name}`)
    res.json({ message: '供应商更新成功' })
  } catch (error) {
    logger.error('Failed to update provider:', error)
    res.status(500).json({ error: '更新供应商失败' })
  }
})

/**
 * DELETE /api/config/providers/:name
 * 删除供应商（检查是否被 Agent 使用）
 */
router.delete('/providers/:name', async (req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    if (!config?.models?.providers?.[req.params.name]) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    // 检查是否有 Agent 在使用此供应商
    const agents = await openclawService.getAgents()
    const usingAgents = agents.filter(a => (a as any).provider === req.params.name)
    if (usingAgents.length > 0) {
      return res.status(400).json({
        error: `${usingAgents.length} 个 Agent 正在使用此供应商，无法删除`,
        agents: usingAgents.map(a => a.name)
      })
    }

    delete config.models.providers[req.params.name]
    await writeFullConfig(config)
    logger.info(`Provider deleted: ${req.params.name}`)
    res.json({ message: '供应商已删除' })
  } catch (error) {
    logger.error('Failed to delete provider:', error)
    res.status(500).json({ error: '删除供应商失败' })
  }
})

// ============================================================================
// 模型管理
// ============================================================================

/**
 * GET /api/config/models
 * 全量模型列表
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const providers = config?.models?.providers || {}
    const result: Array<{ id: string; name: string; provider: string; isDefault: boolean }> = []

    for (const [providerName, providerCfg] of Object.entries(providers) as [string, any][]) {
      const defaultModel = providerCfg.defaultModel || ''
      const modelList = providerCfg.models || []
      if (Array.isArray(modelList)) {
        for (const m of modelList) {
          const id = m.id || m.name || m.model || ''
          if (id) {
            result.push({
              id,
              name: m.name || id,
              provider: providerName,
              isDefault: id === defaultModel
            })
          }
        }
      }
    }

    res.json(result)
  } catch (error) {
    logger.error('Failed to get models:', error)
    res.status(500).json({ error: '获取模型列表失败' })
  }
})

/**
 * GET /api/config/providers/:name/models
 * 获取供应商的模型列表
 */
router.get('/providers/:name/models', async (req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    const defaultModel = provider.defaultModel || ''
    const models = (provider.models || []).map((m: any) => ({
      id: m.id || m.name || m.model || '',
      name: m.name || m.id || m.model || '',
      isDefault: (m.id || m.name || m.model || '') === defaultModel
    }))

    res.json(models)
  } catch (error) {
    logger.error('Failed to get provider models:', error)
    res.status(500).json({ error: '获取模型列表失败' })
  }
})

/**
 * POST /api/config/providers/:name/models
 * 添加模型到供应商
 */
router.post('/providers/:name/models', async (req: Request, res: Response) => {
  try {
    const { id, name } = req.body
    if (!id) {
      return res.status(400).json({ error: '模型 ID 不能为空' })
    }

    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    if (!Array.isArray(provider.models)) provider.models = []
    if (provider.models.find((m: any) => (m.id || m.name || m.model) === id)) {
      return res.status(400).json({ error: '模型已存在' })
    }

    provider.models.push({ id, name: name || id })
    await writeFullConfig(config)

    logger.info(`Model added to ${req.params.name}: ${id}`)
    res.status(201).json({ message: '模型添加成功' })
  } catch (error) {
    logger.error('Failed to add model:', error)
    res.status(500).json({ error: '添加模型失败' })
  }
})

/**
 * DELETE /api/config/providers/:name/models/:modelId
 * 删除模型
 */
router.delete('/providers/:name/models/:modelId', async (req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    if (!Array.isArray(provider.models)) {
      return res.status(404).json({ error: '模型不存在' })
    }

    const idx = provider.models.findIndex(
      (m: any) => (m.id || m.name || m.model) === req.params.modelId
    )
    if (idx === -1) {
      return res.status(404).json({ error: '模型不存在' })
    }

    // 如果是默认模型，不允许删除
    if (req.params.modelId === provider.defaultModel) {
      return res.status(400).json({ error: '默认模型不能删除，请先设置其他默认模型' })
    }

    provider.models.splice(idx, 1)
    await writeFullConfig(config)

    logger.info(`Model deleted from ${req.params.name}: ${req.params.modelId}`)
    res.json({ message: '模型已删除' })
  } catch (error) {
    logger.error('Failed to delete model:', error)
    res.status(500).json({ error: '删除模型失败' })
  }
})

/**
 * PUT /api/config/providers/:name/models/:modelId/default
 * 设为默认模型
 */
router.put('/providers/:name/models/:modelId/default', async (req: Request, res: Response) => {
  try {
    const config = await readFullConfig()
    const provider = config?.models?.providers?.[req.params.name]
    if (!provider) {
      return res.status(404).json({ error: '供应商不存在' })
    }

    const exists = (provider.models || []).some(
      (m: any) => (m.id || m.name || m.model) === req.params.modelId
    )
    if (!exists) {
      return res.status(404).json({ error: '模型不存在' })
    }

    provider.defaultModel = req.params.modelId
    await writeFullConfig(config)

    logger.info(`Default model set for ${req.params.name}: ${req.params.modelId}`)
    res.json({ message: '默认模型已更新' })
  } catch (error) {
    logger.error('Failed to set default model:', error)
    res.status(500).json({ error: '设置默认模型失败' })
  }
})
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
