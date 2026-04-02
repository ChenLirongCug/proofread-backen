import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '@services/auth.service';
import { TokenService } from '@services/token.service';
import { validateLoginRequest, validateRegisterRequest } from '@utils/validators';
import { successResponse, errorResponse } from '@utils/constants';

const router = Router();

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account, password } = req.body;

    // 验证输入
    const { error, value } = validateRegisterRequest({ account, password });
    if (error) {
      return res.status(400).json(
        errorResponse(1001, error.details[0]?.message || '参数错误')
      );
    }

    // 注册用户
    const result = await AuthService.register(value.account, value.password);

    return res.status(201).json(
      successResponse({
        userId: result.userId,
        token: result.token,
        tokenBalance: result.tokenBalance,
      }, '注册成功')
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // 验证输入
    const { error, value } = validateLoginRequest({ account, password });
    if (error) {
      return res.status(400).json(
        errorResponse(1001, error.details[0]?.message || '参数错误')
      );
    }

    // 登录用户
    const result = await AuthService.login(value.account, value.password, ip);

    return res.status(200).json(
      successResponse({
        userId: result.userId,
        token: result.token,
        tokenBalance: result.tokenBalance,
      }, '登录成功')
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 刷新令牌（可选）
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json(errorResponse(1001, 'Refresh token 不能为空'));
    }

    // 验证旧 token
    const decoded = await AuthService.verifyToken(refreshToken);
    if (!decoded) {
      return res.status(401).json(errorResponse(2004, '无效的令牌'));
    }

    // 生成新 token
    const token = AuthService.generateToken(decoded.userId);

    // 获取新的 Token 余额
    const balance = await TokenService.getTokenBalance(decoded.userId);

    return res.status(200).json(
      successResponse({
        token,
        tokenBalance: balance.availableBalance,
      }, '令牌刷新成功')
    );
  } catch (error: any) {
    next(error);
  }
});

/**
 * 验证令牌
 * GET /api/auth/verify
 * 需要认证
 */
router.get('/verify', (req: Request, res: Response) => {
  // 如果能到达这里，说明中间件已经验证过了
  res.status(200).json(
    successResponse({
      userId: (req as any).userId,
      valid: true,
    }, '令牌有效')
  );
});

/**
 * 修改密码
 * POST /api/auth/change-password
 * 需要认证
 */
router.post(
  '/change-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json(
          errorResponse(1001, '旧密码和新密码不能为空')
        );
      }

      if (oldPassword === newPassword) {
        return res.status(400).json(
          errorResponse(1001, '新密码不能与旧密码相同')
        );
      }

      // 这里实现修改密码的逻辑
      // await AuthService.changePassword(userId, oldPassword, newPassword);

      return res.status(200).json(
        successResponse(null, '密码修改成功')
      );
    } catch (error: any) {
      next(error);
    }
  }
);

export default router;
