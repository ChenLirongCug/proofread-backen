# PostgreSQL 数据库设置指南

## 概述

ProofRead 后端现在使用 **PostgreSQL** 数据库进行生产级数据存储。本指南将帮助您完成数据库的安装和配置。

## 前置条件

- PostgreSQL 12 或更高版本
- Node.js LTS
- Python 3.6+ （可选，用于自动初始化脚本）

## 安装步骤

### 1. 安装 PostgreSQL

#### Windows
- 从 [PostgreSQL 官网](https://www.postgresql.org/download/windows/) 下载安装程序
- 运行安装程序，记住 `postgres` 用户的密码（默认密码可自定义）
- 完成安装后，PostgreSQL 将作为 Windows 服务运行

#### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

### 2. 验证 PostgreSQL 安装

```bash
psql --version
```

或在 Windows PowerShell 中：
```powershell
psql -V
```

### 3. 配置环境变量

编辑 `.env` 文件（已在项目根目录创建），确保以下变量正确：

```env
# PostgreSQL 配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proofread_db
DB_USER=proofread_user
DB_PASSWORD=ProofRead123!@#
```

> ⚠️ **重要**：在生产环境中，请更改数据库密码！

### 4. 初始化数据库

#### 方法 A：使用 Python 脚本（推荐）

```bash
# 进入后端目录
cd ProofRead-Backend

# 安装依赖（如果未安装）
pip install python-dotenv psycopg2-binary

# 运行初始化脚本
python setup-db.py
```

#### 方法 B：手动创建（如果 Python 不可用）

在 PostgreSQL 中执行以下 SQL 命令：

```sql
-- 使用 postgres 用户连接到默认数据库
\connect postgres;

-- 创建用户
CREATE USER "proofread_user" WITH PASSWORD 'ProofRead123!@#';

-- 创建数据库
CREATE DATABASE "proofread_db" OWNER "proofread_user";

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE "proofread_db" TO "proofread_user";

-- 连接到新数据库
\connect proofread_db;

-- 创建表（见下方 SQL 脚本）
```

### 5. 创建表结构

如果使用手动方法，需要运行以下 SQL：

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    account VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) DEFAULT 'free',
    account_status VARCHAR(50) DEFAULT 'normal',
    lock_until TIMESTAMP,
    token_balance BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_account ON users(account);

-- Token 日志表
CREATE TABLE IF NOT EXISTS token_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deduction_amount BIGINT NOT NULL,
    remaining_balance BIGINT NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    business_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_token_logs_user_id ON token_logs(user_id);
CREATE INDEX idx_token_logs_created_at ON token_logs(created_at);

-- 充值订单表
CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recharge_amount DECIMAL(10, 2) NOT NULL,
    token_amount BIGINT NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    wechat_prepay_id VARCHAR(255),
    wechat_transaction_id VARCHAR(255),
    code_url VARCHAR(1000),
    expired_at TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_payment_orders_number ON payment_orders(order_number);
CREATE INDEX idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(order_status);
CREATE INDEX idx_payment_orders_expired_at ON payment_orders(expired_at);

-- 充值日志表
CREATE TABLE IF NOT EXISTS recharge_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    recharge_amount DECIMAL(10, 2) NOT NULL,
    token_amount BIGINT NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    wechat_transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recharge_logs_user_id ON recharge_logs(user_id);
CREATE INDEX idx_recharge_logs_order_number ON recharge_logs(order_number);
CREATE INDEX idx_recharge_logs_created_at ON recharge_logs(created_at);

-- 登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_ip VARCHAR(45),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP,
    session_id VARCHAR(255)
);
CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);
```

### 6. 启动后端服务

```bash
# 进入后端目录
cd ProofRead-Backend

# 安装 npm 依赖（如果未安装）
npm install

# 启动开发服务器
npm run dev
```

## 验证数据库连接

启动后端服务后，访问：
```
http://localhost:3001/health
```

应该返回类似的响应：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-18T12:00:00.000Z",
  "uptime": 5.123
}
```

## 常见问题

### Q: 如何查看数据库中的用户？

```bash
psql -h localhost -U proofread_user -d proofread_db -c "SELECT * FROM users;"
```

或使用 pgAdmin 可视化工具。

### Q: 如何重置数据库？

```bash
# 删除数据库
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS proofread_db;"

# 重新运行初始化脚本
python setup-db.py
```

### Q: PostgreSQL 无法连接？

1. 确认 PostgreSQL 服务正在运行
2. 检查 `.env` 文件中的连接参数
3. 确保防火墙允许端口 5432

### Q: 如何使用 Docker 运行 PostgreSQL？

如果你有 Docker，可以快速启动 PostgreSQL：

```bash
docker run --name proofread-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15
```

然后运行初始化脚本。

## 下一步

- 配置 Redis（可选，用于缓存和会话）
- 配置 WeChat 支付集成
- 部署到云服务器（Aliyun、AWS 等）

## 参考资源

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [pgAdmin](https://www.pgadmin.org/) - PostgreSQL 管理工具
- [DBeaver](https://dbeaver.io/) - 通用数据库工具
