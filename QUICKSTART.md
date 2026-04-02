# PostgreSQL 快速开始指南

## 总结

您已经选择了 **PostgreSQL（生产级）** 数据库。我为您准备了以下文件和工具：

### 📦 新增文件

1. **`.env`** - 环境配置文件
   - 数据库连接参数
   - JWT 密钥配置
   - WeChat 支付配置
   - Redis 配置

2. **`init-db.ps1`** - PowerShell 初始化脚本（推荐 Windows）
   - 自动创建数据库和用户
   - 自动创建所有表结构
   - 支持交互式配置

3. **`init-db.bat`** - 批处理初始化脚本（Windows 备选）
   - 同上，适合不使用 PowerShell 的用户

4. **`setup-db.py`** - Python 初始化脚本（跨平台）
   - 适合 macOS 和 Linux

5. **`POSTGRESQL-SETUP.md`** - 详细设置文档
   - 手动安装步骤
   - 故障排除指南

### 🚀 快速开始（3步）

#### 第 1 步：安装 PostgreSQL

**Windows：**
- 从 [PostgreSQL 官网](https://www.postgresql.org/download/windows/) 下载
- 运行安装程序
- 记住 `postgres` 用户的密码

**macOS：**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux：**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

#### 第 2 步：初始化数据库

在 `ProofRead-Backend` 目录下运行：

**推荐 - PowerShell 脚本（Windows）：**
```powershell
# 右键 init-db.ps1 -> 使用 PowerShell 运行
# 或在 PowerShell 中执行：
.\init-db.ps1
```

**或 - Python 脚本（跨平台）：**
```bash
# 安装依赖（首次运行）
pip install python-dotenv psycopg2-binary

# 运行脚本
python setup-db.py
```

**或 - 批处理脚本（Windows 备选）：**
```cmd
init-db.bat
```

#### 第 3 步：启动后端服务

```bash
cd ProofRead-Backend
npm install  # 如果未安装依赖
npm run dev
```

### 📊 数据库架构

初始化脚本将创建以下 5 个表：

| 表名 | 用途 | 关键字段 |
|------|------|--------|
| `users` | 用户账户 | account, password_hash, token_balance |
| `token_logs` | Token 消费日志 | user_id, deduction_amount, remaining_balance |
| `payment_orders` | 充值订单 | user_id, order_number, order_status |
| `recharge_logs` | 充值记录 | user_id, recharge_amount, payment_status |
| `login_logs` | 登录日志 | user_id, login_ip, login_time |

### ✅ 验证安装

初始化完成后，运行：

```bash
npm run dev
```

访问 http://localhost:3001/health，应看到：

```json
{
  "status": "healthy",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "uptime": 5.123
}
```

### 🔍 查看数据库数据

使用以下命令查看注册的用户：

```bash
psql -h localhost -U proofread_user -d proofread_db -c "SELECT id, account, user_type, token_balance, created_at FROM users;"
```

或使用 GUI 工具：
- **pgAdmin** - 官方 PostgreSQL 管理工具
- **DBeaver** - 强大的通用数据库工具

### 📝 环境配置

`.env` 文件中的关键配置：

```env
# 生产环境时务必修改以下值！
DB_PASSWORD=ProofRead123!@#  # 改为强密码
JWT_SECRET=your_jwt_secret_key_change_in_production  # 改为随机密钥
```

### 🐳 使用 Docker（可选）

如果安装 PostgreSQL 困难，可用 Docker：

```bash
# 启动 PostgreSQL 容器
docker run --name proofread-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15

# 然后运行初始化脚本
python setup-db.py
```

### 🐛 常见问题

**Q: psql 命令不存在？**
A: PostgreSQL 未正确安装或未添加到 PATH。重新安装或手动添加。

**Q: 密码错误？**
A: 检查 `.env` 文件，确保 postgres 密码正确。

**Q: 连接被拒绝？**
A: 检查 PostgreSQL 服务是否运行。Windows 检查服务管理器，Linux/Mac 运行 `brew services start postgresql@15`。

**Q: 需要重置数据库？**
A: 运行 `psql -U postgres -c "DROP DATABASE IF EXISTS proofread_db;"` 然后重新运行初始化脚本。

### 🔗 后续步骤

1. ✅ PostgreSQL 数据库已集成
2. 📄 配置 `.env` 的 WeChat 支付参数
3. 🔐 配置生产环境密钥
4. 🚀 部署到 Aliyun / AWS

### 📖 更多信息

- 详细设置指南：[POSTGRESQL-SETUP.md](./POSTGRESQL-SETUP.md)
- PostgreSQL 官方文档：[https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)

---

**需要帮助？** 查看 POSTGRESQL-SETUP.md 中的故障排除部分。
