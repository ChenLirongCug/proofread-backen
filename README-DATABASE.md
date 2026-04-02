# 📚 PostgreSQL 集成 - 文件清单与快速导航

## 📂 新增文件列表

### 核心配置文件

| 文件 | 位置 | 用途 |
|------|------|------|
| `.env` | `ProofRead-Backend/` | 环境变量配置（数据库、JWT、支付等） |
| `package.json` | `ProofRead-Backend/` | 已添加 `npm run setup-db` 脚本 |

### 初始化脚本（选一个运行）

| 文件 | 位置 | 系统 | 用途 |
|------|------|------|------|
| `init-db.ps1` | `ProofRead-Backend/` | Windows | PowerShell 初始化（**推荐**） |
| `setup-db.py` | `ProofRead-Backend/` | 跨平台 | Python 初始化 |
| `init-db.bat` | `ProofRead-Backend/` | Windows | 批处理初始化 |

### 文档文件

| 文件 | 位置 | 内容 |
|------|------|------|
| `QUICKSTART.md` | `ProofRead-Backend/` | **⭐ 快速开始指南**（必读） |
| `POSTGRESQL-SETUP.md` | `ProofRead-Backend/` | 详细安装指南 + 故障排除 |
| `POSTGRES-INTEGRATION-COMPLETE.md` | `ProofRead-Backend/` | 完成报告 + 配置清单 |
| `ARCHITECTURE.md` | `ProofRead-Backend/` | 系统架构图 + 数据流程 |

---

## 🚀 快速启动步骤

### 第 1 步：安装 PostgreSQL（5 分钟）

**Windows：** 
- 下载：https://www.postgresql.org/download/windows/
- 运行安装程序
- 记住 `postgres` 用户密码

**macOS：**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux：**
```bash
sudo apt-get install postgresql
sudo service postgresql start
```

### 第 2 步：初始化数据库（2 分钟）

进入 `ProofRead-Backend` 目录，运行以下任一命令：

#### ✅ **推荐方式 1：PowerShell**
```powershell
.\init-db.ps1
# 输入 postgres 密码后自动创建数据库和表
```

#### 或 方式 2：Python
```bash
pip install python-dotenv psycopg2-binary
python setup-db.py
```

#### 或 方式 3：批处理
```cmd
init-db.bat
```

### 第 3 步：启动后端（1 分钟）

```bash
cd ProofRead-Backend
npm install  # 如果未安装
npm run dev
```

✅ **完成！** 后端现在运行在 http://localhost:3001

### 验证安装

```bash
# 访问健康检查端点
curl http://localhost:3001/health
```

预期输出：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "uptime": 5.123
}
```

---

## 📖 文档导航

### 🟢 **刚开始？从这里开始**
→ [QUICKSTART.md](./QUICKSTART.md)
- 3 步启动指南
- 环境配置
- 快速验证

### 🔧 **需要详细帮助？**
→ [POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)
- 详细安装步骤（Windows/Mac/Linux）
- 手动 SQL 命令
- 常见问题 FAQ
- 故障排除指南

### 📊 **想了解架构？**
→ [ARCHITECTURE.md](./ARCHITECTURE.md)
- 系统架构图
- 数据流向图
- 表关系图
- 安全架构

### 📋 **需要配置清单？**
→ [POSTGRES-INTEGRATION-COMPLETE.md](./POSTGRES-INTEGRATION-COMPLETE.md)
- 已完成工作总结
- 数据库架构详解
- 生产环境检查清单
- 性能特性

---

## ⚙️ 关键配置

### `.env` 文件（已创建）

```env
# 数据库连接（必须配置）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proofread_db
DB_USER=proofread_user
DB_PASSWORD=ProofRead123!@#  # ⚠️ 生产改为强密码

# JWT 令牌（⚠️ 生产改为随机值）
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRE=7d

# 前端地址
CORS_ORIGIN=http://localhost:3000
```

### 数据库用户凭证

| 项目 | 值 |
|------|-----|
| 用户名 | `proofread_user` |
| 密码 | `ProofRead123!@#` |
| 数据库 | `proofread_db` |
| 主机 | `localhost` |
| 端口 | `5432` |

> ⚠️ **生产环境务必修改这些密码！**

---

## 🗃️ 数据库表结构

初始化脚本将创建 **5 个表**：

```
users
├─ 用户账户表
├─ 字段：account, password_hash, token_balance
└─ 索引：idx_users_account

token_logs
├─ Token 消费日志
├─ 字段：user_id, deduction_amount, remaining_balance
└─ 索引：idx_token_logs_user_id, idx_token_logs_created_at

payment_orders
├─ 充值订单表
├─ 字段：order_number, user_id, order_status, expired_at
└─ 索引：idx_payment_orders_number, idx_payment_orders_status

recharge_logs
├─ 充值记录表
├─ 字段：user_id, recharge_amount, payment_status
└─ 索引：idx_recharge_logs_user_id

login_logs
├─ 登录日志表
├─ 字段：user_id, login_ip, login_time
└─ 索引：idx_login_logs_user_id
```

---

## 📞 常见问题快速解答

### Q: 运行初始化脚本后，如何验证数据库已创建？

```bash
psql -h localhost -U proofread_user -d proofread_db -c "\dt"
```

应该看到 5 个表列出。

### Q: 如何查看已注册的用户？

```bash
psql -h localhost -U proofread_user -d proofread_db \
  -c "SELECT id, account, token_balance, created_at FROM users;"
```

### Q: 初始化脚本失败怎么办？

1. 确认 PostgreSQL 服务正在运行
2. 检查 `.env` 文件配置
3. 查看 [POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md) 的故障排除部分
4. 尝试另一个初始化脚本（Python 或批处理）

### Q: 如何重置数据库？

```bash
psql -h localhost -U postgres \
  -c "DROP DATABASE IF EXISTS proofread_db;"

# 然后重新运行初始化脚本
.\init-db.ps1
```

### Q: 生产环境应该怎样配置？

查看 [POSTGRES-INTEGRATION-COMPLETE.md](./POSTGRES-INTEGRATION-COMPLETE.md) 中的 **生产环境检查清单** 部分。

---

## ✨ 初始化脚本功能对比

| 功能 | PowerShell | Python | 批处理 |
|------|-----------|--------|---------|
| Windows 支持 | ✅ | ✅ | ✅ |
| macOS 支持 | ✅ | ✅ | ❌ |
| Linux 支持 | ✅ | ✅ | ❌ |
| 无额外依赖 | ❌ | ❌ | ✅ |
| 交互式输入 | ✅ | ✅ | ✅ |
| 详细输出 | ✅ | ✅ | ✅ |
| **推荐使用** | **Windows** | **跨平台** | 备选 |

---

## 🎯 后续步骤

完成 PostgreSQL 初始化后，继续：

1. ✅ **PostgreSQL 数据库集成** ← 当前步骤
2. 📝 **启动后端服务** - `npm run dev`
3. 🔗 **前后端联调测试** - 测试登录、充值、Token 消费
4. 🌐 **配置 WeChat 支付** - 在 `.env` 中添加支付参数
5. 🚀 **部署到云服务器** - Aliyun / AWS

---

## 📚 相关链接

- 📖 [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- 📖 [pgAdmin - PostgreSQL 管理工具](https://www.pgadmin.org/)
- 📖 [DBeaver - 数据库可视化工具](https://dbeaver.io/)
- 📖 [Express.js 官方文档](https://expressjs.com/)
- 📖 [TypeScript 官方文档](https://www.typescriptlang.org/)

---

## 🆘 需要帮助？

1. **快速问题？** → 查看 [QUICKSTART.md](./QUICKSTART.md)
2. **安装问题？** → 查看 [POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)
3. **架构问题？** → 查看 [ARCHITECTURE.md](./ARCHITECTURE.md)
4. **生产配置？** → 查看 [POSTGRES-INTEGRATION-COMPLETE.md](./POSTGRES-INTEGRATION-COMPLETE.md)

---

## ✅ 检查清单

在启动后端前，确认以下已完成：

- [ ] PostgreSQL 已安装且服务正在运行
- [ ] 运行了初始化脚本（`.ps1` 或 `setup-db.py` 或 `.bat`）
- [ ] `.env` 文件已配置
- [ ] 验证了数据库连接：`psql -h localhost -U proofread_user -d proofread_db`
- [ ] 已安装 Node.js 依赖：`npm install`
- [ ] 后端服务成功启动：`npm run dev`
- [ ] 健康检查通过：`curl http://localhost:3001/health`

---

**🎉 恭喜！您的 ProofRead 后端现在拥有生产级 PostgreSQL 数据库！**

---

**文档创建时间：** 2024-01-18  
**版本：** 1.0  
**状态：** ✅ 完成
