# OpenClaw Web Console

OpenClaw 的现代化 Web 管理界面，提供配置管理、文件操作、技能中心等功能。

![OpenClaw Console](./docs/screenshot.png)

## ✨ 功能特性

- 🔐 **认证与权限管理** - 支持本地免密登录、JWT Token 认证
- ⚙️ **配置管理** - 可视化编辑 OpenClaw 配置，支持热重载
- 📁 **文件管理** - 在线浏览、编辑、上传、下载文件
- 🎯 **技能中心** - 技能库展示、安装、卸载、配置
- 🤖 **Agent 管理** - Agent 列表、控制、监控、对话
- 📊 **系统监控** - 资源监控、进程管理、日志查看
- 📝 **代码编辑器** - Monaco Editor 集成，支持语法高亮
- 🔄 **实时日志** - WebSocket 实时日志推送

## 🛠 技术栈

### 前端
- Vue 3 + TypeScript
- Naive UI
- Monaco Editor
- ECharts
- Pinia + Vue Router
- Socket.io Client

### 后端
- Node.js 18+
- Express.js
- SQLite
- JWT + bcrypt
- Socket.io

## 📦 快速开始

### 环境要求
- Node.js 18.0.0+
- npm 8.0.0+

### 安装

```bash
# 克隆项目
git clone https://github.com/qycnet/web-console.git
cd web-console

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 生产运行
npm start
```

### 访问

- 前端：http://localhost:3000
- 后端 API：http://localhost:3001/api
- 默认账户：admin / admin123
- 本地访问（localhost/127.0.0.1）免认证

## 📁 项目结构

```
web-console/
├── client/              # 前端代码
│   ├── src/
│   │   ├── views/       # 页面组件
│   │   ├── components/  # 通用组件
│   │   ├── stores/      # Pinia 状态管理
│   │   ├── router/      # 路由配置
│   │   ├── api/         # API 接口
│   │   ├── composables/ # 组合式函数
│   │   └── utils/       # 工具函数
│   └── tests/           # 前端测试
├── server/              # 后端代码
│   ├── src/
│   │   ├── routes/      # API 路由
│   │   ├── middleware/  # 中间件
│   │   ├── services/    # 业务逻辑
│   │   └── utils/       # 工具函数
│   └── tests/           # 后端测试
└── docs/                # 文档
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行测试（单次）
npm run test:run

# 测试覆盖率
npm run test:coverage
```

## 📚 文档

- [需求文档](./docs/requirements.md)
- [API 文档](./docs/api.md)
- [部署文档](./docs/deployment.md)

## 🔧 配置

复制 `.env.example` 为 `.env` 并修改：

```bash
cp .env.example .env
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3001 |
| CLIENT_URL | 客户端地址 | http://localhost:3000 |
| JWT_SECRET | JWT 密钥 | ⚠️ 生产环境必须修改 |
| OPENCLAW_DIR | OpenClaw 目录 | ~/.openclaw |
| LOG_LEVEL | 日志级别 | info |

## 🚀 部署

### PM2 守护进程

```bash
npm install -g pm2
pm2 start npm --name "openclaw-console" -- start
pm2 save
pm2 startup
```

### Docker（可选）

```bash
docker build -t openclaw-console .
docker run -d -p 3001:3001 openclaw-console
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT

---

Made with ❤️ by qycnet
