import { describe, it, expect, beforeEach } from 'vitest'
import router from '@/router'

describe('Router', () => {
  beforeEach(() => {
    // 重置路由状态
    router.push('/')
  })

  it('should have correct routes defined', () => {
    const routes = router.getRoutes()

    expect(routes.some(r => r.path === '/login')).toBe(true)
    expect(routes.some(r => r.path === '/')).toBe(true)
    expect(routes.some(r => r.path === '/dashboard')).toBe(true)
    expect(routes.some(r => r.path === '/config')).toBe(true)
    expect(routes.some(r => r.path === '/files')).toBe(true)
    expect(routes.some(r => r.path === '/skills')).toBe(true)
    expect(routes.some(r => r.path === '/agents')).toBe(true)
    expect(routes.some(r => r.path === '/monitor')).toBe(true)
    expect(routes.some(r => r.path === '/logs')).toBe(true)
  })

  it('should redirect root to dashboard', async () => {
    await router.push('/')
    expect(router.currentRoute.value.redirectedFrom?.path).toBe('/')
  })

  it('should have meta for protected routes', () => {
    const routes = router.getRoutes()
    const protectedRoutes = routes.filter(r => r.meta?.requiresAuth === true)

    expect(protectedRoutes.length).toBeGreaterThan(0)
  })

  it('should have meta titles for child routes', () => {
    const routes = router.getRoutes()
    const routesWithTitles = routes.filter(r => r.meta?.title)

    expect(routesWithTitles.length).toBeGreaterThan(0)
  })
})
