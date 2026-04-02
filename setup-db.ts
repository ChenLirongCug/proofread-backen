import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const dbName = process.env.DB_NAME || 'proofread_db';
const dbUser = process.env.DB_USER || 'proofread_user';

async function setupDatabase() {
  const client = new Client(dbConfig as any);

  try {
    console.log('正在连接到 PostgreSQL 服务器...');
    await client.connect();
    console.log('✅ 已连接到 PostgreSQL');

    // 1. 创建数据库（如果不存在）
    console.log(`\n正在创建数据库 "${dbName}"...`);
    try {
      await client.query(`CREATE DATABASE "${dbName}";`);
      console.log(`✅ 数据库 "${dbName}" 创建成功`);
    } catch (err: any) {
      if (err.code === '42P04') {
        console.log(`ℹ️  数据库 "${dbName}" 已存在`);
      } else {
        throw err;
      }
    }

    // 2. 创建用户（如果不存在）
    console.log(`\n正在创建数据库用户 "${dbUser}"...`);
    try {
      await client.query(
        `CREATE USER "${dbUser}" WITH PASSWORD '${process.env.DB_PASSWORD}';`
      );
      console.log(`✅ 用户 "${dbUser}" 创建成功`);
    } catch (err: any) {
      if (err.code === '42710') {
        console.log(`ℹ️  用户 "${dbUser}" 已存在`);
      } else {
        throw err;
      }
    }

    // 3. 授予权限
    console.log(`\n正在授予权限...`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}";`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}";`
    );
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}";`);
    console.log('✅ 权限授予成功');

    await client.end();

    // 4. 连接到新数据库并创建表
    console.log(`\n正在连接到数据库 "${dbName}"...`);
    const dbClient = new Client({
      ...dbConfig,
      database: dbName,
    } as any);

    await dbClient.connect();
    console.log('✅ 已连接到目标数据库');

    // 创建表
    console.log('\n正在创建表结构...');

    // 用户表
    await dbClient.query(`
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
    `);
    console.log('✅ 用户表创建成功');

    // Token 日志表
    await dbClient.query(`
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
    `);
    console.log('✅ Token 日志表创建成功');

    // 充值订单表
    await dbClient.query(`
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
    `);
    console.log('✅ 充值订单表创建成功');

    // 充值日志表
    await dbClient.query(`
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
    `);
    console.log('✅ 充值日志表创建成功');

    // 登录日志表
    await dbClient.query(`
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
    `);
    console.log('✅ 登录日志表创建成功');

    await dbClient.end();

    console.log(`
╔════════════════════════════════════════════════════════╗
║  ✅ PostgreSQL 数据库初始化完成                          ║
║                                                        ║
║  数据库名称: ${dbName.padEnd(38)}║
║  用户名: ${dbUser.padEnd(44)}║
║  地址: ${`${process.env.DB_HOST}:${process.env.DB_PORT}`.padEnd(42)}║
╚════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

// 运行初始化
setupDatabase();
