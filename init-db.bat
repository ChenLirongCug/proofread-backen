@echo off
REM PostgreSQL 数据库快速初始化脚本 (Windows)
REM 用于自动创建数据库、用户和表结构

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  PostgreSQL 数据库初始化工具                            ║
echo ╚════════════════════════════════════════════════════════╝
echo.

setlocal enabledelayedexpansion

REM 读取 .env 文件的变量
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="DB_HOST" set DB_HOST=%%b
    if "%%a"=="DB_PORT" set DB_PORT=%%b
    if "%%a"=="DB_NAME" set DB_NAME=%%b
    if "%%a"=="DB_USER" set DB_USER=%%b
    if "%%a"=="DB_PASSWORD" set DB_PASSWORD=%%b
)

REM 设置默认值
if not defined DB_HOST set DB_HOST=localhost
if not defined DB_PORT set DB_PORT=5432
if not defined DB_NAME set DB_NAME=proofread_db
if not defined DB_USER set DB_USER=proofread_user
if not defined DB_PASSWORD set DB_PASSWORD=ProofRead123!@#

echo 配置信息：
echo   数据库地址: %DB_HOST%:%DB_PORT%
echo   数据库名: %DB_NAME%
echo   用户名: %DB_USER%
echo.

REM 检查 psql 是否可用
psql --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到 PostgreSQL，请先安装 PostgreSQL
    echo.
    echo 下载地址：https://www.postgresql.org/download/windows/
    exit /b 1
)

echo ✅ PostgreSQL 已安装
echo.

REM 提示用户输入 postgres 密码
echo 请输入 PostgreSQL postgres 用户的密码：
set /p POSTGRES_PASSWORD=

REM 创建初始化 SQL 脚本
(
    echo -- 创建用户
    echo CREATE USER "%DB_USER%" WITH PASSWORD '%DB_PASSWORD%';
    echo.
    echo -- 创建数据库
    echo CREATE DATABASE "%DB_NAME%" OWNER "%DB_USER%";
    echo.
    echo -- 授予权限
    echo GRANT ALL PRIVILEGES ON DATABASE "%DB_NAME%" TO "%DB_USER%";
    echo.
    echo -- 连接到新数据库
    echo \connect %DB_NAME% %DB_USER%
    echo.
    echo -- 创建用户表
    echo CREATE TABLE IF NOT EXISTS users (
    echo     id SERIAL PRIMARY KEY,
    echo     account VARCHAR(255) UNIQUE NOT NULL,
    echo     user_type VARCHAR(50) DEFAULT 'free',
    echo     account_status VARCHAR(50) DEFAULT 'active',
    echo     registration_ip VARCHAR(50),
    echo     token_balance BIGINT DEFAULT 0,
    echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    echo );
    echo CREATE INDEX idx_users_account ON users(account);
    echo.
    echo -- 创建 Token 日志表
    echo CREATE TABLE IF NOT EXISTS token_logs (
    echo     id SERIAL PRIMARY KEY,
    echo     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    echo     deduction_amount BIGINT NOT NULL,
    echo     remaining_balance BIGINT NOT NULL,
    echo     business_type VARCHAR(100) NOT NULL,
    echo     business_id VARCHAR(255),
    echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    echo );
    echo CREATE INDEX idx_token_logs_user_id ON token_logs(user_id);
    echo CREATE INDEX idx_token_logs_created_at ON token_logs(created_at);
    echo.
    echo -- 创建充值订单表
    echo CREATE TABLE IF NOT EXISTS payment_orders (
    echo     id SERIAL PRIMARY KEY,
    echo     order_number VARCHAR(50) UNIQUE NOT NULL,
    echo     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    echo     recharge_amount DECIMAL(10, 2) NOT NULL,
    echo     token_amount BIGINT NOT NULL,
    echo     order_status VARCHAR(50) DEFAULT 'pending',
    echo     payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    echo     wechat_prepay_id VARCHAR(255),
    echo     wechat_transaction_id VARCHAR(255),
    echo     code_url VARCHAR(1000),
    echo     expired_at TIMESTAMP NOT NULL,
    echo     paid_at TIMESTAMP,
    echo     closed_at TIMESTAMP,
    echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    echo );
    echo CREATE INDEX idx_payment_orders_number ON payment_orders(order_number);
    echo CREATE INDEX idx_payment_orders_user_id ON payment_orders(user_id);
    echo CREATE INDEX idx_payment_orders_status ON payment_orders(order_status);
    echo.
    echo -- 创建充值日志表
    echo CREATE TABLE IF NOT EXISTS recharge_logs (
    echo     id SERIAL PRIMARY KEY,
    echo     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    echo     order_number VARCHAR(50) NOT NULL,
    echo     recharge_amount DECIMAL(10, 2) NOT NULL,
    echo     token_amount BIGINT NOT NULL,
    echo     payment_status VARCHAR(50) NOT NULL,
    echo     payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    echo     wechat_transaction_id VARCHAR(255),
    echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    echo );
    echo CREATE INDEX idx_recharge_logs_user_id ON recharge_logs(user_id);
    echo CREATE INDEX idx_recharge_logs_order_number ON recharge_logs(order_number);
    echo.
    echo -- 创建登录日志表
    echo CREATE TABLE IF NOT EXISTS login_logs (
    echo     id SERIAL PRIMARY KEY,
    echo     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    echo     login_ip VARCHAR(45),
    echo     login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    echo     logout_time TIMESTAMP,
    echo     session_id VARCHAR(255)
    echo );
    echo CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
    echo CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);
) > init-db.sql

echo 正在执行初始化脚本...
echo.

REM 执行 SQL 脚本
psql -h %DB_HOST% -p %DB_PORT% -U postgres -f init-db.sql

if errorlevel 1 (
    echo.
    echo ❌ 初始化失败！请检查 PostgreSQL 连接和密码
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  ✅ PostgreSQL 数据库初始化完成！                       ║
echo ║                                                        ║
echo ║  数据库名称: %DB_NAME%
echo ║  用户名: %DB_USER%
echo ║  地址: %DB_HOST%:%DB_PORT%
echo ║                                                        ║
echo ║  下一步：运行 npm run dev                              ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM 清理临时文件
del /q init-db.sql

pause
