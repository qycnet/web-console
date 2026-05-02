# OpenClaw Web Console API 文档

## 目录

- [认证 API](#认证-api)
- [用户 API](#用户-api)
- [配置 API](#配置-api)
- [文件 API](#文件-api)
- [技能 API](#技能-api)
- [Agent API](#agent-api)
- [告警 API](#告警-api)
- [监控 API](#监控-api)
- [WebSocket 事件](#websocket-事件)
- [错误响应](#错误响应)
- [认证说明](#认证说明)

## 认证 API

### POST /api/auth/login

用户登录（使用严格速率限制：每小时最多 10 次）

**请求体：**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**成功响应 (200)：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "needsPasswordChange": true,
  "user": {
    "id": "user-1",
    "username": "admin",
    "role": "admin"
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT Token，有效期 7 天 |
| needsPasswordChange | boolean | 是否需要强制修改密码（管理员首次登录为 true） |
| user | object | 用户基本信息 |

**错误响应：**
- `400` - 用户名和密码必填
- `401` - 用户名或密码错误
- `429` - 请求过于频繁（速率限制）

> ⚠️ 管理员首次登录时 `needsPasswordChange` 为 `true`，客户端应引导用户修改密码。
>
> 🔐 所有后续 API 请求需在 Header 中携带 Token：`Authorization: Bearer <token>`

---

### POST /api/auth/logout

用户登出

**成功响应 (200)：**
```json
{
  "message": "已登出"
}
```

---

### GET /api/auth/me

获取当前用户信息

**请求头：** `Authorization: Bearer <token>`

**成功响应 (200)：**
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

**错误响应：** `401` - 未授权 / Token 无效

---

## 用户 API

> ⚠️ 所有用户 API 需要管理员权限

### GET /api/users

获取用户列表

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量 |

**成功响应 (200)：**
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

### POST /api/users

创建用户

**请求体：**
```json
{
  "username": "newuser",
  "password": "password123",
  "email": "user@example.com",
  "role": "user"
}
```

**字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✅ | 用户名（唯一） |
| password | string | ✅ | 密码 |
| email | string | ❌ | 邮箱 |
| role | string | ❌ | 角色：admin/user/viewer，默认 user |

**成功响应 (201)：**
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

**错误响应：** `400` - 用户名已存在 / 参数错误

### PUT /api/users/:userId

更新用户信息

**请求体：** 可包含 email, role, status, password

**权限：**
- 管理员可修改所有字段
- 普通用户只能修改自己的 email 和 password

**成功响应 (200)：**
```json
{
  "id": "user-2",
  "username": "newuser",
  "email": "newemail@example.com",
  "role": "admin",
  "status": "active"
}
```

### DELETE /api/users/:userId

删除用户。需要 `X-Confirm-Action: true` 请求头（二次确认）。

**错误响应：**
- `400` - 不能删除管理员账户
- `403` - 权限不足

### POST /api/users/change-password

修改密码

**请求体：**
```json
{
  "oldPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

**成功响应 (200)：** `{"message": "密码修改成功"}`

### GET /api/users/audit-logs

获取审计日志

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 ID（可选） |
| action | string | 操作类型（可选） |
| startDate | string | 开始日期 ISO |
| endDate | string | 结束日期 ISO |
| page | number | 页码 |
| limit | number | 每页数量 |

**成功响应 (200)：**
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

**成功响应 (200)：**
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

### GET /api/config/:key

获取单个配置项

**路径参数：** `key` - 配置键名

**成功响应 (200)：** `"OpenClaw"`

### PUT /api/config/:key

更新配置（key 为 all 时替换整个配置）

**请求体：** `{"value": "NewAppName"}`

**成功响应 (200)：** `{"message": "配置已保存"}`

### POST /api/config/reload

热重载配置

**成功响应 (200)：** `{"message": "配置已重载"}`

### GET /api/config/backup

备份配置（下载 JSON 文件）

**响应头：**
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename=config-backup-{timestamp}.json`

---

## 文件 API

### GET /api/files?path=/

列出文件列表

**查询参数：** `path` - 目录路径，默认 `/`

**成功响应 (200)：**
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

### GET /api/files/read?path=/

读取文件内容

**查询参数：** `path` - 文件路径

**成功响应 (200)：** `"file content here..."`

### PUT /api/files/write

写入文件

**请求体：**
```json
{
  "path": "/test.txt",
  "content": "Hello World"
}
```

**成功响应 (200)：** `{"message": "文件已保存"}`

### POST /api/files/upload

上传单个文件（multipart/form-data，最大 100MB）

**字段：** `file`（文件），**查询参数：** `path`（目标目录）

### POST /api/files/batch-upload

批量上传文件（multipart/form-data，最多 50 个文件）

**字段：** `files[]`（多个文件），**查询参数：** `path`（目标目录）

**成功响应 (200)：**
```json
{
  "message": "上传完成：5/5 个文件",
  "results": [
    { "name": "file1.txt", "size": 1024, "status": "success" },
    { "name": "file2.txt", "size": 2048, "status": "success" }
  ]
}
```

### POST /api/files/chunk/init

大文件断点续传 — 初始化上传会话（5MB 分片）

**请求体：**
```json
{
  "filename": "large-file.zip",
  "fileSize": 104857600,
  "targetDir": "/uploads",
  "mimeType": "application/zip"
}
```

**成功响应 (200)：**
```json
{
  "uploadId": "1710498600-a1b2c3",
  "chunkSize": 5242880,
  "totalChunks": 20,
  "message": "分片上传会话已创建，共 20 个分片"
}
```

### POST /api/files/chunk/upload

上传单个分片（multipart/form-data）

**字段：** `file`（分片二进制）、`uploadId`（会话 ID，字符串）、`chunkIndex`（分片序号，数字）

**成功响应 (200)：**
```json
{
  "uploadId": "1710498600-a1b2c3",
  "chunkIndex": 0,
  "receivedChunks": 5,
  "totalChunks": 20,
  "progress": 25,
  "complete": false
}
```

### POST /api/files/chunk/merge

合并已上传的分片

**请求体：** `{"uploadId": "1710498600-a1b2c3"}`

**成功响应 (200)：**
```json
{
  "filename": "large-file.zip",
  "size": 104857600,
  "path": "/uploads/large-file.zip",
  "message": "文件上传完成"
}
```

### GET /api/files/chunk/status/:uploadId

查询上传进度

**成功响应 (200)：**
```json
{
  "uploadId": "1710498600-a1b2c3",
  "filename": "large-file.zip",
  "totalChunks": 20,
  "receivedChunks": [0, 1, 2, 3, 4],
  "progress": 25,
  "complete": false,
  "missingChunks": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
}
```

### DELETE /api/files/chunk/cancel/:uploadId

取消上传并清理临时分片

### GET /api/files/download?path=/

下载文件（目录自动打包为 ZIP）

### DELETE /api/files?path=/

删除文件/目录

**成功响应 (200)：** `{"message": "文件已删除"}`

### PUT /api/files/move

移动/重命名文件

**请求体：**
```json
{
  "oldPath": "/old.txt",
  "newPath": "/new.txt"
}
```

### POST /api/files/mkdir

创建目录

**请求体：** `{"path": "/new-folder"}`

---

## 技能 API

### GET /api/skills

获取技能市场列表

**查询参数：** `category`（分类过滤）、`search`（搜索关键词）

**成功响应 (200)：**
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
    "icon": "🌤"
  }
]
```

### GET /api/skills/categories

获取技能分类

**成功响应 (200)：**
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

### GET /api/skills/installed

获取已安装技能

### POST /api/skills/install/:skillId

安装技能（管理员权限）

**成功响应 (200)：** `{"message": "技能安装成功"}`

### DELETE /api/skills/:skillId

卸载技能（管理员权限）

**成功响应 (200)：** `{"message": "技能已卸载"}`

### PUT /api/skills/:skillId/toggle

启用/禁用技能

**请求体：** `{"enabled": false}`

### PUT /api/skills/:skillId/config

配置技能

**请求体：**
```json
{
  "apiKey": "your-api-key",
  "timeout": 30
}
```

---

## Agent API

### GET /api/agents

获取 Agent 列表（从 CLI / 状态文件 / 配置文件三级获取）

**成功响应 (200)：**
```json
[
  {
    "id": "agent-main",
    "name": "主 Agent",
    "status": "running",
    "pid": 12345,
    "model": "gpt-4",
    "provider": "deepseek",
    "temperature": 0.7,
    "maxTokens": 4096,
    "avatar": "🎭",
    "theme": "blue",
    "skills": ["weather", "translator"],
    "uptime": 3600,
    "memoryUsage": 256,
    "cpuUsage": 15,
    "lastActive": "2024-01-20T16:00:00.000Z",
    "createdAt": "2024-01-20T10:00:00.000Z",
    "updatedAt": "2024-01-20T16:00:00.000Z",
    "description": "幽默脱口秀演员",
    "persona": "你是张三，一个幽默的脱口秀演员..."
  }
]
```

**状态说明：** `running` - 运行中, `stopped` - 已停止, `error` - 错误

### GET /api/agents/models

获取可用模型列表（从 OpenClaw 配置动态读取）

**成功响应 (200)：**
```json
[
  {
    "id": "LLM_DeepSeekV4_Thinking",
    "name": "LLM_DeepSeekV4_Thinking",
    "provider": "xiaoyiprovider"
  }
]
```

### POST /api/agents

创建新 Agent。自动写入 workspace 人设文件（AGENTS.md / IDENTITY.md），调用 openclaw agents add 注册，记录到 registry.json。

**请求体：**
```json
{
  "name": "my-agent",
  "model": "xiaoyiprovider/LLM_DeepSeekV4_Thinking",
  "persona": "你是张三，一个幽默的脱口秀演员...",
  "workspace": "/path/to/workspace",
  "provider": "deepseek",
  "temperature": 0.7,
  "maxTokens": 4096,
  "description": "幽默脱口秀演员",
  "avatar": "🎭",
  "theme": "blue"
}
```

**成功响应 (201)：**
```json
{
  "id": "my-agent",
  "name": "my-agent"
}
```

**权限：** admin

### GET /api/agents/:agentId

获取单个 Agent 详情

### POST /api/agents/:agentId/start

启动 Agent（管理员权限）

### POST /api/agents/:agentId/stop

停止 Agent（管理员权限）

### POST /api/agents/:agentId/restart

重启 Agent（管理员权限）

### GET /api/agents/:agentId/logs

获取 Agent 日志

**查询参数：** `limit` - 日志行数，默认 100

**成功响应 (200)：**
```json
{
  "logs": [
    "[2024-01-20 16:00:00] [INFO] Agent started",
    "[2024-01-20 16:00:01] [INFO] Loading skills..."
  ]
}
```

### POST /api/agents/:agentId/chat

与 Agent 对话（旧接口，保留兼容）。使用 openclaw agent CLI 模式。

**请求体：** `{"message": "今天天气怎么样？"}`

**成功响应 (200)：** `{"response": "...Agent回复..."}`

**建议改用** `GET /api/agents/:agentId/chat/stream`（流式接口）以提升体验。

### PUT /api/agents/:agentId

更新 Agent 信息。编辑模型直接改 config.json 的 agents.list，编辑名称/Emoji/主题调用 set-identity，编辑人设写入 workspace 文件，**新增支持 Provider/温度/Max Tokens/描述等字段**。

**请求体：**
```json
{
  "name": "新名称",
  "model": "xiaoyiprovider/LLM_DeepSeekV4_Thinking",
  "persona": "新的人设内容...",
  "emoji": "🦞",
  "theme": "blue",
  "avatar": "avatars/my-agent.png",
  "provider": "deepseek",
  "temperature": 0.8,
  "maxTokens": 8192,
  "description": "更新后的描述"
}
```

**成功响应 (200)：** `{"message": "Agent 已更新"}`

**权限：** admin

### GET /api/agents/:agentId/chat/stream

**流式对话（新）** — SSE (text/event-stream) 流式返回，直调 LLM API，代替原来的 CLI 模式。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | ✅ | 用户消息内容 |
| sessionId | string | ❌ | 会话 ID（留空自动创建新会话） |
| token | string | 🔑 | **JWT Token（EventSource 无法携带 Authorization header，作为 query 参数传入）** |

> ⚠️ **鉴权说明：** 浏览器 `EventSource` API 无法设置自定义请求头（包括 `Authorization: Bearer <token>`），
> 因此该端点从 URL query 参数 `token` 获取 JWT Token。前端 SDK 已自动处理。`EventSource.onerror` 触发 401 时请检查 token 是否有效。`

**响应格式：** text/event-stream

```text
data: {"type":"session","sessionId":"uuid-xxx"}

data: {"token":"第"}

data: {"token":"一个"}

data: {"token":"token"}

data: [DONE]
```

**事件类型：**
- `type: session` — 返回当前会话 ID（用于后续继续对话）
- `token` — 单个 Token（字）
- `[DONE]` — 流结束标志

**说明：**
- 首字响应时间 < 1 秒
- 对话使用 Agent 真实配置（provider/temperature/maxTokens）
- 消息自动持久化到 SQLite
- 第一条消息自动生成会话标题

### GET /api/agents/:agentId/stats

获取 Agent 统计信息。**从 SQLite 获取真实数据**（不再基于日志关键词统计）。

**成功响应 (200)：**
```json
{
  "id": "agent-main",
  "status": "running",
  "uptime": 3600,
  "memoryUsage": 256,
  "cpuUsage": 15,
  "requestCount": 150,
  "sessionCount": 12,
  "errorCount": 2,
  "totalMessages": 320,
  "totalTokens": 48000,
  "avgResponseTime": 350
}
```

**新增字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionCount | number | SQLite 中的真实会话数量 |
| totalMessages | number | 所有会话的总消息数 |
| totalTokens | number | 所有消息的总 token 数 |

### GET /api/agents/:agentId/sessions

获取 Agent 的会话列表（按更新时间倒序）。

**查询参数：** `limit` - 返回数量，默认 50

**成功响应 (200)：**
```json
[
  {
    "id": "session-uuid",
    "agent_id": "agent-main",
    "title": "今天天气怎么样？",
    "created_at": "2024-01-20T10:00:00.000Z",
    "updated_at": "2024-01-20T10:05:00.000Z"
  }
]
```

### GET /api/agents/:agentId/sessions/:sessionId

获取会话详情（包含消息列表）。

**成功响应 (200)：**
```json
{
  "session": {
    "id": "session-uuid",
    "agent_id": "agent-main",
    "title": "今天天气怎么样？",
    "created_at": "2024-01-20T10:00:00.000Z",
    "updated_at": "2024-01-20T10:05:00.000Z"
  },
  "messages": [
    {
      "id": 1,
      "session_id": "session-uuid",
      "role": "user",
      "content": "今天天气怎么样？",
      "tokens": 0,
      "created_at": "2024-01-20T10:00:00.000Z"
    },
    {
      "id": 2,
      "session_id": "session-uuid",
      "role": "assistant",
      "content": "今天天气很好...",
      "tokens": 120,
      "created_at": "2024-01-20T10:05:00.000Z"
    }
  ]
}
```

### POST /api/agents/:agentId/sessions

新建会话。

**请求体：** `{"title": "可选标题"}`

**成功响应 (200)：** `{"id": "new-session-uuid"}`

### DELETE /api/agents/:agentId/sessions/:sessionId

删除会话（级联删除所有消息）。

**成功响应 (200)：** `{"message": "会话已删除"}`

### GET /api/agents/:agentId/sessions/:sessionId/search

搜索会话中的消息。

**查询参数：** `keyword` - 搜索关键词（LIKE %匹配）

**成功响应 (200)：**
```json
{
  "messages": [...],
  "count": 3
}
```

### GET /api/agents/:agentId/sessions/:sessionId/export

导出会话为 JSON 格式。

**成功响应 (200)：**
```json
{
  "session": {
    "id": "session-uuid",
    "agentId": "agent-main",
    "title": "对话标题",
    "createdAt": "2024-01-20T10:00:00.000Z",
    "updatedAt": "2024-01-20T10:05:00.000Z"
  },
  "messages": [...],
  "exportedAt": "2024-01-20T12:00:00.000Z"
}
```

### DELETE /api/agents/:agentId

删除 Agent。调用 openclaw agents delete，清理 workspace 目录，移除 registry 记录。

**成功响应 (200)：** `{"message": "Agent 已删除"}`

**权限：** admin

---

## 告警 API

### GET /api/alerts/rules

获取告警规则列表

**成功响应 (200)：**
```json
[
  {
    "id": "rule_1710498600_a1b2c3",
    "name": "CPU 过高告警",
    "description": "CPU 使用率超过 80%",
    "metric": "cpu",
    "condition": "gt",
    "threshold": 80,
    "duration": 30,
    "severity": "warning",
    "enabled": true,
    "channels": ["console", "log"],
    "cooldown": 300,
    "createdAt": "2024-01-20T10:00:00.000Z",
    "updatedAt": "2024-01-20T10:00:00.000Z"
  }
]
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 规则唯一标识 |
| name | string | 规则名称 |
| metric | string | 指标：cpu/memory/disk/agent_down/skill_error/log_error/rate_limit |
| condition | string | 条件：gt(>)/lt(<)/eq(==)/contains/regex |
| threshold | number/string | 阈值 |
| duration | number | 持续秒数（防抖动） |
| severity | string | 等级：info/warning/critical |
| cooldown | number | 冷却秒数（防告警风暴） |
| channels | string[] | 通知渠道 |

### POST /api/alerts/rules

创建告警规则

**请求体：**
```json
{
  "name": "CPU 过高告警",
  "description": "CPU 使用率超过 80%",
  "metric": "cpu",
  "condition": "gt",
  "threshold": 80,
  "duration": 30,
  "severity": "warning",
  "cooldown": 300
}
```

**成功响应 (201)：** 返回创建的规则对象

### PUT /api/alerts/rules/:id

更新告警规则（可部分更新）

### DELETE /api/alerts/rules/:id

删除告警规则

**成功响应 (200)：** `{"message": "Rule deleted"}`

### POST /api/alerts/rules/:id/toggle

启用/禁用告警规则

**请求体：** `{"enabled": false}`

### GET /api/alerts/events

获取告警事件列表

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 过滤：active/acknowledged/resolved |
| severity | string | 过滤：info/warning/critical |
| ruleId | string | 按规则过滤 |
| limit | number | 返回数量，默认 50 |
| offset | number | 偏移量 |
| startDate | string | 开始日期 ISO |
| endDate | string | 结束日期 ISO |

**成功响应 (200)：**
```json
{
  "events": [
    {
      "id": "alert_1710498600_x1y2z3",
      "ruleId": "rule_1710498600_a1b2c3",
      "ruleName": "CPU 过高告警",
      "severity": "warning",
      "status": "active",
      "message": "[WARNING] CPU 过高告警: 85 > 80",
      "details": {
        "metric": "cpu",
        "condition": "gt"
      },
      "value": 85,
      "threshold": 80,
      "triggeredAt": "2024-01-20T16:00:00.000Z"
    }
  ],
  "total": 15
}
```

### POST /api/alerts/events/:id/acknowledge

确认告警

**成功响应 (200)：**
```json
{
  "id": "alert_1710498600_x1y2z3",
  "status": "acknowledged",
  "acknowledgedAt": "2024-01-20T16:05:00.000Z",
  "acknowledgedBy": "admin"
}
```

### POST /api/alerts/events/:id/resolve

解决告警

### POST /api/alerts/evaluate

手动触发指标评估

**请求体：**
```json
{
  "cpu": 85,
  "memory": 70,
  "disk": 50
}
```

**成功响应 (200)：** `{"message": "Metrics evaluated"}`

### GET /api/alerts/stats

获取告警统计信息

**成功响应 (200)：**
```json
{
  "activeRules": 5,
  "enabledRules": 3,
  "activeAlerts": 2,
  "acknowledgedAlerts": 3,
  "criticalAlerts": 1,
  "totalEvents": 20
}
```

---

## 监控 API

### GET /api/monitor/system

获取系统信息

**成功响应 (200)：**
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

### GET /api/monitor/processes

获取进程列表

**成功响应 (200)：**
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

### GET /api/monitor/logs

获取系统日志

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| level | string | 日志级别：debug/info/warn/error |
| search | string | 搜索关键词 |
| limit | number | 返回数量，默认 100 |

**成功响应 (200)：**
```json
{
  "logs": [
    "[2024-01-20 16:00:00] [INFO] Server started on port 3001"
  ],
  "total": 50
}
```

### GET /api/monitor/network

获取网络流量信息（读取 /proc/net/dev 实时数据）

**成功响应 (200)：**
```json
[
  {
    "name": "eth0",
    "rxBytes": 1234567890,
    "rxPackets": 1000000,
    "rxErrors": 0,
    "rxDrop": 0,
    "txBytes": 987654321,
    "txPackets": 800000,
    "txErrors": 0,
    "txDrop": 0,
    "speed": "1000 Mbps"
  }
]
```

**响应说明：** 返回所有非 loopback 网络接口的收发统计，speed 字段需要 /sys/class/net/*/speed 支持

### POST /api/monitor/errors

接收前端错误上报

**请求体：**
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

### 连接认证

WebSocket 连接时需要在 `handshake.auth.token` 或 `handshake.query.token` 中携带 JWT Token：

```js
// 客户端连接示例
const socket = io('ws://localhost:3001', {
  auth: { token: 'your-jwt-token' }
})
```

未认证的连接将被拒绝（401）。

### 订阅事件

### 连接

```javascript
const socket = io('http://localhost:3001')
```

### 客户端事件（订阅）

| 事件 | 说明 |
|------|------|
| `subscribe:logs` | 订阅实时日志 |
| `unsubscribe:logs` | 取消订阅日志 |
| `subscribe:agents` | 订阅 Agent 状态 |
| `unsubscribe:agents` | 取消订阅 Agent |

### 服务端事件（推送）

| 事件 | 数据 | 说明 |
|------|------|------|
| `log` | `{ level, message, timestamp }` | 实时日志推送 |
| `agent:status` | AgentInfo | Agent 状态更新 |
| `agent:started` | `{ agentId }` | Agent 已启动 |
| `agent:stopped` | `{ agentId }` | Agent 已停止 |
| `agent:error` | `{ agentId, error }` | Agent 错误 |
| `alerts:new` | AlertEvent | 新告警事件 |
| `alerts:metrics` | `{ cpu, memory, disk, timestamp }` | 指标推送 |

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

// 订阅告警事件
socket.on('alerts:new', (event) => {
  console.log(`[${event.severity}] ${event.message}`)
})
```

---

## 错误响应

所有错误使用统一格式：

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

所有 API 请求需要在 Header 中携带 Token：

```
Authorization: Bearer <token>
```

### WebSocket 认证

WebSocket 连接需要在 handshake 中携带 Token：

```javascript
// 客户端示例
const socket = io('ws://localhost:3001', {
  auth: { token: 'your-jwt-token' }
})
```

未认证的连接将被拒绝。

### 角色权限

| 角色 | 权限 |
|------|------|
| admin | 所有操作 |
| user | 查看 + 部分操作 |
| viewer | 仅查看 |

### 强制修改密码

管理员首次使用默认密码登录时，API 返回 `needsPasswordChange: true`，客户端应引导用户修改密码。

### 速率限制

- 普通 API: 每个 IP 每 15 分钟最多 100 次
- 登录 API: 每个 IP 每小时最多 10 次（防暴力破解）

---

## 健康检查

### GET /api/health

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
