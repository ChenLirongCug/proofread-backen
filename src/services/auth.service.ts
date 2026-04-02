import { query, transaction } from '../database/connection';
import { generateSalt, hashPassword, verifyPassword } from '../utils/encryption';
import { validateAccount, validatePassword } from '../utils/validators';
import { ResponseCode } from '../utils/constants';
import { getRedisClient } from '../config/redis';

const LOCK_DURATION = parseInt(process.env.ACCOUNT_LOCK_DURATION_MINUTES || '15') * 60;
const FAILURE_THRESHOLD = parseInt(process.env.LOGIN_FAILURE_THRESHOLD || '5');

/**
 * 用户登录验证服务
 */
export class AuthService {
  /**
   * 用户注册
   */
  static async register(account: string, password: string): Promise<{ userId: number; token: string; tokenBalance: number }> {
    // 验证账号格式
    const accountValidation = validateAccount(account);
    if (!accountValidation.valid) {
      throw {
        code: ResponseCode.INVALID_ACCOUNT,
        message: accountValidation.error,
      };
    }

    // 验证密码复杂度
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw {
        code: ResponseCode.INVALID_PASSWORD,
        message: passwordValidation.error,
      };
    }

    // 生成盐值和密码哈希
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    try {
      const result = await transaction(async (client) => {
        // 检查账号是否已存在
        const userCheck = await client.query(
          'SELECT id FROM users WHERE account = $1',
          [account],
        );

        if (userCheck.rows.length > 0) {
          throw {
            code: ResponseCode.ACCOUNT_ALREADY_EXISTS,
            message: '账号已存在',
          };
        }

        // 创建用户
        const userResult = await client.query(
          `INSERT INTO users (account, password_hash, salt, user_type, account_status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [account, passwordHash, salt, 'free', 'normal'],
        );

        const userId = userResult.rows[0].id;

        // 初始化 Token 账户
        const freeTokenQuota = parseInt(process.env.FREE_TOKEN_QUOTA || '10000');
        await client.query(
          `INSERT INTO token_accounts (user_id, available_balance, total_used, total_recharged, account_status)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, freeTokenQuota, 0, 0, 'normal'],
        );

        // 生成 JWT Token
        const token = AuthService.generateToken(userId);

        return { userId, token, tokenBalance: freeTokenQuota };
      });

      return result;
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ResponseCode.DATABASE_ERROR,
        message: '注册失败，请重试',
      };
    }
  }

  /**
   * 用户登录
   */
  static async login(account: string, password: string, ip: string): Promise<{ userId: number; token: string; tokenBalance: number }> {
    // 验证账号格式
    const accountValidation = validateAccount(account);
    if (!accountValidation.valid) {
      throw {
        code: ResponseCode.INVALID_ACCOUNT,
        message: accountValidation.error,
      };
    }

    // 检查账号是否被锁定
    const redis = getRedisClient();
    const lockKey = `account_lock:${account}`;
    const isLocked = await redis.get(lockKey);

    if (isLocked) {
      throw {
        code: ResponseCode.ACCOUNT_LOCKED,
        message: '账号已被锁定，请稍后再试',
      };
    }

    try {
      // 查询用户信息
      const result = await query(
        `SELECT u.id, u.account, u.password_hash, u.salt, u.account_status, ta.available_balance
         FROM users u
         LEFT JOIN token_accounts ta ON u.id = ta.user_id
         WHERE u.account = $1`,
        [account],
      );

      if (result.rows.length === 0) {
        // 记录失败次数
        const failureCountKey = `login_failure:${account}`;
        const failureCount = await redis.incr(failureCountKey);
        await redis.expire(failureCountKey, 3600); // 1小时内计数

        if (failureCount >= FAILURE_THRESHOLD) {
          await redis.setex(lockKey, LOCK_DURATION, '1');
          throw {
            code: ResponseCode.ACCOUNT_LOCKED,
            message: '登录失败次数过多，账号已被锁定',
          };
        }

        throw {
          code: ResponseCode.ACCOUNT_OR_PASSWORD_ERROR,
          message: '账号或密码错误',
        };
      }

      const user = result.rows[0];

      // 检查账号状态
      if (user.account_status !== 'normal') {
        throw {
          code: ResponseCode.ACCOUNT_DISABLED,
          message: '账号已禁用',
        };
      }

      // 验证密码
      const passwordMatch = verifyPassword(password, user.password_hash, user.salt);

      if (!passwordMatch) {
        // 记录失败次数
        const failureCountKey = `login_failure:${account}`;
        const failureCount = await redis.incr(failureCountKey);
        await redis.expire(failureCountKey, 3600);

        if (failureCount >= FAILURE_THRESHOLD) {
          await redis.setex(lockKey, LOCK_DURATION, '1');
          throw {
            code: ResponseCode.ACCOUNT_LOCKED,
            message: '登录失败次数过多，账号已被锁定',
          };
        }

        throw {
          code: ResponseCode.ACCOUNT_OR_PASSWORD_ERROR,
          message: '账号或密码错误',
        };
      }

      // 清除失败计数
      await redis.del(`login_failure:${account}`);

      // 生成 Token
      const token = await this.generateToken(user.id);

      return {
        userId: user.id,
        token,
        tokenBalance: user.available_balance || 0,
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ResponseCode.DATABASE_ERROR,
        message: '登录失败，请重试',
      };
    }
  }

  /**
   * 生成 JWT Token
   */
  static generateToken(userId: number): string {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'default_secret';
    const expiresIn = process.env.JWT_EXPIRATION || '7d';

    return jwt.sign(
      {
        userId,
        iat: Math.floor(Date.now() / 1000),
      },
      secret,
      { expiresIn },
    );
  }

  /**
   * 验证 Token
   */
  static async verifyToken(token: string): Promise<{ userId: number }> {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'default_secret';

    try {
      const decoded = jwt.verify(token, secret);
      return { userId: decoded.userId };
    } catch (error) {
      throw {
        code: ResponseCode.INVALID_TOKEN,
        message: 'Token 无效或已过期',
      };
    }
  }

  /**
   * 解锁账号
   */
  static async unlockAccount(account: string): Promise<void> {
    const redis = getRedisClient();
    const lockKey = `account_lock:${account}`;
    await redis.del(lockKey);
  }
}
