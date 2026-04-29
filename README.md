# OpenClaw Web Console

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.4+-4FC08D?logo=vue.js)](https://vuejs.org/)

OpenClaw 的现代化 Web 管理界面，提供配置管理、文件操作、技能中心、Agent 管理等完整功能。

## ✨ 功能特性

### 核心功能

| 模块 | 功能描述 |
|------|----------|
| 🔐 **认证与权限** | 本地免密登录、JWT Token、三级角色权限（admin/user/viewer） |
| 👥 **用户管理** | 用户 CRUD、角色分配、状态管理、审计日志 |
| ⚙️ **配置管理** | 可视化编辑、JSON 模式、热重载、备份恢复、字段加密 |
| 📁 **文件管理** | 在线浏览、Monaco 编辑器、上传下载、安全路径检查 |
| 🎯 **技能中心** | 技能市场、一键安装/卸载、中文支持、分类搜索 |
| 🤖 **Agent 管理** | 列表查看、启停控制、实时监控、Web 对话 |
| 📊 **系统监控** | CPU/内存/磁盘、进程管理、实时日志推送 |
| 📝 **代码编辑** | Monaco Editor、语法高亮、多语言支持 |
| 🚨 **告警管理** | 告警规则、条件引擎、等级设置、事件追溯 |

### 安全特性

- ✅ 请求速率限制（防暴力攻击）
- ✅ IP 白名单支持
- ✅ 危险操作二次确认
- ✅ 完整操作审计日志
- ✅ 前端错误上报
- ✅ 文件路径安全检查
- ✅ 敏感字段 AES-256-GCM 加密

### OpenClaw 集成

- ✅ 自动发现 OpenClaw 安装目录
- ✅ 配置热重载（SIGHUP）
- ✅ Agent 启停控制
- ✅ Agent 状态监控
- ✅ 技能安装/卸载

## 🛠 技术栈

### 前端
- **框架**: Vue 3.4+ / TypeScript 5.3+
- **UI 库**: Naive UI 2.37+
- **编辑器**: Monaco Editor 0.45+
- **图表**: ECharts 5.4+
- **状态管理**: Pinia 2.1+
- **路由**: Vue Router 4.2+
- **WebSocket**: Socket.io Client 4.7+

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js 4.18+
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT + bcrypt
- **WebSocket**: Socket.io 4.7+
- **安全**: Helmet + express-rate-limit

## 📦 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm >= 8.0.0
- 至少 1GB 可用内存

### 安装运行

```bash
# 克隆项目
git clone https://github.com/qycnet/web-console.git
cd web-console

# 安装依赖
npm install

# 开发模式（前后端同时启动）
npm run dev

# 生产构建
npm run build

# 生产运行
npm start
```

### 访问地址

| 地址 | 说明 |
|------|------|
| http://localhost:3000 | 前端界面 |
| http://localhost:3001/api | 后端 API |
| http://localhost:3001/api/health | 健康检查 |

### 默认账户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

> 💡 本地访问（localhost/127.0.0.1）自动免认证登录

## 📁 项目结构

```
web-console/
├── client/                    # 前端代码
│   ├── src/
│   │   ├── views/            # 页面组件（9个）
│   │   ├── components/       # 通用组件
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── router/           # 路由配置
│   │   ├── api/              # API 接口封装
│   │   ├── composables/      # 组合式函数
│   │   └── utils/            # 工具函数
│   └── tests/                # 前端测试
├── server/                    # 后端代码
│   ├── src/
│   │   ├── routes/           # API 路由（8个）
│   │   ├── services/         # 核心服务
│   │   ├── middleware/       # 中间件
│   │   └── utils/            # 工具函数
│   └── tests/                # 后端测试
└── docs/                     # 文档
    ├── requirements.md       # 需求文档
    ├── api.md                # API 文档
    └── deployment.md         # 部署文档
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行测试（单次）
npm run test:run

# 测试覆盖率报告
npm run test:coverage
```

测试覆盖：
- Store 测试（Theme）
- Router 测试
- API 模块测试
- Auth 路由测试
- Config 路由测试
- Files 路由测试

## 🔧 配置

```bash
cp .env.example .env
```

### 环境变量

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `PORT` | 服务端口 | `3001` | ❌ |
| `CLIENT_URL` | 客户端地址 | `http://localhost:3000` | ❌ |
| `JWT_SECRET` | JWT 密钥 | `openclaw-secret-key` | ⚠️ 生产必改 |
| `OPENCLAW_DIR` | OpenClaw 目录 | `~/.openclaw` | ❌ |
| `LOG_LEVEL` | 日志级别 | `info` | ❌ |

## 🚀 部署

### PM2 守护进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start npm --name "openclaw-console" -- start

# 开机自启
pm2 save
pm2 startup
```

## 📚 API 文档

### 认证 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户 |

### 用户 API（管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 用户列表 |
| POST | `/api/users` | 创建用户 |
| PUT | `/api/users/:id` | 更新用户 |
| DELETE | `/api/users/:id` | 删除用户 |
| GET | `/api/users/audit-logs` | 审计日志 |

### Agent API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | Agent 列表 |
| POST | `/api/agents/:id/start` | 启动 Agent |
| POST | `/api/agents/:id/stop` | 停止 Agent |
| POST | `/api/agents/:id/chat` | 与 Agent 对话 |

### 技能 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 技能市场 |
| GET | `/api/skills/installed` | 已安装技能 |
| POST | `/api/skills/install/:id` | 安装技能 |
| DELETE | `/api/skills/:id` | 卸载技能 |

### 告警 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/alerts/rules` | 告警规则列表 |
| POST | `/api/alerts/rules` | 创建规则 |
| PUT | `/api/alerts/rules/:id` | 更新规则 |
| DELETE | `/api/alerts/rules/:id` | 删除规则 |
| POST | `/api/alerts/rules/:id/toggle` | 启用/禁用规则 |
| GET | `/api/alerts/events` | 告警事件列表 |
| POST | `/api/alerts/events/:id/acknowledge` | 确认告警 |
| POST | `/api/alerts/events/:id/resolve` | 解决告警 |
| POST | `/api/alerts/evaluate` | 手动触发指标评估 |
| GET | `/api/alerts/stats` | 告警统计 |

更多 API 请查看 [API 文档](./docs/api.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

```bash
# Fork 后克隆
git clone https://github.com/YOUR_USERNAME/web-console.git

# 安装依赖
npm install

# 创建分支
git checkout -b feature/your-feature

# 提交代码
git commit -m "feat: your feature"
git push origin feature/your-feature

# 创建 Pull Request
```

## 📄 License

[MIT](./LICENSE) © 2024 qycnet

---
