# 部署文档

## 环境要求

- Node.js 18.0.0+
- npm 8.0.0+
- 至少 1GB 可用内存
- 至少 2GB 可用磁盘空间

## 安装方式

### 方式一：源码安装

```bash
# 克隆项目
git clone https://github.com/qycnet/web-console.git
cd web-console

# 安装依赖
npm install

# 构建前端
npm run build

# 启动服务
npm start
```

### 方式二：全局安装

```bash
# 安装
npm install -g openclaw-web-console

# 启动
openclaw-console
```

## 配置

### 环境变量

复制 `.env.example` 为 `.env` 并修改：

```bash
cp .env.example .env
```

主要配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3001 |
| CLIENT_URL | 客户端地址 | http://localhost:3000 |
| JWT_SECRET | JWT 密钥 | - |
| OPENCLAW_DIR | OpenClaw 目录 | ~/.openclaw |

## 运行模式

### 开发模式

```bash
npm run dev
```

前后端同时启动，支持热重载。

### 生产模式

```bash
# 构建
npm run build

# 启动
npm start
```

### PM2 守护进程

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start npm --name "openclaw-console" -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs openclaw-console
```

## 反向代理

### Nginx 配置

```nginx
server {
    listen 80;
    server_name console.openclaw.ai;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 安全建议

1. **生产环境必须修改 JWT_SECRET**
2. 启用 HTTPS
3. 配置防火墙规则
4. 定期备份数据库
5. 监控系统资源使用

## 故障排查

### 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3001

# 终止进程
kill -9 <PID>
```

### 数据库错误

```bash
# 删除数据库重新初始化
rm ~/.openclaw/web-console.db
```

### 日志查看

```bash
# 查看服务日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log
```
