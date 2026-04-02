import { query, transaction } from '../database/connection';
import { ResponseCode } from '../utils/constants';
import { getRedisClient } from '../config/redis';

const FREE_TOKEN_QUOTA = parseInt(process.env.FREE_TOKEN_QUOTA || '10000');
const TOKEN_CONVERSION_RATE = parseInt(process.env.TOKEN_CONVERSION_RATE || '10000');

/**
 * Token 额度管理服务
 */
export class TokenService {
  /**
   * 检查 Token 余额（前置校验）
   */
  static async checkTokenBalance(userId: number, requiredAmount: number = 1): Promise<boolean> {
    const redis = getRedisClient();
    const cacheKey = `token_balance:${userId}`;

    // 先从缓存查询
    const cached = await redis.get(cacheKey);
    let numericBalance: number;

    if (cached === null) {
      // 缓存未命中，从数据库查询
      const result = await query(
        'SELECT available_balance FROM token_accounts WHERE user_id = $1',
        [userId],
      );

      if (result.rows.length === 0) {
        throw {
          code: ResponseCode.TOKEN_ACCOUNT_NOT_FOUND,
          message: 'Token 账户不存在',
        };
      }

      numericBalance = Number(result.rows[0].available_balance) || 0;
      // 缓存 5 分钟
      await redis.setex(cacheKey, 300, numericBalance.toString());
    } else {
      numericBalance = parseInt(cached as string, 10) || 0;
    }

    return numericBalance >= requiredAmount;
  }

  /**
   * 扣减 Token（事务控制）
   */
  static async deductToken(userId: number, amount: number, businessType: string, businessId?: string): Promise<number> {
    const result = await transaction(async (client) => {
      // 查询当前余额
      const balanceResult = await client.query(
        'SELECT available_balance FROM token_accounts WHERE user_id = $1 FOR UPDATE',
        [userId],
      );

      if (balanceResult.rows.length === 0) {
        throw {
          code: ResponseCode.TOKEN_ACCOUNT_NOT_FOUND,
          message: 'Token 账户不存在',
        };
      }

      const currentBalance = balanceResult.rows[0].available_balance;

      // 二次校验余额
      if (currentBalance < amount) {
        throw {
          code: ResponseCode.INSUFFICIENT_TOKEN,
          message: '您的免费 Token 额度已用尽，请充值后继续使用',
        };
      }

      const newBalance = currentBalance - amount;

      // 更新余额
      await client.query(
        `UPDATE token_accounts
         SET available_balance = $1, total_used = total_used + $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [newBalance, amount, userId],
      );

      // 记录日志
      await client.query(
        `INSERT INTO token_logs (user_id, deduction_amount, remaining_balance, business_type, business_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, amount, newBalance, businessType, businessId || null],
      );

      return newBalance;
    });

    // 更新缓存
    const redis = getRedisClient();
    await redis.setex(`token_balance:${userId}`, 300, result.toString());

    return result;
  }

  /**
   * 增加 Token（充值）
   */
  static async addToken(userId: number, amount: number, orderNumber: string, transactionId?: string): Promise<number> {
    const result = await transaction(async (client) => {
      // 查询当前账户
      const accountResult = await client.query(
        'SELECT available_balance FROM token_accounts WHERE user_id = $1 FOR UPDATE',
        [userId],
      );

      if (accountResult.rows.length === 0) {
        throw {
          code: ResponseCode.TOKEN_ACCOUNT_NOT_FOUND,
          message: 'Token 账户不存在',
        };
      }

      const newBalance = accountResult.rows[0].available_balance + amount;

      // 更新余额
      await client.query(
        `UPDATE token_accounts
         SET available_balance = $1, total_recharged = total_recharged + $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [newBalance, amount, userId],
      );

      // 记录充值日志
      await client.query(
        `INSERT INTO recharge_logs (user_id, order_number, recharge_amount, token_amount, payment_status, wechat_transaction_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, orderNumber, amount / TOKEN_CONVERSION_RATE, amount, 'success', transactionId || null],
      );

      return newBalance;
    });

    // 更新缓存
    const redis = getRedisClient();
    await redis.setex(`token_balance:${userId}`, 300, result.toString());

    return result;
  }

  /**
   * 查询 Token 余额
   */
  static async getTokenBalance(userId: number): Promise<{
    availableBalance: number;
    totalUsed: number;
    totalRecharged: number;
  }> {
    const result = await query(
      'SELECT available_balance, total_used, total_recharged FROM token_accounts WHERE user_id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw {
        code: ResponseCode.TOKEN_ACCOUNT_NOT_FOUND,
        message: 'Token 账户不存在',
      };
    }

    return {
      availableBalance: result.rows[0].available_balance,
      totalUsed: result.rows[0].total_used,
      totalRecharged: result.rows[0].total_recharged,
    };
  }

  /**
   * 查询 Token 消费明细
   */
  static async getTokenLogs(userId: number, pageNum: number = 1, pageSize: number = 20): Promise<{
    data: any[];
    total: number;
  }> {
    const offset = (pageNum - 1) * pageSize;

    const countResult = await query(
      'SELECT COUNT(*) as total FROM token_logs WHERE user_id = $1',
      [userId],
    );

    const logsResult = await query(
      `SELECT * FROM token_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    );

    return {
      data: logsResult.rows,
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * 初始化新用户 Token 账户（在注册时调用）
   */
  static async initializeTokenAccount(userId: number): Promise<void> {
    await query(
      `INSERT INTO token_accounts (user_id, available_balance, total_used, total_recharged, account_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, FREE_TOKEN_QUOTA, 0, 0, 'normal'],
    );
  }

  /**
   * 清除缓存
   */
  static async clearCache(userId: number): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`token_balance:${userId}`);
  }
}
