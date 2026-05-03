# OpenClaw Web Console

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.4+-4FC08D?logo=vue.js)](https://vuejs.org/)

OpenClaw 的现代化 Web 管理界面，提供配置管理、文件操作、技能中心、Agent 管理等完整功能。

## ✨ 功能特性

### 核心功能

| 模块 | 功能描述 |
|------|----------|
| 🔐 **认证与权限** | JWT Token 认证、三级角色权限（admin/user/viewer）、WebSocket 认证 |
| 👥 **用户管理** | 用户 CRUD、角色分配、状态管理、审计日志 |
| ⚙️ **配置管理** | 可视化编辑、JSON 模式、热重载、备份恢复、字段加密 |
| 📁 **文件管理** | 在线浏览、Monaco 编辑器、上传下载、安全路径检查 |
| 🎯 **技能中心** | 技能市场、一键安装/卸载、中文支持、分类搜索、真实安装/卸载 API |
| 🤖 **Agent 管理** | 列表查看、启停控制、管理面板、SSE 流式对话（打字机效果，首字 < 1s） |
| 🧵 **会话管理** | 历史会话 SQLite 持久化、会话切换、新会话/删除会话 |
| 🔍 **对话搜索** | 会话内按关键词搜索历史消息 |
| 📥 **对话导出** | 支持 JSON / Markdown 格式导出完整对话 |
| 💬 **多 Tab 并行对话** | 同时打开多个 Agent 对话 Tab，独立 SSE 流，互不干扰 |
| 🧩 **组件化架构** | ChatHeader/ChatTabBar/ChatPanel/AgentSelector 独立组件，易于扩展 |
| 🔄 **最小化浮动窗** | 对话窗口可最小化，右下角浮动气泡，跨页面保持状态，未读消息计数 |
| 👥 **群聊多 Agent 协作** | 选择多个 Agent 加入群聊，并发调用各 Agent 流式回复，按 Agent 分条展示 |
| ⚡ **异步任务** | Agent 创建/编辑/删除异步执行（2 秒轮询，后台完成后自动刷新） |
| 📊 **系统监控** | CPU/内存/磁盘、进程管理、实时日志推送 |
| 📝 **代码编辑** | Monaco Editor、语法高亮、多语言支持 |
| 🚨 **告警管理** | 告警规则、条件引擎、等级设置、事件追溯 |

### 安全特性

- ✅ JWT 认证（无硬编码后备密钥）
- ✅ WebSocket JWT 认证
- ✅ 请求速率限制（防暴力攻击）
- ✅ 首次登录强制修改默认密码
- ✅ 默认管理员密码随机生成
- ✅ 完整操作审计日志
- ✅ 前端错误上报
- ✅ 文件路径安全检查 + 上传文件类型白名单
- ✅ 危险操作二次确认
- ✅ 敏感字段 AES-256-GCM 加密

### OpenClaw 集成

- ✅ 自动发现 OpenClaw 安装目录
- ✅ 配置热重载（SIGHUP）
- ✅ Agent 启停控制
- ✅ Agent 状态监控
- ✅ SSE 流式对话（绕过 CLI，直调 LLM API，首字 < 1s）
- ✅ 群聊多 Agent 并发流式对话（POST /api/chat/group）
- ✅ 技能安装/卸载（真实 API 对接）
- ✅ 异步任务机制（创建/编辑/删除不阻塞）

## 🔌 新增依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `better-sqlite3` | ^9.4.3 | 会话 & 消息持久化 |
| `socket.io` | ^4.7.4 | WebSocket 实时事件推送 |

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

### 默认管理员

首次启动时自动创建管理员账户：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | 随机生成（打印在控制台）或通过 `ADMIN_PASSWORD` 环境变量设置 | 管理员 |

> 💡 首次登录后需强制修改默认密码。
>
> 🔐 所有 API 请求均需 JWT Token 认证，WebSocket 连接也需携带 Token

## 📁 项目结构

```
web-console/
├── client/                    # 前端代码（Vue 3 + Naive UI）
│   ├── index.html
│   ├── main.ts               # 入口文件
│   ├── App.vue               # 根组件
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── package.json
│   ├── src/
│   │   ├── api/              # API 接口封装
│   │   │   └── index.ts
│   │   ├── assets/           # 静态资源
│   │   │   └── logo.svg
│   │   ├── components/       # 通用组件
│   │   │   ├── AgentSelector.vue       # 选择 Agent 弹窗
│   │   │   ├── ChatFloat.vue           # 最小化浮动窗
│   │   │   ├── ChatHeader.vue          # 对话页头部
│   │   │   ├── ChatPanel.vue           # 对话面板（消息 + 输入）
│   │   │   ├── ChatTabBar.vue          # 多 Tab 切换栏
│   │   │   ├── ConfigSectionCollection.vue
│   │   │   ├── GroupChatSelector.vue   # 群聊选择弹窗
│   │   │   └── MonacoEditor.vue        # 代码编辑器
│   │   ├── composables/
│   │   │   └── useWebSocket.ts         # WebSocket 组合式函数
│   │   ├── router/           # 路由配置
│   │   │   └── index.ts
│   │   ├── stores/           # Pinia 状态管理
│   │   │   ├── chat.ts       # 对话状态（tabs/messages/SSE）
│   │   │   ├── theme.ts      # 主题状态
│   │   │   └── user.ts       # 用户状态
│   │   ├── types/            # 类型声明
│   │   │   ├── ionicons.d.ts
│   │   │   └── vicons.d.ts
│   │   ├── utils/            # 工具函数
│   │   │   └── errorHandler.ts
│   │   └── views/            # 页面组件
│   │       ├── Agents.vue    # Agent 管理
│   │       ├── Chat.vue      # 独立对话页面
│   │       ├── Config.vue    # 配置管理
│   │       ├── Dashboard.vue # 仪表盘
│   │       ├── Devices.vue   # 设备管理
│   │       ├── Files.vue     # 文件管理
│   │       ├── Layout.vue    # 布局框架
│   │       ├── Login.vue     # 登录页
│   │       ├── Logs.vue      # 日志
│   │       ├── Monitor.vue   # 系统监控
│   │       ├── Providers.vue # 供应商管理
│   │       ├── Skills.vue    # 技能中心
│   │       └── Users.vue     # 用户管理
│   └── tests/                # 前端测试
│       ├── api/index.test.ts
│       ├── router/index.test.ts
│       └── stores/theme.test.ts
├── server/                    # 后端代码（Express + SQLite + Socket.IO）
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts          # 服务入口 + WebSocket 初始化
│   │   ├── middleware/       # 中间件
│   │   │   ├── auth.ts       # JWT 认证中间件
│   │   │   └── ws-auth.ts    # WebSocket 认证
│   │   ├── routes/           # API 路由
│   │   │   ├── agents.ts     # Agent 管理 + SSE 流式对话
│   │   │   ├── alerts.ts     # 告警规则/事件
│   │   │   ├── auth.ts       # 登录/登出
│   │   │   ├── chat.ts       # 群聊多 Agent 协作
│   │   │   ├── config.ts     # 配置管理
│   │   │   ├── devices.ts    # 设备管理
│   │   │   ├── files.ts      # 文件管理
│   │   │   ├── monitor.ts    # 系统监控
│   │   │   ├── skills.ts     # 技能中心
│   │   │   ├── tasks.ts      # 任务管理
│   │   │   └── users.ts      # 用户管理
│   │   ├── services/         # 核心服务
│   │   │   ├── alert-service.ts      # 告警规则引擎
│   │   │   ├── database.ts           # SQLite 数据库
│   │   │   ├── deepseek-service.ts   # **流式对话引擎（SSE，直调 LLM API）**
│   │   │   ├── device-service.ts     # 设备管理
│   │   │   ├── encryption-service.ts # AES-256-GCM 加密
│   │   │   ├── openclaw-service.ts   # OpenClaw CLI 封装 + Agent CRUD
│   │   │   ├── skill-service.ts      # 技能安装/卸载/搜索
│   │   │   ├── task-service.ts       # 异步任务管理 + 轮询
│   │   │   └── user-service.ts       # 用户管理
│   │   └── utils/            # 工具函数
│   │       ├── jwt-secret.ts # JWT 密钥工具
│   │       └── logger.ts    # 日志工具
│   └── tests/                # 后端测试
│       └── routes/           # 路由测试
│           ├── auth.test.ts
│           ├── config.test.ts
│           └── files.test.ts
├── docs/                     # 文档
│   ├── requirements.md       # 需求文档
│   ├── api.md                # API 文档（详细）
│   └── deployment.md         # 部署文档
├── .env.example              # 环境变量示例（含 DEEPSEEK_API_KEY）
├── .gitignore
├── LICENSE
├── package-lock.json
└── package.json              # 项目配置
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
| `JWT_SECRET` | JWT 密钥 | — | ✅ **必填，无默认值** |
| `ADMIN_PASSWORD` | 初始管理员密码 | 随机生成（8位hex） | ❌ |
| `OPENCLAW_DIR` | OpenClaw 目录 | `~/.openclaw` | ❌ |
| `LOG_LEVEL` | 日志级别 | `info` | ❌ |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（流式对话用） | — | ❌ |
| `<PROVIDER>_API_KEY` | 其他 Provider 的 API Key（如 `OPENAI_API_KEY`） | — | ❌ |

> ⚠️ **必须设置 JWT_SECRET 环境变量**，否则服务启动失败。
> 
> ⚡ 流式对话需要配置对应 LLM 的 API Key。默认识别 `DEEPSEEK_API_KEY`（对应 deepseek provider），
> 也支持 `OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 等。如果同时配置了多个，在 Agent 编辑面板选择 Provider 即可切换。

## 🚀 部署

### PM2 守护进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start npm --name "web-console" -- start

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
| GET | `/api/agents` | Agent 列表（从 CLI/状态文件/配置文件三级获取）|
| GET | `/api/agents/models` | 可用模型列表（从 OpenClaw 配置动态读取）|
| GET | `/api/agents/:id` | Agent 详情（含 provider/temperature/maxTokens/avatar 等）|
| POST | `/api/agents` | 创建 Agent（写入 workspace 人设文件 + 注册 CLI）|
| PUT | `/api/agents/:id` | 更新 Agent（名称/模型/人设/Provider/温度/Max Tokens/描述/头像）|
| DELETE | `/api/agents/:id` | 删除 Agent（清理状态 + workspace 目录）|
| POST | `/api/agents/:id/start` | 启动 Agent |
| POST | `/api/agents/:id/stop` | 停止 Agent |
| POST | `/api/agents/:id/restart` | 重启 Agent |
| POST | `/api/agents/:id/chat` | 与 Agent 对话（旧接口，CLI 模式）|
| **GET** | `/api/agents/:id/chat/stream` | **流式对话（新）— SSE 打字机效果，首字 < 1s** |
| **POST** | `/api/chat/group` | **群聊多 Agent 协作 — SSE 并发流式返回，每 token 携带 agentId** |
| GET | `/api/agents/:id/logs` | 获取 Agent 日志 |
| GET | `/api/agents/:id/stats` | 获取 Agent 统计信息（含 sessionCount/totalMessages/totalTokens）|
| GET | `/api/agents/:id/sessions` | 获取 Agent 的会话列表 |
| GET | `/api/agents/:id/sessions/:sid` | 获取会话详情（含消息列表） |
| POST | `/api/agents/:id/sessions` | 新建会话 |
| DELETE | `/api/agents/:id/sessions/:sid` | 删除会话（级联删除消息） |
| GET | `/api/agents/:id/sessions/:sid/search` | 搜索会话中的消息 |
| GET | `/api/agents/:id/sessions/:sid/export` | 导出会话为 JSON |
| GET | `/api/agents/:id/sessions/:sid/export/markdown` | 导出会话为 Markdown |

### 文件 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files?path=/` | 文件列表 |
| GET | `/api/files/read?path=/` | 读取文件内容 |
| PUT | `/api/files/write` | 写入文件 |
| POST | `/api/files/upload` | 上传文件（单文件，最大 100MB）|
| POST | `/api/files/batch-upload` | 批量上传（最多 50 个文件）|
| POST | `/api/files/chunk/init` | 大文件断点续传 - 初始化会话 |
| POST | `/api/files/chunk/upload` | 大文件断点续传 - 上传分片 |
| POST | `/api/files/chunk/merge` | 大文件断点续传 - 合并分片 |
| GET | `/api/files/chunk/status/:uploadId` | 大文件断点续传 - 查询进度 |
| DELETE | `/api/files/chunk/cancel/:uploadId` | 大文件断点续传 - 取消清理 |
| GET | `/api/files/download?path=/` | 下载文件（目录自动打包 ZIP）|
| DELETE | `/api/files?path=/` | 删除文件/目录 |
| PUT | `/api/files/move` | 移动/重命名文件 |
| POST | `/api/files/mkdir` | 创建目录 |

### 监控 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/monitor/system` | 系统信息（CPU/内存/磁盘）|
| GET | `/api/monitor/processes` | 进程列表 |
| GET | `/api/monitor/logs` | 系统日志 |
| GET | `/api/monitor/network` | 网络流量（读取 /proc/net/dev）|
| POST | `/api/monitor/errors` | 前端错误上报 |

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
