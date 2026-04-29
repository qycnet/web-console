# OpenClaw Web Console - 需求文档

## 项目概述

OpenClaw Web Console 是 OpenClaw 的现代化 Web 管理界面，提供配置管理、文件操作、技能中心等功能。

## 核心功能

### 1. 认证与权限管理
- ✅ 本地访问免认证
- ✅ JWT Token 认证
- ✅ 管理员/普通用户角色
- ✅ 会话管理

### 2. 配置管理
- ✅ 可视化查看配置
- ✅ 表单模式编辑
- ✅ JSON 模式编辑（Monaco Editor）
- ✅ 配置热重载
- ✅ 配置备份与恢复

### 3. 文件管理
- ✅ 文件浏览器
- ✅ 文件上传/下载
- ✅ 在线编辑（Monaco Editor）
- ✅ 文件操作（新建、删除、移动）
- ✅ 语法高亮

### 4. 技能中心
- ✅ 技能市场展示
- ✅ 技能安装/卸载
- ✅ 技能配置
- ✅ 已安装技能管理

### 5. Agent 管理
- ✅ Agent 列表
- ✅ Agent 启停控制
- ✅ Agent 监控
- ✅ Agent 对话界面

### 6. 系统监控
- ✅ CPU/内存/磁盘监控（ECharts）
- ✅ 进程管理
- ✅ 日志查看
- ✅ 实时日志推送（WebSocket）

### 7. 其他功能
- ✅ 暗色/亮色主题切换
- ✅ 响应式布局
- ✅ 错误边界处理
- ✅ 单元测试

## 技术栈

### 前端
- Vue 3 + TypeScript
- Naive UI
- Monaco Editor（代码编辑器）
- ECharts（图表）
- Pinia + Vue Router
- Socket.io Client（WebSocket）

### 后端
- Node.js 18+
- Express.js
- SQLite
- JWT + bcrypt
- Socket.io

## 部署方式

- 本地运行：一键启动
- 全局安装：npm 全局安装
- 服务运行：pm2 守护进程

## 安全特性

- 本地访问免认证
- 公网访问强认证
- HTTPS 支持
- 文件路径安全检查
- 操作日志审计
- 前端错误上报

## 测试覆盖

- 前端单元测试（Vitest）
- 后端单元测试（Vitest + Supertest）
- Store 测试
- Router 测试
- API 测试
