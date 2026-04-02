import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { ResponseCode, errorResponse } from '../utils/constants';
import * as SessionService from '../services/session.service';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      token?: string;
    }
  }
}

/**
 * JWT 认证中间件
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(errorResponse(ResponseCode.INVALID_TOKEN));
    }

    const token = authHeader.substring(7);
    const decoded = await AuthService.verifyToken(token);

    // 验证会话是否有效
    const isValidSession = await SessionService.validateSession(decoded.userId, token);
    if (!isValidSession) {
      return res.status(401).json({
        code: ResponseCode.INVALID_TOKEN,
        message: '会话已失效，请重新登录'
      });
    }

    // 更新会话活跃时间
    await SessionService.updateSessionActivity(decoded.userId, token);

    req.userId = decoded.userId;
    req.token = token;

    next();
  } catch (error: any) {
    res.status(401).json(errorResponse(ResponseCode.INVALID_TOKEN));
  }
};

/**
 * 请求签名验证中间件
 */
export const signatureMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const nonce = req.headers['x-nonce'] as string;

  if (!signature || !timestamp || !nonce) {
    return res.status(400).json(errorResponse(ResponseCode.MISSING_REQUIRED_PARAMS));
  }

  // TODO: 实现签名验证逻辑

  next();
};

/**
 * IP 白名单中间件（用于支付回调）
 */
export const ipWhitelistMiddleware = (whitelist: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || '';

    if (!whitelist.includes(ip)) {
      return res.status(403).json(errorResponse(ResponseCode.SYSTEM_ERROR, '无效的请求来源'));
    }

    next();
  };
};

/**
 * 错误处理中间件
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  if (err.code) {
    return res.status(400).json(errorResponse(err.code, err.message));
  }

  res.status(500).json(errorResponse(ResponseCode.SYSTEM_ERROR));
};

/**
 * 请求日志中间件
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};
