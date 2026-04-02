import { query } from './connection';

export const initializeDatabase = async () => {
  try {
    // 用户表
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        account VARCHAR(255) UNIQUE NOT NULL,
        user_type VARCHAR(50) DEFAULT 'free',
        account_status VARCHAR(50) DEFAULT 'active',
        token_balance BIGINT DEFAULT 0,
        registration_ip VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 兼容旧版本库：移除账号密码管理相关字段
    await query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash;`);
    await query(`ALTER TABLE users DROP COLUMN IF EXISTS salt;`);
    await query(`ALTER TABLE users DROP COLUMN IF EXISTS lock_until;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(50);`);

    // 创建索引
    await query(`CREATE INDEX IF NOT EXISTS idx_users_account ON users(account);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_registration_ip ON users(registration_ip, created_at);`);

    // Token 账户表
    await query(`
      CREATE TABLE IF NOT EXISTS token_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        available_balance BIGINT DEFAULT 0,
        total_used BIGINT DEFAULT 0,
        total_recharged BIGINT DEFAULT 0,
        account_status VARCHAR(50) DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_token_accounts_user_id ON token_accounts(user_id);`);

    // Token 消费日志表
    await query(`
      CREATE TABLE IF NOT EXISTS token_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deduction_amount BIGINT NOT NULL,
        remaining_balance BIGINT NOT NULL,
        business_type VARCHAR(100) NOT NULL,
        business_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_token_logs_user_id ON token_logs(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_token_logs_created_at ON token_logs(created_at);`);

    // 充值订单表
    await query(`
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
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_number ON payment_orders(order_number);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(order_status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_expired_at ON payment_orders(expired_at);`);

    // 充值日志表
    await query(`
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
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_recharge_logs_user_id ON recharge_logs(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_recharge_logs_order_number ON recharge_logs(order_number);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_recharge_logs_created_at ON recharge_logs(created_at);`);

    // 登录日志表
    await query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        account VARCHAR(255) NOT NULL,
        login_ip VARCHAR(50),
        device_info VARCHAR(255),
        login_status VARCHAR(50),
        is_success BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_account ON login_logs(account);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at);`);

    // 活跃会话表（用于单点登录控制）
    await query(`
      CREATE TABLE IF NOT EXISTS active_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL,
        device_id VARCHAR(255),
        device_name VARCHAR(255),
        ip_address VARCHAR(50),
        user_agent VARCHAR(500),
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, device_id)
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(token);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_last_active ON active_sessions(last_active_at);`);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

export const dropDatabase = async () => {
  try {
    await query('DROP TABLE IF EXISTS active_sessions CASCADE');
    await query('DROP TABLE IF EXISTS login_logs CASCADE');
    await query('DROP TABLE IF EXISTS recharge_logs CASCADE');
    await query('DROP TABLE IF EXISTS payment_orders CASCADE');
    await query('DROP TABLE IF EXISTS token_logs CASCADE');
    await query('DROP TABLE IF EXISTS token_accounts CASCADE');
    await query('DROP TABLE IF EXISTS users CASCADE');
    console.log('✅ Database tables dropped');
  } catch (error) {
    console.error('❌ Database drop failed:', error);
    throw error;
  }
};
