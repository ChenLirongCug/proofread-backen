#!/usr/bin/env python3
"""
PostgreSQL 数据库初始化脚本
用于创建数据库、用户和表结构
"""

import psycopg2
import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', '5432'))
DB_USER = os.getenv('DB_USER', 'proofread_user')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'ProofRead123!@#')
DB_NAME = os.getenv('DB_NAME', 'proofread_db')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'postgres')

def create_database():
    """创建数据库和用户"""
    try:
        # 使用默认 postgres 用户连接
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user='postgres',
            password=POSTGRES_PASSWORD,
            database='postgres'
        )
        conn.autocommit = True
        cursor = conn.cursor()

        print(f"✅ 已连接到 PostgreSQL")

        # 创建用户（如果不存在）
        try:
            cursor.execute(f"CREATE USER \"{DB_USER}\" WITH PASSWORD '{DB_PASSWORD}';")
            print(f"✅ 用户 '{DB_USER}' 创建成功")
        except psycopg2.errors.DuplicateObject:
            print(f"ℹ️  用户 '{DB_USER}' 已存在")

        # 创建数据库（如果不存在）
        try:
            cursor.execute(f"CREATE DATABASE \"{DB_NAME}\" OWNER \"{DB_USER}\";")
            print(f"✅ 数据库 '{DB_NAME}' 创建成功")
        except psycopg2.errors.DuplicateDatabase:
            print(f"ℹ️  数据库 '{DB_NAME}' 已存在")

        # 授予权限
        cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE \"{DB_NAME}\" TO \"{DB_USER}\";")
        print("✅ 权限授予成功")

        cursor.close()
        conn.close()

    except psycopg2.Error as e:
        print(f"❌ 连接到 PostgreSQL 失败: {e}")
        return False

    return True


def create_tables():
    """创建表结构"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        conn.autocommit = True
        cursor = conn.cursor()

        print(f"\n✅ 已连接到数据库 '{DB_NAME}'")
        print("正在创建表结构...")

        # 用户表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                account VARCHAR(255) UNIQUE NOT NULL,
                user_type VARCHAR(50) DEFAULT 'free',
                account_status VARCHAR(50) DEFAULT 'active',
                registration_ip VARCHAR(50),
                token_balance BIGINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_users_account ON users(account);
        """)
        print("✅ 用户表创建成功")

        # Token 日志表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS token_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                deduction_amount BIGINT NOT NULL,
                remaining_balance BIGINT NOT NULL,
                business_type VARCHAR(100) NOT NULL,
                business_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_token_logs_user_id ON token_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_token_logs_created_at ON token_logs(created_at);
        """)
        print("✅ Token 日志表创建成功")

        # 充值订单表
        cursor.execute("""
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
            CREATE INDEX IF NOT EXISTS idx_payment_orders_number ON payment_orders(order_number);
            CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
            CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(order_status);
            CREATE INDEX IF NOT EXISTS idx_payment_orders_expired_at ON payment_orders(expired_at);
        """)
        print("✅ 充值订单表创建成功")

        # 充值日志表
        cursor.execute("""
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
            CREATE INDEX IF NOT EXISTS idx_recharge_logs_user_id ON recharge_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_recharge_logs_order_number ON recharge_logs(order_number);
            CREATE INDEX IF NOT EXISTS idx_recharge_logs_created_at ON recharge_logs(created_at);
        """)
        print("✅ 充值日志表创建成功")

        # 登录日志表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                login_ip VARCHAR(45),
                login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                logout_time TIMESTAMP,
                session_id VARCHAR(255)
            );
            CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_login_logs_login_time ON login_logs(login_time);
        """)
        print("✅ 登录日志表创建成功")

        cursor.close()
        conn.close()

        return True

    except psycopg2.Error as e:
        print(f"❌ 创建表失败: {e}")
        return False


if __name__ == '__main__':
    print("""
╔════════════════════════════════════════════════════════╗
║  PostgreSQL 数据库初始化工具                            ║
╚════════════════════════════════════════════════════════╝
    """)

    if create_database() and create_tables():
        print(f"""
╔════════════════════════════════════════════════════════╗
║  ✅ 初始化完成                                         ║
║                                                        ║
║  数据库名称: {DB_NAME.ljust(40)}║
║  用户名: {DB_USER.ljust(45)}║
║  地址: {f"{DB_HOST}:{DB_PORT}".ljust(42)}║
║                                                        ║
║  现在可以运行: npm run dev                             ║
╚════════════════════════════════════════════════════════╝
        """)
    else:
        print("\n❌ 初始化失败")
        exit(1)
