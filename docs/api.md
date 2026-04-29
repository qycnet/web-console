# API 文档

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

**响应:**
```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-1",
    "username": "admin",
    "role": "admin"
  }
}
```

### POST /api/auth/logout
用户登出

### GET /api/auth/me
获取当前用户信息

---

## 配置 API

### GET /api/config
获取所有配置

### GET /api/config/:key
获取单个配置项

### PUT /api/config/:key
更新配置

### POST /api/config/reload
热重载配置

### GET /api/config/backup
备份配置

---

## 文件 API

### GET /api/files?path=/
列出文件列表

### GET /api/files/read?path=/file.txt
读取文件内容

### PUT /api/files/write
写入文件

### POST /api/files/upload
上传文件

### GET /api/files/download?path=/file.txt
下载文件

### DELETE /api/files?path=/file.txt
删除文件

### PUT /api/files/move
移动/重命名文件

### POST /api/files/mkdir
创建目录

---

## 技能 API

### GET /api/skills
获取技能市场列表

### GET /api/skills/installed
获取已安装技能

### POST /api/skills/install/:skillId
安装技能

### DELETE /api/skills/:skillId
卸载技能

### PUT /api/skills/:skillId/config
配置技能

---

## Agent API

### GET /api/agents
获取 Agent 列表

### GET /api/agents/:agentId
获取单个 Agent

### POST /api/agents/:agentId/start
启动 Agent

### POST /api/agents/:agentId/stop
停止 Agent

### POST /api/agents/:agentId/restart
重启 Agent

---

## 监控 API

### GET /api/monitor/system
获取系统信息

### GET /api/monitor/processes
获取进程列表

### GET /api/monitor/logs
获取日志
