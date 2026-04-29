import { Router, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'

const router = Router()

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
const SKILLS_DIR = path.join(OPENCLAW_DIR, 'workspace', 'skills')

// 获取技能市场列表
router.get('/', async (_, res: Response) => {
  try {
    // 模拟技能市场数据
    const marketSkills = [
      {
        id: 'weather',
        name: '天气查询',
        description: '查询全球各地实时天气信息',
        rating: 4.5,
        tags: ['天气', '生活', '实用']
      },
      {
        id: 'news',
        name: '新闻资讯',
        description: '获取最新新闻资讯和热点事件',
        rating: 4.2,
        tags: ['新闻', '资讯', '热点']
      },
      {
        id: 'translator',
        name: '翻译助手',
        description: '多语言实时翻译服务',
        rating: 4.8,
        tags: ['翻译', '语言', '工具']
      },
      {
        id: 'reminder',
        name: '提醒助手',
        description: '智能提醒和待办事项管理',
        rating: 4.3,
        tags: ['提醒', '待办', '效率']
      },
      {
        id: 'calendar',
        name: '日程管理',
        description: '日历和日程安排管理',
        rating: 4.6,
        tags: ['日历', '日程', '效率']
      },
      {
        id: 'email',
        name: '邮件助手',
        description: '邮件发送和管理服务',
        rating: 4.1,
        tags: ['邮件', '通信', '办公']
      }
    ]
    res.json(marketSkills)
  } catch (error) {
    logger.error('Failed to get market skills:', error)
    res.status(500).json({ error: '获取技能列表失败' })
  }
})

// 获取已安装技能
router.get('/installed', async (_, res: Response) => {
  try {
    const skillsExists = await fs.pathExists(SKILLS_DIR)
    if (!skillsExists) {
      return res.json([])
    }

    const dirs = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
    const skills = await Promise.all(
      dirs
        .filter(d => d.isDirectory())
        .map(async (dir) => {
          const skillPath = path.join(SKILLS_DIR, dir.name)
          const skillMdPath = path.join(skillPath, 'SKILL.md')
          let description = ''

          if (await fs.pathExists(skillMdPath)) {
            const content = await fs.readFile(skillMdPath, 'utf-8')
            const descMatch = content.match(/^#\s+(.+)$/m)
            description = descMatch ? descMatch[1] : dir.name
          }

          return {
            id: dir.name,
            name: dir.name,
            description,
            enabled: true
          }
        })
    )
    res.json(skills)
  } catch (error) {
    logger.error('Failed to get installed skills:', error)
    res.status(500).json({ error: '获取已安装技能失败' })
  }
})

// 安装技能
router.post('/install/:skillId', async (req, res: Response) => {
  try {
    const { skillId } = req.params
    logger.info(`Installing skill: ${skillId}`)
    // 这里可以调用 clawhub 或其他技能安装机制
    res.json({ message: `技能 ${skillId} 安装成功` })
  } catch (error) {
    logger.error('Failed to install skill:', error)
    res.status(500).json({ error: '安装技能失败' })
  }
})

// 卸载技能
router.delete('/:skillId', async (req, res: Response) => {
  try {
    const { skillId } = req.params
    const skillPath = path.join(SKILLS_DIR, skillId)
    await fs.remove(skillPath)
    logger.info(`Skill uninstalled: ${skillId}`)
    res.json({ message: `技能 ${skillId} 已卸载` })
  } catch (error) {
    logger.error('Failed to uninstall skill:', error)
    res.status(500).json({ error: '卸载技能失败' })
  }
})

// 配置技能
router.put('/:skillId/config', async (req, res: Response) => {
  try {
    const { skillId } = req.params
    const configPath = path.join(SKILLS_DIR, skillId, 'config.json')
    await fs.writeJson(configPath, req.body, { spaces: 2 })
    logger.info(`Skill configured: ${skillId}`)
    res.json({ message: `技能 ${skillId} 配置已保存` })
  } catch (error) {
    logger.error('Failed to configure skill:', error)
    res.status(500).json({ error: '配置技能失败' })
  }
})

export default router
