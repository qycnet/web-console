# OpenClaw Web Console API 文档

## 目录

- [认证 API](#认证-api)
- [用户 API](#用户-api)
- [配置 API](#配置-api)
- [文件 API](#文件-api)
- [技能 API](#技能-api)
- [Agent API](#agent-api)
- [监控 API](#监控-api)
- [WebSocket 事件](#websocket-事件)
- [错误响应](#错误响应)
- [认证说明](#认证说明)

---

## 认证 API

### POST /api/auth/login

用户登录

**请求体:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应 (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-1",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "status": "active",
    "createdAt": "2024-01-20T10:00:00.000Z",
    "loginCount": 5
  }
}
```

**错误响应:**
- `400` - 用户名和密码必填
- `401` - 用户名或密码错误

**特殊说明:**
- 本地访问（localhost/127.0.0.1）自动返回管理员 Token

---

### POST /api/auth/logout

用户登出

**成功响应 (200):**
```json
{
  "message": "已登出"
}
```

---

### GET /api/auth/me

获取当前登录用户信息

**请求头:**
```
Authorization: Bearer <token>
```

**成功响应 (200):**
```json
{
  "id": "user-1",
  "username": "admin",
  "email": "admin@example.com",
  "role": "admin",
  "status": "active",
  "createdAt": "2024-01-20T10:00:00.000Z",
  "lastLoginAt": "2024-01-20T15:30:00.000Z",
  "loginCount": 5
}
```

**错误响应:**
- `401` - 未授权 / Token 无效

---

## 用户 API

> ⚠️ 所有用户 API 需要管理员权限

### GET /api/users

获取用户列表

**查询参数:**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量 |

**成功响应 (200):**
```json
{
  "users": [
    {
      "id": "user-1",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "status": "active",
      "createdAt": "2024-01-20T10:00:00.000Z",
      "lastLoginAt": "2024-01-20T15:30:00.000Z",
      "loginCount": 5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### POST /api/users

创建用户

**请求体:**
```json
{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com",
  "role": "user"
}
```

**字段说明:**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✅ | 用户名（唯一） |
| password | string | ✅ | 密码 |
| email | string | ❌ | 邮箱 |
| role | string | ❌ | 角色：admin/user/viewer，默认 user |

**成功响应 (201):**
```json
{
  "id": "user-2",
  "username": "newuser",
  "email": "user@example.com",
  "role": "user",
  "status": "active",
  "createdAt": "2024-01-20T16:00:00.000Z"
}
```

**错误响应:**
- `400` - 用户名已存在 / 参数错误

---

### PUT /api/users/:userId

更新用户信息

**路径参数:**
- `userId` - 用户 ID

**请求体:**
```json
{
  "email": "newemail@example.com",
  "role": "admin",
  "status": "active",
  "password": "newpassword"
}
```

**权限说明:**
- 管理员可修改所有字段
- 普通用户只能修改自己的 email 和 password

**成功响应 (200):**
```json
{
  "id": "user-2",
  "username": "newuser",
  "email": "newemail@example.com",
  "role": "admin",
  "status": "active"
}
```

---

### DELETE /api/users/:userId

删除用户

**请求头:**
```
X-Confirm-Action: true
```

> ⚠️ 需要二次确认

**成功响应 (200):**
```json
{
  "message": "用户已删除"
}
```

**错误响应:**
- `400` - 不能删除管理员账户
- `403` - 权限不足

---

### POST /api/users/change-password

修改密码

**请求体:**
```json
{
  "oldPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

**成功响应 (200):**
```json
{
  "message": "密码修改成功"
}
```

---

### GET /api/users/audit-logs

获取审计日志

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 ID（可选） |
| action | string | 操作类型（可选） |
| startDate | string | 开始日期 ISO 格式 |
| endDate | string | 结束日期 ISO 格式 |
| page | number | 页码 |
| limit | number | 每页数量 |

**成功响应 (200):**
```json
[
  {
    "id": "log-1",
    "userId": "user-1",
    "action": "login",
    "resource": "auth",
    "details": "User logged in",
    "ip": "127.0.0.1",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-20T15:30:00.000Z"
  }
]
```

---

## 配置 API

### GET /api/config

获取所有配置

**成功响应 (200):**
```json
{
  "appName": "OpenClaw",
  "port": 3000,
  "debug": false,
  "model": "default",
  "authEnabled": true,
  "sessionTimeout": 3600
}
```

---

### GET /api/config/:key

获取单个配置项

**路径参数:**
- `key` - 配置键名

**成功响应 (200):**
```json
"OpenClaw"
```

---

### PUT /api/config/:key

更新配置

**路径参数:**
- `key` - 配置键名（使用 `all` 更新整个配置）

**请求体:**
```json
{
  "value": "NewAppName"
}
```

**成功响应 (200):**
```json
{
  "message": "配置已保存"
}
```

---

### POST /api/config/reload

热重载配置

**成功响应 (200):**
```json
{
  "message": "配置已重载"
}
```

---

### GET /api/config/backup

备份配置（下载 JSON 文件）

**响应:**
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename=config-backup-{timestamp}.json`

---

## 文件 API

### GET /api/files

列出文件列表

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 目录路径，默认 `/` |

**成功响应 (200):**
```json
[
  {
    "name": "config.json",
    "path": "/config.json",
    "type": "file",
    "size": 1024,
    "modified": "2024-01-20T10:00:00.000Z"
  },
  {
    "name": "workspace",
    "path": "/workspace",
    "type": "directory",
    "size": 0,
    "modified": "2024-01-20T09:00:00.000Z"
  }
]
```

---

### GET /api/files/read

读取文件内容

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 文件路径 |

**成功响应 (200):**
```json
"file content here..."
```

---

### PUT /api/files/write

写入文件

**请求体:**
```json
{
  "path": "/test.txt",
  "content": "Hello World"
}
```

**成功响应 (200):**
```json
{
  "message": "文件已保存"
}
```

---

### POST /api/files/upload

上传文件

**请求:**
- Content-Type: `multipart/form-data`
- 字段: `file` (文件)
- 查询参数: `path` (目标目录)

**成功响应 (200):**
```json
{
  "message": "文件已上传"
}
```

**限制:**
- 最大文件大小: 100MB

---

### GET /api/files/download

下载文件

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 文件/目录路径 |

**响应:**
- 文件: 直接下载
- 目录: 打包为 ZIP 下载

---

### DELETE /api/files

删除文件/目录

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 文件/目录路径 |

**成功响应 (200):**
```json
{
  "message": "文件已删除"
}
```

---

### PUT /api/files/move

移动/重命名文件

**请求体:**
```json
{
  "oldPath": "/old.txt",
  "newPath": "/new.txt"
}
```

---

### POST /api/files/mkdir

创建目录

**请求体:**
```json
{
  "path": "/new-folder"
}
```

---

## 技能 API

### GET /api/skills

获取技能市场列表

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| category | string | 分类过滤 |
| search | string | 搜索关键词 |

**成功响应 (200):**
```json
[
  {
    "id": "weather",
    "name": "Weather",
    "nameZh": "天气查询",
    "description": "Get real-time weather",
    "descriptionZh": "查询实时天气信息",
    "author": "openclaw",
    "version": "1.0.0",
    "category": "utilities",
    "tags": ["weather", "forecast"],
    "rating": 4.5,
    "downloads": 1500,
    "installed": false,
    "enabled": true,
    "icon": "🌤️"
  }
]
```

---

### GET /api/skills/categories

获取技能分类

**成功响应 (200):**
```json
[
  {
    "id": "ai",
    "name": "AI & ML",
    "nameZh": "人工智能",
    "icon": "🤖",
    "count": 10
  }
]
```

---

### GET /api/skills/installed

获取已安装技能

**成功响应 (200):**
```json
[
  {
    "id": "weather",
    "name": "Weather",
    "nameZh": "天气查询",
    "description": "Get real-time weather",
    "version": "1.0.0",
    "installed": true,
    "enabled": true
  }
]
```

---

### POST /api/skills/install/:skillId

安装技能

**路径参数:**
- `skillId` - 技能 ID

**权限:** 需要管理员权限

**成功响应 (200):**
```json
{
  "message": "技能安装成功"
}
```

---

### DELETE /api/skills/:skillId

卸载技能

**权限:** 需要管理员权限

**成功响应 (200):**
```json
{
  "message": "技能已卸载"
}
```

---

### PUT /api/skills/:skillId/toggle

启用/禁用技能

**请求体:**
```json
{
  "enabled": false
}
```

---

### PUT /api/skills/:skillId/config

配置技能

**请求体:**
```json
{
  "apiKey": "your-api-key",
  "timeout": 30
}
```

---

## Agent API

### GET /api/agents

获取 Agent 列表

**成功响应 (200):**
```json
[
  {
    "id": "agent-main",
    "name": "主 Agent",
    "status": "running",
    "pid": 12345,
    "model": "gpt-4",
    "skills": ["weather", "translator"],
    "uptime": 3600,
    "memoryUsage": 256,
    "cpuUsage": 15,
    "lastActive": "2024-01-20T16:00:00.000Z"
  }
]
```

**状态说明:**
- `running` - 运行中
- `stopped` - 已停止
- `error` - 错误

---

### GET /api/agents/:agentId

获取单个 Agent 详情

---

### POST /api/agents/:agentId/start

启动 Agent

**权限:** 需要管理员权限

**成功响应 (200):**
```json
{
  "message": "Agent 启动中..."
}
```

---

### POST /api/agents/:agentId/stop

停止 Agent

**权限:** 需要管理员权限

---

### POST /api/agents/:agentId/restart

重启 Agent

**权限:** 需要管理员权限

---

### GET /api/agents/:agentId/logs

获取 Agent 日志

**查询参数:**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 100 | 日志行数 |

**成功响应 (200):**
```json
{
  "logs": [
    "[2024-01-20 16:00:00] [INFO] Agent started",
    "[2024-01-20 16:00:01] [INFO] Loading skills..."
  ]
}
```

---

### POST /api/agents/:agentId/chat

与 Agent 对话

**请求体:**
```json
{
  "message": "今天天气怎么样？"
}
```

**成功响应 (200):**
```json
{
  "response": "抱歉，我需要天气技能才能查询天气信息。"
}
```

---

### GET /api/agents/:agentId/stats

获取 Agent 统计信息

**成功响应 (200):**
```json
{
  "id": "agent-main",
  "status": "running",
  "uptime": 3600,
  "memoryUsage": 256,
  "cpuUsage": 15,
  "requestCount": 150,
  "errorCount": 2,
  "avgResponseTime": 350
}
```

---

## 监控 API

### GET /api/monitor/system

获取系统信息

**成功响应 (200):**
```json
{
  "cpu": 25,
  "memory": 60,
  "diskUsed": 50000000000,
  "diskTotal": 100000000000,
  "version": "1.0.0",
  "nodeVersion": "v18.19.0",
  "uptime": "5天 12小时 30分钟",
  "platform": "Ubuntu 22.04.3 LTS",
  "cpuInfo": "Intel(R) Core(TM) i7-10700K",
  "totalMemory": "32 GB"
}
```

---

### GET /api/monitor/processes

获取进程列表

**成功响应 (200):**
```json
[
  {
    "pid": 12345,
    "name": "node",
    "cpu": 15.5,
    "memory": 8.2,
    "status": "running"
  }
]
```

---

### GET /api/monitor/logs

获取系统日志

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| level | string | 日志级别：debug/info/warn/error |
| search | string | 搜索关键词 |
| limit | number | 返回数量，默认 100 |

**成功响应 (200):**
```json
{
  "logs": [
    "[2024-01-20 16:00:00] [INFO] Server started on port 3001"
  ],
  "total": 50
}
```

---

### POST /api/monitor/errors

接收前端错误上报

**请求体:**
```json
{
  "id": "error-1",
  "message": "Uncaught TypeError",
  "stack": "Error at line 10...",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "component": "Dashboard"
}
```

---

## WebSocket 事件

### 连接

```javascript
const socket = io('http://localhost:3001')
```

### 客户端事件

| 事件 | 说明 |
|------|------|
| `subscribe:logs` | 订阅实时日志 |
| `unsubscribe:logs` | 取消订阅日志 |
| `subscribe:agents` | 订阅 Agent 状态 |
| `unsubscribe:agents` | 取消订阅 Agent |

### 服务端事件

| 事件 | 数据 | 说明 |
|------|------|------|
| `log` | `{ level, message, timestamp }` | 实时日志推送 |
| `agent:status` | `AgentInfo` | Agent 状态更新 |
| `agent:started` | `{ agentId }` | Agent 已启动 |
| `agent:stopped` | `{ agentId }` | Agent 已停止 |
| `agent:error` | `{ agentId, error }` | Agent 错误 |

### 示例

```javascript
// 订阅实时日志
socket.emit('subscribe:logs')

socket.on('log', (data) => {
  console.log(`[${data.level}] ${data.message}`)
})

// 订阅 Agent 状态
socket.emit('subscribe:agents')

socket.on('agent:status', (agent) => {
  console.log(`Agent ${agent.name}: ${agent.status}`)
})
```

---

## 错误响应

所有错误响应格式：

```json
{
  "error": "错误信息描述"
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 / Token 无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 认证说明

### JWT Token

除本地访问外，所有 API 请求需要在 Header 中携带 Token：

```
Authorization: Bearer <token>
```

### 本地免认证

来自以下地址的请求自动跳过认证：
- `127.0.0.1`
- `::1`
- `::ffff:127.0.0.1`

### 角色权限

| 角色 | 权限 |
|------|------|
| `admin` | 所有操作 |
| `user` | 查看 + 部分操作 |
| `viewer` | 仅查看 |

### 速率限制

- 普通 API: 100 次 / 15 分钟
- 敏感操作: 10 次 / 小时

---

## 健康检查

### GET /api/health

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-20T16:00:00.000Z",
  "openclaw": {
    "version": "1.0.0",
    "installed": true
  }
}
```
