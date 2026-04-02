/**
 * Redis 配置模块 - Mock版本
 * 由于当前环境不使用Redis,提供空实现以避免启动错误
 */

// Mock Redis客户端 - 所有操作返回空值
class MockRedisClient {
  async get(key: string): Promise<string | null> {
    return null;
  }

  async set(key: string, value: string): Promise<string> {
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    return keys.length;
  }

  async incr(key: string): Promise<number> {
    return 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return 1;
  }

  async quit(): Promise<void> {
    return;
  }
}

const mockRedisClient = new MockRedisClient();

export function getRedisClient(): MockRedisClient {
  return mockRedisClient;
}

export async function initRedis(): Promise<void> {
  console.log('⚠️  Redis Mock 模式 - 不使用缓存功能');
}

export async function closeRedis(): Promise<void> {
  console.log('⚠️  Redis Mock 已关闭');
}
