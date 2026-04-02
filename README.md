# ProofRead 后端服务 - 生产级账号密码验证与 Token 资源管理系统

## 📋 项目概述

本项目为生产级服务器端账号密码验证及 Token 资源额度管控系统，集成微信 Native 支付功能，实现完整的用户认证、Token 生命周期管理、支付回调处理全流程。

### 核心功能

✅ **账号密码验证**
- 支持手机号/邮箱账号格式
- SHA3-256 加盐哈希存储密码
- 防暴力破解机制（连续5次失败后锁定账号15分钟）
- 完整登录日志留存

✅ **Token 资源管理**
- 新用户自动赠送 10,000 免费 Token
- 实时精准扣减 Token（事务控制保证一致性）
- Token 余额前置校验，余额为0自动拦截请求
- Token 消费日志不可删除、可完全追溯

✅ **微信 Native 支付**
- 生成微信官方支付二维码（NATIVE 模式）
- 支付回调异步处理，签名验证防伪造
- 订单过期自动关闭（定时任务）
- 支付成功自动发放 Token，支付失败无扣费

✅ **业务风控**
- 防订单泛滥：同一用户5分钟内最多5个待支付订单
- 大额充值二次验证预留接口
- 防重复扣费、防重复发放 Token（接口幂等性）

✅ **数据安全**
- 所有敏感数据库操作使用事务控制
- HTTPS 加密传输
- 微信配置独立加密存储
- 数据库主从备份

## 🏗️ 项目结构

```
src/
├── config/              # 配置管理
│   └── redis.ts        # Redis 连接配置
├── controllers/         # 控制层（API 端点）
│   ├── auth.controller.ts
│   ├── token.controller.ts
│   └── payment.controller.ts
├── services/            # 业务逻辑层
│   ├── auth.service.ts          # 账号验证服务
│   ├── token.service.ts         # Token 管理服务
│   └── payment.service.ts       # 微信支付服务
├── models/              # 数据模型
├── middleware/          # 中间件
│   ├── auth.middleware.ts       # JWT 认证
│   └── error-handler.ts         # 错误处理
├── utils/               # 工具函数
│   ├── encryption.ts            # 加密解密
│   ├── validators.ts            # 参数校验
│   ├── constants.ts             # 常量定义
│   └── logger.ts                # 日志工具
├── jobs/                # 定时任务
│   └── order-expiry.job.ts      # 订单过期扫描
├── database/            # 数据库
│   ├── connection.ts            # 连接池管理
│   └── migrations.ts            # 数据库迁移
└── app.ts               # 应用入口
```

## 🚀 快速开始

### 1. 环境准备

**必要条件：**
- Node.js >= 16.0.0
- PostgreSQL >= 12
- Redis >= 6.0

**建议环境：**
- Ubuntu 20.04 LTS / CentOS 7
- Docker & Docker Compose（用于容器化部署）

### 2. 项目初始化

```bash
# 克隆项目
cd ProofRead-Backend

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 填写实际配置（数据库、Redis、微信支付等）
nano .env
```

### 3. 配置文件（.env）

**数据库配置：**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proofread_db
DB_USER=proofread_user
DB_PASSWORD=your_secure_password
DB_SSL=true
DB_POOL_MIN=2
DB_POOL_MAX=10
```

**Redis 配置：**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

**JWT 配置：**
```env
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRATION=7d
```

**微信支付配置（关键）：**
```env
WECHAT_MCHID=1234567890              # 商户号
WECHAT_APPID=wx1234567890abcdef      # 应用ID
WECHAT_API_KEY=your_api_key_v3_or_v2 # API 密钥
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat-notify
```

**业务规则配置：**
```env
FREE_TOKEN_QUOTA=10000              # 新用户免费额度
TOKEN_CONVERSION_RATE=10000         # 充值比例：1元 = 10000Token
TOKEN_PER_REQUEST=1                 # 单次请求扣减 Token 数
LOGIN_FAILURE_THRESHOLD=5           # 登录失败锁定阈值
ACCOUNT_LOCK_DURATION_MINUTES=15    # 账号锁定时长
PAYMENT_ORDER_EXPIRY_MINUTES=15     # 支付订单有效期
```

### 4. 数据库初始化

```bash
# 运行迁移脚本创建所有表
npm run migrate

# 查看数据库是否成功创建
psql -h localhost -U proofread_user -d proofread_db -c "\dt"
```

### 5. 启动服务

**开发环境：**
```bash
npm run dev
# 服务在 http://localhost:3001
```

**生产环境：**
```bash
npm run build
npm start
```

## 📡 API 接口文档

### 认证相关

#### 用户注册
```
POST /api/auth/register
Content-Type: application/json

{
  "account": "13800000000",     // 或邮箱: user@example.com
  "password": "SecurePass123"   // 至少8位，包含大小写字母+数字
}

Response (Success):
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "userId": 1,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenBalance": 10000
  },
  "timestamp": 1705592735000
}

Response (Error):
{
  "code": 1001,
  "message": "账号格式不正确",
  "timestamp": 1705592735000
}
```

#### 用户登录
```
POST /api/auth/login
Content-Type: application/json

{
  "account": "13800000000",
  "password": "SecurePass123"
}

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "userId": 1,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenBalance": 10000
  },
  "timestamp": 1705592735000
}
```

### Token 管理

#### 查询 Token 余额
```
GET /api/token/balance
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "availableBalance": 10000,
    "totalUsed": 0,
    "totalRecharged": 0
  },
  "timestamp": 1705592735000
}
```

#### 查询 Token 消费记录
```
GET /api/token/logs?pageNum=1&pageSize=20
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "items": [
      {
        "id": 1,
        "deductionAmount": 1,
        "remainingBalance": 9999,
        "businessType": "document_proofread",
        "createdAt": "2024-01-18T10:30:00Z"
      }
    ],
    "total": 1,
    "pageSize": 20,
    "pageNum": 1
  },
  "timestamp": 1705592735000
}
```

### 支付相关

#### 生成充值订单
```
POST /api/payment/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 99.99        // 充值金额（元）
}

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "orderNumber": "RECH202401181030000000ABC123",
    "codeUrl": "weixin://wxpay/bizpayurl?pr=...",
    "expiresIn": 900       // 有效期 15 分钟（秒）
  },
  "timestamp": 1705592735000
}
```

#### 查询支付订单状态
```
GET /api/payment/order-status?orderNumber=RECH202401181030000000ABC123
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "status": "pending",         // pending / success / closed / failed
    "amount": 99.99,
    "tokenAmount": 999900,
    "expiresAt": "2024-01-18T10:45:00Z"
  },
  "timestamp": 1705592735000
}
```

#### 取消支付订单
```
POST /api/payment/cancel-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderNumber": "RECH202401181030000000ABC123"
}

Response:
{
  "code": 0,
  "message": "操作成功",
  "timestamp": 1705592735000
}
```

#### 查询充值记录
```
GET /api/payment/recharge-history?pageNum=1&pageSize=20
Authorization: Bearer <token>

Response:
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "records": [
      {
        "orderNumber": "RECH202401181030000000ABC123",
        "rechargeAmount": 99.99,
        "tokenAmount": 999900,
        "orderStatus": "success",
        "wechatTransactionId": "4200001234567890",
        "paidAt": "2024-01-18T10:32:00Z"
      }
    ],
    "total": 5,
    "pageSize": 20,
    "pageNum": 1
  },
  "timestamp": 1705592735000
}
```

### 微信支付回调

```
POST /api/payment/wechat-notify
Content-Type: application/xml
X-Wechat-Signature: 签名

<xml>
  <return_code><![CDATA[SUCCESS]]></return_code>
  <result_code><![CDATA[SUCCESS]]></result_code>
  <out_trade_no><![CDATA[RECH202401181030000000ABC123]]></out_trade_no>
  <total_fee>9999</total_fee>
  <transaction_id><![CDATA[4200001234567890]]></transaction_id>
  <sign><![CDATA[123456789]]></sign>
</xml>

Response (Success):
<xml>
  <return_code><![CDATA[SUCCESS]]></return_code>
  <return_msg><![CDATA[OK]]></return_msg>
</xml>

Response (Failure):
<xml>
  <return_code><![CDATA[FAIL]]></return_code>
  <return_msg><![CDATA[Signature verification failed]]></return_msg>
</xml>
```

## 🐳 Docker 部署

### 创建 Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 编译 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["npm", "start"]
```

### 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${DB_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_HOST: redis
    ports:
      - "3001:3001"
    restart: always

volumes:
  postgres_data:
```

### 启动容器

```bash
# 构建镜像
docker build -t proofread-backend:latest .

# 使用 docker-compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
```

## 🔒 安全建议

### 生产环境必须

1. **启用 HTTPS**
   - 申请 SSL 证书（Let's Encrypt 免费）
   - 配置 Nginx/Apache 反向代理

2. **数据库安全**
   ```sql
   -- 修改默认密码
   ALTER USER proofread_user WITH PASSWORD 'strong_password_here';
   
   -- 限制连接
   -- pg_hba.conf: 只允许应用服务器 IP 连接
   ```

3. **Redis 安全**
   ```bash
   # redis.conf 配置
   bind 127.0.0.1        # 只监听本地或内网
   requirepass password   # 设置连接密码
   ```

4. **应用程序**
   - 定期更新依赖（npm audit）
   - 启用速率限制防暴力破解
   - 记录所有关键操作日志
   - 定期备份数据库

5. **微信支付配置**
   ```env
   # 使用 v3 接口（更安全）
   WECHAT_API_KEY=你的 v3 API 密钥
   # 不要硬编码，使用环境变量
   # 定期更新 API 密钥
   ```

## 📊 监控和告警

### 关键指标

- API 响应时间（≤200ms）
- 数据库连接数（监控泄漏）
- Redis 内存使用（监控溢出）
- 支付订单处理成功率（>99.9%）
- Token 余额一致性检查

### 日志检查

```bash
# 查看错误日志
tail -f logs/error.log

# 查看支付日志
grep "Payment" logs/combined.log

# 查看 Token 操作日志
grep "Token" logs/combined.log
```

## 🧪 测试

### 单元测试
```bash
npm test
```

### 集成测试
```bash
# 使用 Postman / Insomnia 导入 API 集合
# 或使用 curl 命令手动测试
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account":"13800000000","password":"SecurePass123"}'
```

## 📝 常见问题

### Q: 如何重置用户密码？
A: 目前不支持通过 API 重置。需要管理员在数据库中手动修改。后期可添加邮件重置功能。

### Q: Token 能否转账/提现？
A: 不支持。Token 仅用于抵扣业务请求，不可转账或提现。

### Q: 支付失败后会发放 Token 吗？
A: 不会。Token 仅在微信回调验证成功后才发放，确保资金与 Token 一致性。

### Q: 订单过期后能否重新支付？
A: 不能。过期订单自动关闭，需要重新发起充值请求生成新订单。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 📞 技术支持

- 项目文档：见 docs/ 目录
- 问题报告：GitHub Issues
- 邮件联系：support@proofread.com

---

**最后更新：2024年1月18日**
