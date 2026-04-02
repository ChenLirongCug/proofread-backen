# ProofRead 系统架构 - PostgreSQL 集成版

## 🏗️ 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MS Word Desktop                                  │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Office Add-in (ProofRead - 副本)                                │  │
│  │  ├─ src/taskpane/taskpane.html        (UI 界面)                 │  │
│  │  ├─ src/taskpane/taskpane.ts          (API 集成)                │  │
│  │  └─ src/taskpane/taskpane.css         (样式)                    │  │
│  │                                                                    │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │ HTTP/REST                                         │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      │ (localhost:3000 ↔ localhost:3001)
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ProofRead Backend Service                             │
│                    (Node.js + Express + TypeScript)                      │
│                    Port: 3001 (npm run dev)                              │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Routes:                                                          │    │
│  │  ├─ POST   /api/auth/register      (用户注册)                  │    │
│  │  ├─ POST   /api/auth/login         (用户登录)                  │    │
│  │  ├─ GET    /api/token/balance      (获取 Token 余额)           │    │
│  │  ├─ POST   /api/token/deduct       (消费 Token)                │    │
│  │  ├─ POST   /api/payment/create-order  (创建充值订单)           │    │
│  │  ├─ GET    /api/health             (健康检查)                  │    │
│  │  └─ DEBUG  /api/debug/*            (调试接口)                  │    │
│  └─────────────────┬──────────────────────────────────────────────┘    │
│                    │                                                     │
│  ┌─────────────────▼──────────────────────────────────────────────┐    │
│  │ Middleware & Services:                                          │    │
│  │  ├─ JWT 认证 (jsonwebtoken)                                    │    │
│  │  ├─ 密码加密 (bcryptjs)                                        │    │
│  │  ├─ 错误处理                                                   │    │
│  │  └─ 请求日志                                                   │    │
│  └─────────────────┬──────────────────────────────────────────────┘    │
│                    │                                                     │
│  ┌─────────────────▼──────────────────────────────────────────────┐    │
│  │ Data Layer:                                                     │    │
│  │  ├─ src/database/connection.ts    (数据库连接池)              │    │
│  │  └─ src/services/*               (业务逻辑服务)               │    │
│  └─────────────────┬──────────────────────────────────────────────┘    │
│                    │                                                     │
└────────────────────┼──────────────────────────────────────────────────┘
                     │
                     │ (TCP:5432)
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                                 │
│                    (Production-Grade Storage)                            │
│                                                                           │
│  Database: proofread_db                                                  │
│  User: proofread_user                                                    │
│  Port: 5432                                                              │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │ 核心表:                                                        │     │
│  │                                                                │     │
│  │  users                     ◄─── 用户账户                      │     │
│  │  ├─ id                                                        │     │
│  │  ├─ account (UNIQUE)                                         │     │
│  │  ├─ password_hash                                            │     │
│  │  ├─ token_balance                                            │     │
│  │  └─ created_at                                               │     │
│  │                                                                │     │
│  │  token_logs                ◄─── Token 消费日志               │     │
│  │  ├─ user_id → users (FK)                                     │     │
│  │  ├─ deduction_amount                                         │     │
│  │  ├─ remaining_balance                                        │     │
│  │  └─ created_at                                               │     │
│  │                                                                │     │
│  │  payment_orders            ◄─── 充值订单                     │     │
│  │  ├─ user_id → users (FK)                                     │     │
│  │  ├─ order_number (UNIQUE)                                    │     │
│  │  ├─ order_status                                             │     │
│  │  ├─ expired_at                                               │     │
│  │  └─ created_at                                               │     │
│  │                                                                │     │
│  │  recharge_logs             ◄─── 充值记录                     │     │
│  │  ├─ user_id → users (FK)                                     │     │
│  │  ├─ recharge_amount                                          │     │
│  │  ├─ payment_status                                           │     │
│  │  └─ created_at                                               │     │
│  │                                                                │     │
│  │  login_logs                ◄─── 登录日志                     │     │
│  │  ├─ user_id → users (FK)                                     │     │
│  │  ├─ login_ip                                                 │     │
│  │  └─ login_time                                               │     │
│  │                                                                │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                           │
│  所有表都包含：                                                           │
│  ✓ 自动增量主键                                                        │
│  ✓ 外键约束 (ON DELETE CASCADE)                                        │
│  ✓ 性能索引                                                            │
│  ✓ 时间戳字段                                                          │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 📊 数据流向

### 用户注册流程

```
Word Add-in (taskpane.ts)
    │
    ├─→ registerUser()
    │
    ▼
POST /api/auth/register
    │
    ├─→ AuthService.register()
    │
    ├─→ 验证账号和密码格式
    │
    ├─→ 生成盐值和密码哈希
    │
    ├─→ INSERT INTO users (account, password_hash, ...)
    │
    ├─→ 初始化 Token 余额 (10000)
    │
    ├─→ 生成 JWT Token
    │
    ▼
return { userId, token, tokenBalance }
    │
    ▼
前端保存到 localStorage
显示主界面
```

### 用户登录流程

```
Word Add-in (taskpane.ts)
    │
    ├─→ loginUser()
    │
    ▼
POST /api/auth/login
    │
    ├─→ AuthService.login()
    │
    ├─→ SELECT * FROM users WHERE account = $1
    │
    ├─→ 验证密码哈希
    │
    ├─→ 生成 JWT Token
    │
    ├─→ INSERT INTO login_logs (...)  [记录登录]
    │
    ▼
return { userId, token, tokenBalance }
    │
    ▼
前端保存状态
显示 Token 余额
```

### Token 消费流程

```
Word Add-in (taskpane.ts) - 点击 "审校" 按钮
    │
    ├─→ startFullScan()
    │
    ├─→ deductTokens(amount=100)
    │
    ▼
POST /api/token/deduct
    │
    ├─→ TokenService.deductTokens(userId, amount)
    │
    ├─→ BEGIN TRANSACTION
    │
    ├─→ SELECT token_balance FROM users WHERE id = $1
    │
    ├─→ 验证余额充足
    │
    ├─→ UPDATE users SET token_balance = token_balance - $1
    │
    ├─→ INSERT INTO token_logs (...)  [记录消费]
    │
    ├─→ COMMIT
    │
    ▼
return { newBalance }
    │
    ▼
前端更新显示
执行审校功能
```

### 充值流程

```
Word Add-in (taskpane.ts) - 点击 "充值" 按钮
    │
    ├─→ createRechargeOrder(amount=99.9)
    │
    ▼
POST /api/payment/create-order
    │
    ├─→ PaymentService.createOrder(userId, amount)
    │
    ├─→ INSERT INTO payment_orders (...)  [创建订单]
    │
    ├─→ 调用 WeChat API 获取支付二维码
    │
    ▼
return { orderId, qrCodeUrl, expiredAt }
    │
    ▼
前端显示二维码
用户扫码支付
    │
    ├─→ WeChat 回调 /api/payment/callback
    │
    ├─→ 验证签名
    │
    ├─→ UPDATE payment_orders SET paid_at, order_status='paid'
    │
    ├─→ UPDATE users SET token_balance = token_balance + tokenAmount
    │
    ├─→ INSERT INTO recharge_logs (...)
    │
    ▼
支付完成
Token 自动到账
```

## 🔐 安全架构

```
┌─────────────────────────────────────────────────┐
│           用户请求                                │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  CORS 验证                   │
        │ (允许 localhost:3000)        │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Express Middleware          │
        │ (helmet, morgan, ...)        │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  JWT 认证 (if required)     │
        │ (验证 Authorization header)  │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  业务逻辑处理                 │
        │ (service layer)              │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  数据库操作                   │
        │ (PostgreSQL 查询)            │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  密码存储                     │
        │ (bcryptjs + salt)            │
        └─────────────────────────────┘
```

## 📦 部署架构

### 开发环境

```
本地开发机
├─ Frontend (Webpack Dev Server):3000
├─ Backend (ts-node):3001
└─ PostgreSQL:5432
```

### 生产环境 (Docker + Aliyun)

```
Aliyun ECS
├─ Docker Container (Backend)
│  ├─ Node.js + Express
│  └─ Port 3001
├─ RDS PostgreSQL (Cloud DB)
├─ ElastiCache Redis (Cache)
└─ CDN (Frontend Static)

或

Kubernetes
├─ Backend Pod (Auto-scaled)
├─ PostgreSQL StatefulSet
├─ Redis Cache Pod
└─ Ingress Controller
```

## 🔄 状态机

### 订单状态流转

```
pending (待支付)
    │
    ├─→ paid (已支付)
    │    │
    │    └─→ completed (已完成)
    │
    └─→ expired (已过期)

付款时间 ≤ expired_at
    ↓
订单变为 paid 并记录 paid_at
    ↓
Token 自动到账
    ↓
用户可立即使用
```

### Token 状态

```
用户初始化
    │
    ├─→ 获得免费 Token (10000)
    │
    ├─→ 每次使用时扣款
    │    (INSERT INTO token_logs)
    │
    ├─→ 可充值获得更多
    │    (payment_orders → recharge_logs)
    │
    └─→ 余额 = 总充值 - 总消费
```

## 📈 性能指标

| 指标 | 值 |
|------|-----|
| 最大连接数 | 20 |
| 连接超时 | 2s |
| 查询超时 | 1s（慢查询告警） |
| 最大请求体 | 10MB |
| JWT 过期时间 | 7 天 |
| 账户锁定时长 | 15 分钟（失败5次） |

---

**更新时间：** 2024-01-18  
**版本：** 1.0  
**作者：** AI Assistant
