-- Create user
CREATE USER "proofread_user" WITH PASSWORD 'ProofRead123!@#';

-- Create database
CREATE DATABASE "proofread_db" OWNER "proofread_user";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "proofread_db" TO "proofread_user";

-- Connect to new database
\connect proofread_db proofread_user

-- Create tables
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
