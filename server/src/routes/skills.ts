import { Router, Response, Request } from 'express'
import { authMiddleware, requireRole, auditLog } from '../middleware/auth.js'
import { skillService } from '../services/skill-service.js'
import { logger } from '../utils/logger.js'

const router = Router()

router.use(authMiddleware)

/**
 * GET /api/skills
 * 获取技能市场列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query
    const skills = await skillService.getMarketSkills(
      category as string,
      search as string
    )
    res.json(skills)
  } catch (error) {
    logger.error('Failed to get market skills:', error)
    res.status(500).json({ error: '获取技能列表失败' })
  }
})

/**
 * GET /api/skills/categories
 * 获取技能分类
 */
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await skillService.getCategories()
    res.json(categories)
  } catch (error) {
    logger.error('Failed to get categories:', error)
    res.status(500).json({ error: '获取分类失败' })
  }
})

/**
 * GET /api/skills/installed
 * 获取已安装技能
 */
router.get('/installed', async (_req: Request, res: Response) => {
  try {
    const skills = await skillService.getInstalledSkills()
    res.json(skills)
  } catch (error) {
    logger.error('Failed to get installed skills:', error)
    res.status(500).json({ error: '获取已安装技能失败' })
  }
})

/**
 * GET /api/skills/:skillId
 * 获取技能详情
 */
router.get('/:skillId', async (req: Request, res: Response) => {
  try {
    const skills = await skillService.getMarketSkills()
    const skill = skills.find(s => s.id === req.params.skillId)

    if (!skill) {
      return res.status(404).json({ error: '技能不存在' })
    }

    res.json(skill)
  } catch (error) {
    logger.error('Failed to get skill:', error)
    res.status(500).json({ error: '获取技能信息失败' })
  }
})

/**
 * POST /api/skills/install/:skillId
 * 安装技能
 */
router.post('/install/:skillId',
  requireRole('admin'),
  auditLog('skill:install'),
  async (req: Request, res: Response) => {
    try {
      await skillService.installSkill(req.params.skillId)
      res.json({ message: '技能安装成功' })
    } catch (error: any) {
      logger.error('Failed to install skill:', error)
      res.status(500).json({ error: error.message || '安装技能失败' })
    }
  }
)

/**
 * DELETE /api/skills/:skillId
 * 卸载技能
 */
router.delete('/:skillId',
  requireRole('admin'),
  auditLog('skill:uninstall'),
  async (req: Request, res: Response) => {
    try {
      await skillService.uninstallSkill(req.params.skillId)
      res.json({ message: '技能已卸载' })
    } catch (error: any) {
      logger.error('Failed to uninstall skill:', error)
      res.status(500).json({ error: error.message || '卸载技能失败' })
    }
  }
)

/**
 * PUT /api/skills/:skillId/toggle
 * 启用/禁用技能
 */
router.put('/:skillId/toggle',
  requireRole('admin'),
  auditLog('skill:toggle'),
  async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body
      await skillService.toggleSkill(req.params.skillId, enabled)
      res.json({ message: enabled ? '技能已启用' : '技能已禁用' })
    } catch (error) {
      logger.error('Failed to toggle skill:', error)
      res.status(500).json({ error: '操作失败' })
    }
  }
)

/**
 * PUT /api/skills/:skillId/config
 * 配置技能
 */
router.put('/:skillId/config',
  requireRole('admin'),
  auditLog('skill:config'),
  async (req: Request, res: Response) => {
    try {
      await skillService.configureSkill(req.params.skillId, req.body)
      res.json({ message: '配置已保存' })
    } catch (error) {
      logger.error('Failed to configure skill:', error)
      res.status(500).json({ error: '配置失败' })
    }
  }
)

export default router
