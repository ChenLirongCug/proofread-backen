import { query } from './database/connection';

async function test() {
  try {
    console.log('🔍 测试数据库查询...');
    const result = await query('SELECT version()');
    console.log('✅ 成功:', result.rows[0]);
  } catch (error: any) {
    console.error('❌ 失败:', error.message);
  }
}

test();
