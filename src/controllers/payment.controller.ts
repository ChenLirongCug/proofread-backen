import { Router, Request, Response, NextFunction } from 'express';
import { PaymentService } from '@services/payment.service';
import { authMiddleware, ipWhitelistMiddleware } from '@middleware/auth.middleware';
import { validateRechargeAmount } from '@utils/validators';
import { errorResponse, successResponse, listResponse } from '@utils/constants';

const router = Router();

/**
 * 创建充值订单
 * POST /api/payment/create-order
 * 需要认证
 */
router.post(
  '/create-order',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
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

      // 创建订单
      const order = await PaymentService.createRechargeOrder(userId, amount);

      return res.status(201).json(
        successResponse({
          orderNumber: order.orderNumber,
          codeUrl: order.codeUrl,
          expiresIn: order.expiresIn,
          totalFee: order.totalFee,
          tokenAmount: order.tokenAmount,
        }, '订单创建成功')
      );
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * 查询订单状态
 * GET /api/payment/order-status?orderNumber=RECH20240101...
 * 需要认证
 */
router.get(
  '/order-status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { orderNumber } = req.query;

      if (!userId) {
        return res.status(401).json(errorResponse(2004, '用户未认证'));
      }

      if (!orderNumber) {
        return res.status(400).json(errorResponse(1001, '订单号不能为空'));
      }

      // 查询订单状态
      const order = await PaymentService.queryOrderStatus(
        orderNumber as string,
        userId
      );

      return res.status(200).json(
        successResponse({
          orderNumber: order.orderNumber,
          status: order.status,
          amount: order.amount,
          tokenAmount: order.tokenAmount,
          expiresAt: order.expiresAt,
          wechatTransactionId: order.wechatTransactionId,
          createdAt: order.createdAt,
        }, '查询成功')
      );
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * 取消订单
 * POST /api/payment/cancel-order
 * 需要认证
 */
router.post(
  '/cancel-order',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { orderNumber } = req.body;

      if (!userId) {
        return res.status(401).json(errorResponse(2004, '用户未认证'));
      }

      if (!orderNumber) {
        return res.status(400).json(errorResponse(1001, '订单号不能为空'));
      }

      // 取消订单
      await PaymentService.cancelOrder(orderNumber, userId);

      return res.status(200).json(
        successResponse(null, '订单已取消')
      );
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * 查询充值历史
 * GET /api/payment/recharge-history?pageNum=1&pageSize=20
 * 需要认证
 */
router.get(
  '/recharge-history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const pageNum = Math.max(1, parseInt(req.query.pageNum as string) || 1);
      const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20);

      if (!userId) {
        return res.status(401).json(errorResponse(2004, '用户未认证'));
      }

      // 获取充值历史
      const history = await PaymentService.getRechargeHistory(userId, pageNum, pageSize);

      return res.status(200).json(
        listResponse(
          history.data.map((record) => ({
            id: record.id,
            orderNumber: record.order_number,
            amount: record.amount,
            tokenAmount: record.token_amount,
            status: record.status,
            wechatTransactionId: record.wechat_transaction_id,
            createdAt: record.created_at,
          })),
          history.total,
          pageNum,
          pageSize,
          '查询成功'
        )
      );
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * WeChat 支付回调 (v3 API)
 * POST /api/wxpay/callback
 * 不需要认证，但需要 IP 白名单验证
 */
router.post(
  '/wxpay/callback',
  ipWhitelistMiddleware(['::1', '127.0.0.1']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // v3回调使用JSON格式
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const headers = req.headers as Record<string, string>;

      if (!body) {
        return res.status(400).json({
          code: 'FAIL',
          message: '缺少参数'
        });
      }

      // 处理回调
      const result = await PaymentService.handleWechatNotify(body, headers);

      if (result.success) {
        // v3回调成功返回204无内容
        return res.status(204).send();
      } else {
        return res.status(400).json({
          code: 'FAIL',
          message: result.message
        });
      }
    } catch (error: any) {
      console.error('WeChat notify error:', error);
      return res.status(500).json({
        code: 'ERROR',
        message: '系统错误'
      });
    }
  }
);

/**
 * 获取支付统计
 * GET /api/payment/statistics
 * 需要认证
 */
router.get(
  '/statistics',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;

      if (!userId) {
        return res.status(401).json(errorResponse(2004, '用户未认证'));
      }

      // 获取充值历史统计
      const history = await PaymentService.getRechargeHistory(userId, 1, 1000);

      const totalRecharge = history.data
        .filter((r) => r.status === 'success')
        .reduce((sum, r) => sum + r.amount, 0);

      const successCount = history.data.filter((r) => r.status === 'success').length;
      const failureCount = history.data.filter((r) => r.status === 'closed').length;

      const conversionRate = Number(process.env.TOKEN_CONVERSION_RATE) || 10000;

      return res.status(200).json(
        successResponse({
          totalRecharge,
          totalTokenReceived: successCount * conversionRate,
          successCount,
          failureCount,
          successRate: history.total > 0
            ? Math.round((successCount / history.total) * 100)
            : 0,
        }, '查询成功')
      );
    } catch (error: any) {
      next(error);
    }
  }
);

export default router;
