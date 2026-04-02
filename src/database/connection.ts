import { Pool } from 'pg';
import dotenv from 'dotenv';

// 必须在导入其他模块之前加载 .env
const envResult = dotenv.config();
console.log('📋 dotenv 配置加载结果:', envResult.parsed ? '✅' : '❌');

// 完全使用显式值而不是使用 || 操作符
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;

console.log('🔐 环境变量检查:', {
  DB_HOST: DB_HOST || '(未设置)',
  DB_PORT: DB_PORT || '(未设置)',
  DB_NAME: DB_NAME || '(未设置)',
  DB_USER: DB_USER || '(未设置)',
  DB_PASSWORD: DB_PASSWORD ? '✅ 已设置' : '❌ 未设置',
});

const poolConfig = {
  host: DB_HOST || 'localhost',
  port: DB_PORT ? parseInt(DB_PORT, 10) : 5432,
  database: DB_NAME || 'proofread_db',
  user: DB_USER || 'proofread_user',
  password: DB_PASSWORD || 'ProofRead123!@#',
  min: 1,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

console.log('🔌 最终数据库配置:', {
  ...poolConfig,
  password: '***',
});

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('✅ 新的数据库连接已建立');
});

pool.on('error', (err: Error) => {
  console.error('❌ 数据库连接池错误:', err.message);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('✅ 查询执行:', { text: text.substring(0, 50), duration, rows: result.rowCount });
    return result;
  } catch (error: any) {
    console.error('❌ 数据库查询错误:', { text: text.substring(0, 50), error: error.message });
    throw error;
  }
}

export default pool;

// 事务辅助函数，用于在服务层执行事务操作
export async function transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


