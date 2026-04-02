import { Router, Request, Response, NextFunction } from 'express';
import { TokenService } from '@services/token.service';
import { errorResponse, successResponse, listResponse } from '@utils/constants';
import { validateRechargeAmount } from '@utils/validators';

const router = Router();

/**
 * 查询 Token 余额
 * GET /api/token/balance
 * 需要认证
 */
router.get('/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json(errorResponse(2004, '用户未认证'));
    }

    const balance = await TokenService.getTokenBalance(userId);

    return res.status(200).json(
      successResponse({
        availableBalance: balance.availableBalance,
        totalUsed: balance.totalUsed,
        totalRecharged: balance.totalRecharged,
        lastUpdated: new Date().toISOString(),
      }, '查询成功')
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 查询 Token 消费日志
 * GET /api/token/logs?pageNum=1&pageSize=20
 * 需要认证
 */
router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const pageNum = Math.max(1, parseInt(req.query.pageNum as string) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20);

    if (!userId) {
      return res.status(401).json(errorResponse(2004, '用户未认证'));
    }

    // 获取日志
    const logs = await TokenService.getTokenLogs(userId, pageNum, pageSize);

    return res.status(200).json(
      listResponse(
        logs.data.map((log) => ({
          id: log.id,
          deductionAmount: log.deduction_amount,
          remainingBalance: log.remaining_balance,
          businessType: log.business_type,
          businessId: log.business_id,
          timestamp: log.timestamp,
        })),
        logs.total,
        pageNum,
        pageSize,
        '查询成功'
      )
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 查询 Token 使用统计
 * GET /api/token/statistics
 * 需要认证
 */
router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json(errorResponse(2004, '用户未认证'));
    }

    const balance = await TokenService.getTokenBalance(userId);
    const logs = await TokenService.getTokenLogs(userId, 1, 1);

    // 计算平均消费
    const averageConsumption = logs.total > 0 
      ? Math.round(balance.totalUsed / logs.total)
      : 0;

    return res.status(200).json(
      successResponse({
        totalTokens: balance.availableBalance + balance.totalUsed,
        availableBalance: balance.availableBalance,
        totalUsed: balance.totalUsed,
        totalRecharged: balance.totalRecharged,
        averageConsumption,
        usageRate: balance.totalUsed > 0 
          ? Math.round((balance.totalUsed / (balance.totalUsed + balance.availableBalance)) * 100)
          : 0,
        lastUpdated: new Date().toISOString(),
      }, '查询成功')
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 预检查 Token 余额
 * POST /api/token/check
 * 需要认证
 */
router.post('/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { amount } = req.body;

    if (!userId) {
      return res.status(401).json(errorResponse(2004, '用户未认证'));
    }

    // 验证金额
    const { error } = validateRechargeAmount(amount);
    if (error) {
      return res.status(400).json(errorResponse(1002, (error as any).message || String(error)));
    }

    // 检查余额
    const hasEnough = await TokenService.checkTokenBalance(userId, amount);

    return res.status(200).json(
      successResponse({
        hasEnough,
        requiredAmount: amount,
      }, '检查成功')
    );
  } catch (error: any) {
    next(error);
  }
});

export default router;
