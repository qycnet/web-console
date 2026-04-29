# OpenClaw Web Console

OpenClaw 的现代化 Web 管理界面，提供配置管理、文件操作、技能中心等功能。

## 功能特性

- 🔐 **认证与权限管理** - 支持本地免密登录、JWT Token 认证
- ⚙️ **配置管理** - 可视化编辑 OpenClaw 配置，支持热重载
- 📁 **文件管理** - 在线浏览、编辑、上传、下载文件
- 🎯 **技能中心** - 技能库展示、安装、卸载、配置
- 🤖 **Agent 管理** - Agent 列表、控制、监控、对话
- 📊 **系统监控** - 资源监控、进程管理、日志查看

## 技术栈

### 前端
- Vue 3 + TypeScript
- Naive UI
- Monaco Editor
- ECharts
- Pinia + Vue Router

### 后端
- Node.js 18+
- Express.js
- SQLite
- JWT + bcrypt

## 快速开始

### 环境要求
- Node.js 18.0.0+
- npm 8.0.0+

### 安装

```bash
# 克隆项目
git clone https://github.com/qycnet/web-console.git

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 生产运行
npm start
```

## 项目结构

```
web-console/
├── client/              # 前端代码
│   ├── src/
│   │   ├── views/       # 页面组件
│   │   ├── components/  # 通用组件
│   │   ├── stores/      # Pinia 状态管理
│   │   ├── router/      # 路由配置
│   │   ├── api/         # API 接口
│   │   └── utils/       # 工具函数
│   └── public/          # 静态资源
├── server/              # 后端代码
│   ├── routes/          # API 路由
│   ├── middleware/      # 中间件
│   ├── services/        # 业务逻辑
│   ├── models/          # 数据模型
│   └── utils/           # 工具函数
├── docs/                # 文档
└── tests/               # 测试
```

## 文档

- [需求文档](./docs/requirements.md)
- [API 文档](./docs/api.md)
- [部署文档](./docs/deployment.md)

## License

MIT
