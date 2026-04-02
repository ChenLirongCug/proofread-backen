import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { query } from './database/connection';
import { initializeDatabase } from './database/migrations';
import dotenv from 'dotenv';
import * as SessionService from './services/session.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const FREE_TRIAL_CHARS = 300;

// 登录失败锁定记录
interface LoginAttempt {
  count: number;
  lockUntil?: number;
  firstAttempt: number;
}

const loginAttempts = new Map<string, LoginAttempt>(); // account -> attempt info
const ipLoginAttempts = new Map<string, LoginAttempt>(); // IP -> attempt info

// 配置
const MAX_LOGIN_ATTEMPTS = 5; // 最大尝试次数
const LOCK_DURATION = 30 * 60 * 1000; // 锁定时长：30分钟
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 尝试窗口：15分钟
const IP_MAX_ATTEMPTS = 20; // IP每小时最大尝试次数
const IP_ATTEMPT_WINDOW = 60 * 60 * 1000; // IP限流窗口：1小时

// 清理过期的登录尝试记录（每5分钟）
setInterval(() => {
  const now = Date.now();
  
  // 清理账号锁定记录
  for (const [account, attempt] of loginAttempts.entries()) {
    if (attempt.lockUntil && attempt.lockUntil < now) {
      loginAttempts.delete(account);
    } else if (!attempt.lockUntil && (now - attempt.firstAttempt) > ATTEMPT_WINDOW) {
      loginAttempts.delete(account);
    }
  }
  
  // 清理IP限流记录
  for (const [ip, attempt] of ipLoginAttempts.entries()) {
    if ((now - attempt.firstAttempt) > IP_ATTEMPT_WINDOW) {
      ipLoginAttempts.delete(ip);
    }
  }
  
  console.log(`🧹 清理登录尝试记录 - 账号: ${loginAttempts.size}, IP: ${ipLoginAttempts.size}`);
}, 5 * 60 * 1000);

// 记录失败尝试的辅助函数
function recordFailedAttempt(account: string, ip: string): boolean {
  const now = Date.now();
  
  // 记录账号失败次数
  const accountAttempt = loginAttempts.get(account);
  if (accountAttempt) {
    // 检查是否在尝试窗口内
    if ((now - accountAttempt.firstAttempt) < ATTEMPT_WINDOW) {
      accountAttempt.count++;
      loginAttempts.set(account, accountAttempt);
      
      // 检查是否达到锁定阈值
      if (accountAttempt.count >= MAX_LOGIN_ATTEMPTS) {
        return true; // 需要锁定
      }
    } else {
      // 超过窗口，重置计数
      loginAttempts.set(account, { count: 1, firstAttempt: now });
    }
  } else {
    loginAttempts.set(account, { count: 1, firstAttempt: now });
  }
  
  // 记录IP尝试次数
  const ipAttempt = ipLoginAttempts.get(ip);
  if (ipAttempt) {
    if ((now - ipAttempt.firstAttempt) < IP_ATTEMPT_WINDOW) {
      ipAttempt.count++;
      ipLoginAttempts.set(ip, ipAttempt);
    } else {
      ipLoginAttempts.set(ip, { count: 1, firstAttempt: now });
    }
  } else {
    ipLoginAttempts.set(ip, { count: 1, firstAttempt: now });
  }
  
  return false; // 不需要锁定
}

// 安全中间件 - helmet
app.use(helmet());

// 中间件
app.use(cors({
  origin: function(origin, callback) {
    // 允许所有localhost来源（开发环境）
    if (!origin || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(null, true); // 开发环境允许所有来源
    }
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📥 ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// 提供静态文件（用于测试页面）
app.use(express.static('.'));

// JWT 认证中间件（包含session验证）
const authenticateToken = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 2004, message: '缺少认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.token = token;
    
    // 验证会话是否有效
    const isValidSession = await SessionService.validateSession(req.userId, token);
    if (!isValidSession) {
      return res.status(401).json({
        code: 2004,
        message: '会话已失效，请重新登录'
      });
    }
    
    // 更新会话活跃时间
    await SessionService.updateSessionActivity(req.userId, token);
    
    next();
  } catch (error) {
    res.status(401).json({ code: 2004, message: '无效的令牌' });
  }
};

async function getOrCreateActiveUserByAccount(account: string, registrationIp = '127.0.0.1') {
  const safeAccount = String(account || '').trim();
  if (!safeAccount) {
    throw new Error('账号不能为空');
  }

  const existing = await query(
    'SELECT id, account, token_balance FROM users WHERE account = $1 AND account_status = $2',
    [safeAccount, 'active']
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  try {
    const created = await query(
      'INSERT INTO users (account, user_type, account_status, token_balance, registration_ip) VALUES ($1, $2, $3, $4, $5) RETURNING id, account, token_balance',
      [safeAccount, 'free', 'active', FREE_TRIAL_CHARS, registrationIp]
    );
    return created.rows[0];
  } catch (error: any) {
    if (error?.code === '23505') {
      const retry = await query(
        'SELECT id, account, token_balance FROM users WHERE account = $1 AND account_status = $2',
        [safeAccount, 'active']
      );
      if (retry.rows.length > 0) return retry.rows[0];
    }
    throw error;
  }
}

async function resolveBillingUser(req: any, accountInput?: string) {
  const safeAccount = String(accountInput || '').trim();
  const clientIp = (req.ip || req.headers['x-forwarded-for'] || '127.0.0.1') as string;
  const ipAddress = Array.isArray(clientIp) ? clientIp[0] : clientIp;

  if (safeAccount) {
    return getOrCreateActiveUserByAccount(safeAccount, ipAddress);
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    throw Object.assign(new Error('账号不能为空'), { statusCode: 400, code: 1001 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const result = await query(
      'SELECT id, account, token_balance FROM users WHERE id = $1 AND account_status = $2',
      [decoded.userId, 'active']
    );
    if (result.rows.length === 0) {
      throw Object.assign(new Error('用户不存在'), { statusCode: 404, code: 2001 });
    }
    return result.rows[0];
  } catch (error: any) {
    if (error?.statusCode) throw error;
    throw Object.assign(new Error('无效的令牌'), { statusCode: 401, code: 2004 });
  }
}

// ===== 认证接口 =====

// 注册
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { account } = req.body;

    if (!account) {
      return res.status(400).json({ code: 1001, message: '账号不能为空' });
    }
    // 获取请求IP
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
    const registrationIp = Array.isArray(clientIp) ? clientIp[0] : clientIp;

    // 检查该IP在过去1小时内是否已注册过账号（频率限制）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRegistrations = await query(
      'SELECT COUNT(*) as count FROM users WHERE registration_ip = $1 AND created_at > $2',
      [registrationIp, oneHourAgo]
    );

    if (parseInt(recentRegistrations.rows[0].count) >= 1) {
      return res.status(429).json({ 
        code: 4001, 
        message: '注册过于频繁，请1小时后再试' 
      });
    }
    // 检查账号是否已存在
    const existingUser = await query(
      'SELECT id FROM users WHERE account = $1',
      [account]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ code: 2005, message: '账号已存在' });
    }

    // 插入用户（记录注册IP）
    const result = await query(
      'INSERT INTO users (account, user_type, account_status, token_balance, registration_ip) VALUES ($1, $2, $3, $4, $5) RETURNING id, account, token_balance',
      [account, 'free', 'active', FREE_TRIAL_CHARS, registrationIp]
    );

    const user = result.rows[0];

    // 生成 JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      code: 0,
      message: '注册成功',
      data: {
        userId: user.id,
        account: user.account,
        token,
        tokenBalance: user.token_balance,
      },
    });
  } catch (error: any) {
    console.error('❌ Register error:', error.message || error);
    res.status(500).json({ code: 5000, message: '服务器错误', error: error.message });
  }
});

// 登录
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    console.log('🔐 登录请求 - account:', req.body.account);
    const { account, deviceName } = req.body;

    if (!account) {
      console.log('❌ 账号为空');
      return res.status(400).json({ code: 1001, message: '账号不能为空' });
    }

    // 获取客户端IP
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || '127.0.0.1') as string;
    const ipAddress = Array.isArray(clientIp) ? clientIp[0] : clientIp;

    // 1. 检查IP级别限流
    const ipAttempt = ipLoginAttempts.get(ipAddress);
    if (ipAttempt) {
      const timeSinceFirst = Date.now() - ipAttempt.firstAttempt;
      
      if (timeSinceFirst < IP_ATTEMPT_WINDOW && ipAttempt.count >= IP_MAX_ATTEMPTS) {
        const remainingMinutes = Math.ceil((IP_ATTEMPT_WINDOW - timeSinceFirst) / 60000);
        console.log(`🚫 IP限流: ${ipAddress} - ${ipAttempt.count}次尝试`);
        return res.status(429).json({
          code: 4003,
          message: `登录尝试过于频繁，请${remainingMinutes}分钟后再试`,
          retryAfter: remainingMinutes
        });
      }
      
      // 重置过期的IP记录
      if (timeSinceFirst >= IP_ATTEMPT_WINDOW) {
        ipLoginAttempts.delete(ipAddress);
      }
    }

    // 2. 检查账号是否被锁定
    const attempt = loginAttempts.get(account);
    if (attempt && attempt.lockUntil) {
      if (Date.now() < attempt.lockUntil) {
        const remainingMinutes = Math.ceil((attempt.lockUntil - Date.now()) / 60000);
        console.log(`🔒 账号已锁定: ${account} - 剩余${remainingMinutes}分钟`);
        return res.status(429).json({
          code: 4002,
          message: `账号已锁定，请${remainingMinutes}分钟后再试`,
          retryAfter: remainingMinutes,
          lockedUntil: new Date(attempt.lockUntil).toISOString()
        });
      } else {
        // 锁定时间已过，清除记录
        loginAttempts.delete(account);
      }
    }

    const result = await query(
      'SELECT id, token_balance FROM users WHERE account = $1 AND account_status = $2',
      [account, 'active']
    );

    if (result.rows.length === 0) {
      console.log('❌ 用户不存在或已禁用:', account);
      return res.status(401).json({ code: 2002, message: '账号不存在或已禁用' });
    }

    const user = result.rows[0];

    // 登录成功，清除失败记录
    loginAttempts.delete(account);
    console.log(`✅ 登录成功 - 清除失败记录: ${account}`);

    // 生成设备ID
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const deviceId = SessionService.generateDeviceId(userAgent, ipAddress);

    // 检查是否在其他设备登录
    const existingSession = await SessionService.checkExistingSession(user.id, deviceId);
    
    if (existingSession) {
      console.log('⚠️  用户已在其他设备登录');
      // 踢出其他设备
      const kickedCount = await SessionService.kickOtherSessions(user.id, deviceId);
      console.log(`🚪 已踢出 ${kickedCount} 个其他设备的会话`);
    }

    // 生成 JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // 创建新会话
    await SessionService.createSession({
      userId: user.id,
      token,
      deviceId,
      deviceName: deviceName || 'Office Word加载项',
      ipAddress,
      userAgent,
    });

    // 记录登录
    await query(
      'INSERT INTO login_logs (user_id, account, login_ip, is_success) VALUES ($1, $2, $3, $4)',
      [user.id, account, ipAddress, true]
    );

    console.log('✅ 登录成功 - userId:', user.id);
    res.status(200).json({
      code: 0,
      message: '登录成功',
      data: {
        userId: user.id,
        account,
        token,
        tokenBalance: user.token_balance,
      },
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});


// MAC地址自动登录（无密码，用于Office插件）
app.post('/api/auth/auto-login', async (req: Request, res: Response) => {
  try {
    const { account } = req.body;
    if (!account) {
      return res.status(400).json({ code: 1001, message: '账号不能为空' });
    }
    // 查找用户
    let userResult = await query('SELECT id, account, token_balance FROM users WHERE account = $1', [account]);
    let user;
    if (userResult.rows.length === 0) {
      // 新用户自动注册
      const insertResult = await query(
        'INSERT INTO users (account, user_type, account_status, token_balance, registration_ip) VALUES ($1, $2, $3, $4, $5) RETURNING id, account, token_balance',
        [account, 'mac_user', 'active', FREE_TRIAL_CHARS, '127.0.0.1']
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ code: 0, message: '登录成功', data: { userId: user.id, account: user.account, token } });
  } catch (error: any) {
    console.error('❌ Auto-login error:', error.message);
    res.status(500).json({ code: 5000, message: '服务器错误', error: error.message });
  }
});

// 登出
app.post('/api/auth/logout', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const token = req.token;

    if (!userId || !token) {
      return res.status(400).json({ code: 1001, message: '无效的请求' });
    }

    // 删除会话
    await SessionService.deleteSession(userId, token);

    console.log('✅ 登出成功 - userId:', userId);
    res.status(200).json({
      code: 0,
      message: '登出成功'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 验证 token
app.get('/api/auth/verify', authenticateToken, async (req: any, res: Response) => {
  try {
    const result = await query(
      'SELECT id, account FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '用户不存在' });
    }

    const user = result.rows[0];
    res.json({
      code: 0,
      message: '令牌有效',
      data: {
        userId: user.id,
        account: user.account,
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// ===== Token 接口 =====

// 查询 Token 余额
app.get('/api/token/balance', authenticateToken, async (req: any, res: Response) => {
  try {
    const result = await query(
      'SELECT token_balance FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '用户不存在' });
    }

    const user = result.rows[0];

    // 查询总消耗
    const logsResult = await query(
      'SELECT COALESCE(SUM(deduction_amount), 0) as total_used FROM token_logs WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      code: 0,
      message: '查询成功',
      data: {
        availableBalance: user.token_balance,
        totalUsed: logsResult.rows[0].total_used || 0,
        totalRecharged: 0,
      },
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 按账号查询 Token 余额（免登录，用于本地账号直连模式）
app.get('/api/token/account-balance', async (req: Request, res: Response) => {
  try {
    const account = String(req.query.account || '').trim();
    if (!account) {
      return res.status(400).json({ code: 1001, message: '账号不能为空' });
    }

    const clientIp = (req.ip || req.headers['x-forwarded-for'] || '127.0.0.1') as string;
    const ipAddress = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    const user = await getOrCreateActiveUserByAccount(account, ipAddress);

    const logsResult = await query(
      'SELECT COALESCE(SUM(deduction_amount), 0) as total_used FROM token_logs WHERE user_id = $1',
      [user.id]
    );

    res.json({
      code: 0,
      message: '查询成功',
      data: {
        account: user.account,
        availableBalance: Number(user.token_balance || 0),
        totalUsed: Number(logsResult.rows[0].total_used || 0),
        totalRecharged: 0,
      },
    });
  } catch (error) {
    console.error('Account balance error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 查询 Token 消费历史
app.get('/api/token/logs', authenticateToken, async (req: any, res: Response) => {
  try {
    const result = await query(
      'SELECT id, deduction_amount, remaining_balance, business_type, created_at FROM token_logs WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json({
      code: 0,
      message: '查询成功',
      data: {
        logs: result.rows,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 扣减 Token（模拟审校）
app.post('/api/token/deduct', authenticateToken, async (req: any, res: Response) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 1002, message: '扣减金额必须大于 0' });
    }

    const result = await query(
      'SELECT token_balance FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '用户不存在' });
    }

    const user = result.rows[0];

    if (user.token_balance < amount) {
      return res.status(400).json({ code: 3001, message: 'Token 余额不足' });
    }

    // 更新余额
    const newBalance = user.token_balance - amount;
    await query(
      'UPDATE users SET token_balance = $1 WHERE id = $2',
      [newBalance, req.userId]
    );

    // 记录日志
    await query(
      'INSERT INTO token_logs (user_id, deduction_amount, remaining_balance, business_type, created_at) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, amount, newBalance, 'proofreading', new Date()]
    );

    res.json({
      code: 0,
      message: '扣减成功',
      data: {
        remainingBalance: newBalance,
      },
    });
  } catch (error) {
    console.error('Deduct error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 按账号扣减 Token（免登录，用于全文审校直接扣费）
app.post('/api/token/account-deduct', async (req: Request, res: Response) => {
  try {
    const { account, amount, businessType } = req.body || {};
    const safeAccount = String(account || '').trim();
    const deductAmount = Number(amount || 0);

    if (!safeAccount) {
      return res.status(400).json({ code: 1001, message: '账号不能为空' });
    }
    if (!deductAmount || deductAmount <= 0 || !Number.isFinite(deductAmount)) {
      return res.status(400).json({ code: 1002, message: '扣减金额必须大于 0' });
    }

    const clientIp = (req.ip || req.headers['x-forwarded-for'] || '127.0.0.1') as string;
    const ipAddress = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    const user = await getOrCreateActiveUserByAccount(safeAccount, ipAddress);

    const updateResult = await query(
      'UPDATE users SET token_balance = token_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND token_balance >= $1 RETURNING token_balance',
      [deductAmount, user.id]
    );

    if (updateResult.rows.length === 0) {
      const latest = await query('SELECT token_balance FROM users WHERE id = $1', [user.id]);
      const currentBalance = latest.rows.length > 0 ? Number(latest.rows[0].token_balance || 0) : 0;
      return res.status(400).json({
        code: 3001,
        message: 'Token 余额不足，请充值',
        data: {
          account: safeAccount,
          required: deductAmount,
          availableBalance: currentBalance,
          rechargeRule: '1元可审核1000字',
        },
      });
    }

    const newBalance = Number(updateResult.rows[0].token_balance || 0);

    await query(
      'INSERT INTO token_logs (user_id, deduction_amount, remaining_balance, business_type, created_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id, deductAmount, newBalance, businessType || 'proofreading', new Date()]
    );

    res.json({
      code: 0,
      message: '扣减成功',
      data: {
        account: safeAccount,
        deductedAmount: deductAmount,
        remainingBalance: newBalance,
      },
    });
  } catch (error) {
    console.error('Account deduct error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// ===== 支付接口 =====

// 创建充值订单（支持免登录按账号创建）
app.post('/api/payment/create-order', async (req: any, res: Response) => {
  try {
    const { amount, account } = req.body || {};
    const rechargeAmount = Number(amount || 0);

    if (!rechargeAmount || rechargeAmount <= 0) {
      return res.status(400).json({ code: 1003, message: '充值金额必须大于 0' });
    }

    const user = await resolveBillingUser(req, account);

    const useMockPayment = process.env.USE_MOCK_PAYMENT === 'true';

    if (useMockPayment) {
      // 测试模式：生成模拟订单
      const orderNumber = `RECH${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const tokenAmount = rechargeAmount * 1000;
      const expiredAt = new Date(Date.now() + 30 * 60 * 1000);

      await query(
        'INSERT INTO payment_orders (order_number, user_id, recharge_amount, token_amount, order_status, expired_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderNumber, user.id, rechargeAmount, tokenAmount, 'pending', expiredAt]
      );

      res.status(201).json({
        code: 0,
        message: '订单创建成功（测试模式）',
        data: {
          orderNumber,
          account: user.account,
          amount: rechargeAmount,
          tokenAmount,
          codeUrl: `http://123.56.67.218/api/payment/mock-pay?orderNumber=${orderNumber}`,
          testUrl: `http://123.56.67.218/api/payment/mock-pay?orderNumber=${orderNumber}`,
          isMockMode: true,
          expiresIn: 1800
        },
      });
    } else {
      // 真实微信支付
      const { PaymentService } = await import('./services/payment.service');
      const paymentResult = await PaymentService.createRechargeOrder(user.id, rechargeAmount);

      res.status(201).json({
        code: 0,
        message: '订单创建成功',
        data: {
          orderNumber: paymentResult.orderNumber,
          account: user.account,
          amount: paymentResult.totalFee,
          tokenAmount: paymentResult.tokenAmount,
          codeUrl: paymentResult.codeUrl,
          expiresIn: paymentResult.expiresIn,
        },
      });
    }
  } catch (error: any) {
    console.error('Create order error:', error);
    const statusCode = error.statusCode || 500;
    const message = error.message || '服务器错误';
    res.status(statusCode).json({ code: error.code || 5000, message });
  }
});

// 查询订单状态（支持免登录按账号查询）
app.get('/api/payment/order-status', async (req: any, res: Response) => {
  try {
    const { orderNumber, account } = req.query as Record<string, string>;
    const user = await resolveBillingUser(req, account);

    const result = await query(
      'SELECT order_number, order_status, recharge_amount, token_amount FROM payment_orders WHERE order_number = $1 AND user_id = $2',
      [orderNumber, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 4001, message: '订单不存在' });
    }

    const order = result.rows[0];
    const tokenAmount = order.token_amount;

    res.json({
      code: 0,
      message: '查询成功',
      data: {
        orderNumber: order.order_number,
        account: user.account,
        status: order.order_status,
        amount: order.recharge_amount,
        tokenAmount,
      },
    });
  } catch (error: any) {
    console.error('Order status error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ code: error.code || 5000, message: error.message || '服务器错误' });
  }
});

// 模拟支付（用于本地联调测试）
app.post('/api/payment/mock-pay', async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.query;

    const orderResult = await query(
      'SELECT id, user_id, recharge_amount, token_amount, order_status FROM payment_orders WHERE order_number = $1',
      [orderNumber]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ code: 4001, message: '订单不存在' });
    }

    const order = orderResult.rows[0];

    if (order.order_status !== 'pending') {
      return res.status(400).json({ code: 4002, message: '订单不是待支付状态' });
    }

    const tokenAmount = order.token_amount;

    // 标记订单为成功
    await query(
      'UPDATE payment_orders SET order_status = $1, paid_at = $2, updated_at = $2 WHERE id = $3',
      ['success', new Date(), order.id]
    );

    // 给用户加 Token（users.token_balance）
    await query(
      'UPDATE users SET token_balance = token_balance + $1 WHERE id = $2',
      [tokenAmount, order.user_id]
    );

    // 累计到 token_accounts（存在则累加，不存在则创建）
    await query(
      `INSERT INTO token_accounts (user_id, available_balance, total_recharged, total_used, account_status, created_at, updated_at)
       VALUES ($1, $2, $2, 0, 'normal', NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET available_balance = token_accounts.available_balance + EXCLUDED.available_balance,
                     total_recharged = token_accounts.total_recharged + EXCLUDED.total_recharged,
                     updated_at = NOW();`,
      [order.user_id, tokenAmount]
    );

    // 记录充值日志
    await query(
      'INSERT INTO recharge_logs (user_id, order_number, recharge_amount, token_amount, payment_status, payment_channel, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [order.user_id, orderNumber, order.recharge_amount, tokenAmount, 'success', 'wechat_native', new Date()]
    );

    res.json({
      code: 0,
      message: '模拟支付成功（仅用于测试）',
      data: {
        orderNumber,
        status: 'success',
        tokenAmount,
      },
    });
  } catch (error) {
    console.error('Mock pay error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// ===== 微信支付v3辅助函数 =====

/**
 * 验证微信支付v3回调签名
 */
function verifyWechatV3Signature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  platformCertPath?: string
): boolean {
  const signString = `${timestamp}\n${nonce}\n${body}\n`;
  
  try {
    // 如果提供了平台证书，使用证书验签
    if (platformCertPath && fs.existsSync(platformCertPath)) {
      const platformCert = fs.readFileSync(platformCertPath, 'utf8');
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signString);
      const isValid = verify.verify(platformCert, signature, 'base64');
      
      if (isValid) {
        console.log('✅ 微信签名验证成功');
      } else {
        console.error('❌ 微信签名验证失败');
      }
      
      return isValid;
    }
    
    // 如果没有平台证书，记录警告但允许通过（仅用于开发环境）
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ 生产环境必须配置平台证书！');
      return false;
    }
    
    console.warn('⚠️  警告: 平台证书未找到，跳过签名验证（仅开发环境）');
    return true;
  } catch (error) {
    console.error('❌ 签名验证异常:', error);
    return false;
  }
}

/**
 * 解密微信支付v3回调数据
 */
function decryptWechatV3Data(
  associatedData: string,
  nonce: string,
  ciphertext: string,
  apiV3Key: string
): any {
  try {
    // 将ciphertext从base64解码
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
    
    // 提取tag (最后16字节)
    const authTag = ciphertextBuffer.slice(-16);
    const encryptedData = ciphertextBuffer.slice(0, -16);
    
    // 创建解密器 (AES-256-GCM)
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(nonce, 'utf8')
    );
    
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    
    // 解密
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    const result = JSON.parse(decrypted.toString('utf8'));
    console.log('✅ 回调数据解密成功');
    
    return result;
  } catch (error) {
    console.error('❌ 解密失败:', error);
    throw new Error('Failed to decrypt callback data');
  }
}

// 微信支付回调接口（v3 API）
// 注意：此路由不需要JWT认证，但需要验证微信签名
app.post('/api/wxpay/callback', async (req: Request, res: Response) => {
  try {
    // 获取请求体（原始字符串格式）
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    // 获取微信签名验证所需的头部信息
    const timestamp = req.headers['wechatpay-timestamp'] as string;
    const nonce = req.headers['wechatpay-nonce'] as string;
    const signature = req.headers['wechatpay-signature'] as string;
    const serial = req.headers['wechatpay-serial'] as string;
    
    console.log('📥 收到微信支付回调:', {
      timestamp,
      nonce,
      signature: signature?.substring(0, 20) + '...',
      serial
    });

    if (!timestamp || !nonce || !signature) {
      console.error('❌ 缺少签名头部信息');
      return res.status(400).json({
        code: 'FAIL',
        message: '缺少签名头部'
      });
    }

    // 1. 验证微信签名
    const platformCertPath = process.env.WECHAT_PLATFORM_CERT_PATH;
    const isValidSignature = verifyWechatV3Signature(
      timestamp,
      nonce,
      body,
      signature,
      platformCertPath
    );
    
    if (!isValidSignature) {
      console.error('❌ 签名验证失败');
      return res.status(401).json({
        code: 'FAIL',
        message: '签名验证失败'
      });
    }

    // 2. 解析回调数据
    const callbackData = JSON.parse(body);
    console.log('📦 回调数据类型:', callbackData.event_type);

    // 3. 解密资源数据
    const apiV3Key = process.env.WECHAT_API_V3_KEY || process.env.WECHAT_API_KEY;
    if (!apiV3Key) {
      console.error('❌ 未配置API V3密钥');
      return res.status(500).json({
        code: 'ERROR',
        message: '服务器配置错误'
      });
    }

    const resource = callbackData.resource;
    const decryptedData = decryptWechatV3Data(
      resource.associated_data,
      resource.nonce,
      resource.ciphertext,
      apiV3Key
    );

    console.log('🔓 解密后的支付数据:', {
      out_trade_no: decryptedData.out_trade_no,
      transaction_id: decryptedData.transaction_id,
      trade_state: decryptedData.trade_state,
      amount: decryptedData.amount
    });

    // 4. 提取支付信息
    const orderNumber = decryptedData.out_trade_no;
    const totalFee = decryptedData.amount.total; // 单位：分
    const transactionId = decryptedData.transaction_id;
    const tradeState = decryptedData.trade_state;

    // 5. 检查支付状态
    if (tradeState !== 'SUCCESS') {
      console.warn('⚠️  支付状态非成功:', tradeState);
      return res.status(200).json({
        code: 'FAIL',
        message: '支付未成功'
      });
    }

    // 6. 查询订单
    const orderResult = await query(
      'SELECT id, user_id, recharge_amount, token_amount, order_status FROM payment_orders WHERE order_number = $1',
      [orderNumber]
    );

    if (orderResult.rows.length === 0) {
      console.error('❌ 订单不存在:', orderNumber);
      return res.status(404).json({
        code: 'FAIL',
        message: '订单不存在'
      });
    }

    const order = orderResult.rows[0];

    // 7. 检查订单状态（防止重复处理）
    if (order.order_status !== 'pending') {
      console.warn('⚠️  订单已处理，跳过:', {
        orderNumber,
        currentStatus: order.order_status
      });
      // 返回成功，避免微信重复推送
      return res.status(204).send();
    }

    // 8. 验证金额一致性
    const orderAmountFen = Math.floor(order.recharge_amount * 100);
    if (orderAmountFen !== totalFee) {
      console.error('❌ 金额不一致:', {
        orderAmount: orderAmountFen,
        paidAmount: totalFee
      });
      return res.status(400).json({
        code: 'FAIL',
        message: '金额不一致'
      });
    }

    // 9. 处理支付成功：更新订单并发放Token
    console.log('💰 开始处理支付成功逻辑...');
    
    try {
      // 使用事务确保数据一致性
      await query('BEGIN');

      // 9.1 更新订单状态
      await query(
        `UPDATE payment_orders 
         SET order_status = $1, 
             wechat_transaction_id = $2, 
             paid_at = CURRENT_TIMESTAMP, 
             updated_at = CURRENT_TIMESTAMP
         WHERE order_number = $3`,
        ['success', transactionId, orderNumber]
      );
      console.log('✅ 订单状态已更新为success');

      // 9.2 给用户增加Token余额
      await query(
        'UPDATE users SET token_balance = token_balance + $1 WHERE id = $2',
        [order.token_amount, order.user_id]
      );
      console.log('✅ 用户Token余额已增加:', order.token_amount);

      // 9.3 更新token_accounts表
      await query(
        `INSERT INTO token_accounts (user_id, available_balance, total_recharged, total_used, account_status, created_at, updated_at)
         VALUES ($1, $2, $2, 0, 'normal', NOW(), NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET 
           available_balance = token_accounts.available_balance + EXCLUDED.available_balance,
           total_recharged = token_accounts.total_recharged + EXCLUDED.total_recharged,
           updated_at = NOW()`,
        [order.user_id, order.token_amount]
      );
      console.log('✅ token_accounts已更新');

      // 9.4 记录充值日志
      await query(
        `INSERT INTO recharge_logs 
         (user_id, order_number, recharge_amount, token_amount, payment_status, payment_channel, wechat_transaction_id, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [order.user_id, orderNumber, order.recharge_amount, order.token_amount, 'success', 'wechat_native', transactionId]
      );
      console.log('✅ 充值日志已记录');

      // 提交事务
      await query('COMMIT');
      console.log('✅ 事务提交成功');

      console.log('🎉 支付回调处理完成:', {
        orderNumber,
        userId: order.user_id,
        tokenAmount: order.token_amount,
        transactionId
      });

      // v3 API回调成功返回HTTP 204无内容
      return res.status(204).send();
      
    } catch (dbError: any) {
      // 回滚事务
      await query('ROLLBACK');
      console.error('❌ 数据库操作失败，事务已回滚:', dbError);
      
      return res.status(500).json({
        code: 'ERROR',
        message: '订单处理失败'
      });
    }
    
  } catch (error: any) {
    console.error('❌ 微信支付回调处理失败:', error);
    return res.status(500).json({
      code: 'ERROR',
      message: '系统错误'
    });
  }
});

// 健康检查
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});


// ==================== Dify 代理接口 ====================
// 旧接口（保留兼容性）
app.post('/api/dify/chat-messages', authenticateToken, async (req: any, res: Response) => {
  try {
    const difyUrl = process.env.DIFY_WORKFLOW_URL || 'http://123.56.67.218:9090/v1/chat-messages';
    const difyApiKey = process.env.DIFY_API_KEY;
    
    if (!difyApiKey) {
      return res.status(500).json({ error: '服务器未配置Dify API Key' });
    }
    
    console.log('📡 Dify代理请求:', { userId: req.userId, url: difyUrl, body: req.body });
    
    // 构建符合Dify API的请求体
    const payload = {
      inputs: req.body.inputs || {},
      query: req.body.query || req.body.text || '',
      response_mode: 'blocking',
      user: `user_${req.userId}`,
      conversation_id: req.body.conversation_id || ''
    };
    
    const response = await fetch(difyUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${difyApiKey}` 
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log('✅ Dify响应:', { status: response.status, success: response.ok });
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('❌ Dify代理错误:', error);
    res.status(500).json({ error: 'Dify API调用失败', message: error.message });
  }
});

// 新接口（推荐使用）
app.post('/api/dify/chat', authenticateToken, async (req: any, res: Response) => {
  try {
    const difyUrl = process.env.DIFY_WORKFLOW_URL || 'http://123.56.67.218:9090/v1/chat-messages';
    const difyApiKey = process.env.DIFY_API_KEY;
    
    if (!difyApiKey) {
      return res.status(500).json({ error: '服务器未配置Dify API Key' });
    }
    
    console.log('📡 Dify Chat请求:', { userId: req.userId, query: req.body.query?.substring(0, 50) });
    
    // 构建符合Dify API的请求体
    const payload = {
      inputs: req.body.inputs || {},
      query: req.body.query || req.body.text || '',
      response_mode: 'blocking',
      user: `user_${req.userId}`,
      conversation_id: req.body.conversation_id || ''
    };
    
    const response = await fetch(difyUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${difyApiKey}` 
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log('✅ Dify响应成功');
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('❌ Dify Chat错误:', error);
    res.status(500).json({ error: 'Dify API调用失败', message: error.message });
  }
});


// ==================== Dify 批量并行接口（后端通道） ====================
const DIFY_BATCH_KEYS = (process.env.DIFY_BATCH_API_KEYS || '')
  .split(/[\s,;|]+/).filter(Boolean);
let difyBatchKeyCursor = 0;

function pickBatchKey(): string {
  if (DIFY_BATCH_KEYS.length === 0) throw new Error('No DIFY_BATCH_API_KEYS configured');
  const key = DIFY_BATCH_KEYS[difyBatchKeyCursor % DIFY_BATCH_KEYS.length];
  difyBatchKeyCursor++;
  return key;
}

async function callDifySingle(
  text: string, user: string, timeoutMs = 55000
): Promise<{ answer: string; metadata?: any }> {
  const difyUrl = process.env.DIFY_WORKFLOW_URL || 'http://123.56.67.218:9090/v1/chat-messages';
  const apiKey = pickBatchKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(difyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: {},
        query: text,
        response_mode: 'blocking',
        user
      }),
      signal: controller.signal
    });

    if (!resp.ok) throw new Error(`Dify HTTP ${resp.status}`);

    const data: any = await resp.json();
    return { answer: data.answer || '', metadata: data.metadata || null };
  } finally {
    clearTimeout(timer);
  }
}


// 单句后端 Dify 审校（使用 BATCH keys，与前端 webpack proxy keys 隔离）
app.post('/api/dify/backend-chat', async (req: any, res: Response) => {
  try {
    const { query, user } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }
    if (DIFY_BATCH_KEYS.length === 0) {
      return res.status(500).json({ error: 'DIFY_BATCH_API_KEYS not configured' });
    }
    const result = await callDifySingle(query.trim(), user || 'backend-user');
    res.json({
      answer: result.answer,
      conversation_id: '',
      message_id: '',
      mode: 'advanced-chat',
      created_at: Math.floor(Date.now() / 1000),
      metadata: result.metadata || {},
    });
  } catch (error: any) {
    console.error('backend-chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dify/batch-proofread', async (req: any, res: Response) => {
  try {
    const { sentences, sessionId } = req.body;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({ error: 'sentences 必须是非空数组' });
    }
    if (sentences.length > 50) {
      return res.status(400).json({ error: '单批不超过50句' });
    }
    if (DIFY_BATCH_KEYS.length === 0) {
      return res.status(500).json({ error: '服务器未配置 DIFY_BATCH_API_KEYS' });
    }

    console.log(`📡 batch-proofread: ${sentences.length} 句, session=${sessionId}`);
    const MAX_CONCURRENT = Math.min(5, DIFY_BATCH_KEYS.length);
    const results: any[] = new Array(sentences.length);
    let cursor = 0;

    async function worker() {
      while (cursor < sentences.length) {
        const idx = cursor++;
        const text = (sentences[idx] || '').trim();
        if (!text) {
          results[idx] = { index: idx, status: 'fulfilled', answer: '', metadata: null };
          continue;
        }
        const user = `batch-${sessionId || req.userId}-${idx}`;
        try {
          const result = await callDifySingle(text, user);
          results[idx] = { index: idx, status: 'fulfilled', answer: result.answer, metadata: result.metadata };
        } catch (err: any) {
          results[idx] = { index: idx, status: 'rejected', error: err.message };
        }
      }
    }

    await Promise.all(Array.from({ length: MAX_CONCURRENT }, () => worker()));

    console.log(`✅ batch-proofread 完成: ${sentences.length} 句`);
    res.json({ code: 0, data: results });
  } catch (error: any) {
    console.error('❌ batch-proofread 错误:', error);
    res.status(500).json({ error: 'Batch Dify 调用失败', message: error.message });
  }
});

// ===== 调试接口 =====

// 获取所有用户（仅用于调试）
app.get('/api/debug/users', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, account, token_balance, user_type, account_status FROM users LIMIT 50'
    );

    res.json({
      code: 0,
      message: '用户列表',
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 获取数据库状态
app.get('/api/debug/db-status', async (req: Request, res: Response) => {
  try {
    const userCount = await query('SELECT COUNT(*) as count FROM users');
    const orderCount = await query('SELECT COUNT(*) as count FROM payment_orders');
    const logCount = await query('SELECT COUNT(*) as count FROM token_logs');

    res.json({
      code: 0,
      message: '数据库状态',
      data: {
        users: userCount.rows[0].count,
        orders: orderCount.rows[0].count,
        logs: logCount.rows[0].count,
      },
    });
  } catch (error) {
    console.error('DB status error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 获取Token日志
app.get('/api/debug/token_logs', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM token_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ code: 0, message: 'Token日志', data: result.rows });
  } catch (error) {
    console.error('Debug token_logs error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 获取支付订单
app.get('/api/debug/payment_orders', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ code: 0, message: '支付订单', data: result.rows });
  } catch (error) {
    console.error('Debug payment_orders error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 获取充值记录
app.get('/api/debug/recharge_logs', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM recharge_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ code: 0, message: '充值记录', data: result.rows });
  } catch (error) {
    console.error('Debug recharge_logs error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 获取登录日志
app.get('/api/debug/login_logs', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM login_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ code: 0, message: '登录日志', data: result.rows });
  } catch (error) {
    console.error('Debug login_logs error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 修改用户余额（调试接口）
app.post('/api/debug/set-balance', async (req: Request, res: Response) => {
  try {
    const { account, balance } = req.body;
    
    if (!account || balance === undefined) {
      return res.status(400).json({ code: 1001, message: '缺少必需参数: account, balance' });
    }

    // 查找用户
    const userResult = await query(
      'SELECT id FROM users WHERE account = $1',
      [account]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '用户不存在' });
    }

    const userId = userResult.rows[0].id;

    // 同时更新users表和token_accounts表的余额
    await query(
      'UPDATE users SET token_balance = $1 WHERE id = $2',
      [balance, userId]
    );
    
    await query(
      'UPDATE token_accounts SET available_balance = $1 WHERE user_id = $2',
      [balance, userId]
    );

    res.json({
      code: 0,
      message: '余额修改成功',
      data: {
        account,
        userId,
        newBalance: balance
      }
    });
  } catch (error) {
    console.error('Set balance error:', error);
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ProofRead 后端服务已启动 (PostgreSQL)                      ║
║  API 地址: http://localhost:${PORT}                             ║
║  环境: ${process.env.NODE_ENV || '开发'}                    ║
║  数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
║  调试接口:                                                   ║
║    查看用户: GET http://localhost:${PORT}/api/debug/users       ║
║    数据库状态: GET http://localhost:${PORT}/api/debug/db-status ║
║  健康检查: http://localhost:${PORT}/health                     ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  // 添加保活定时器，防止进程退出
  const keepAlive = setInterval(() => {
    // 空操作，只是保持事件循环运行
  }, 60000);
  
  // 初始化数据库（异步执行，不阻塞服务器）
  (async () => {
    try {
      await initializeDatabase();
      console.log('✅ 数据库初始化完成');
    } catch (error: any) {
      console.error('⚠️  数据库初始化失败:', error.message);
    }
    
    // 测试数据库连接
    try {
      const result = await query('SELECT 1');
      console.log('✅ 数据库连接测试成功');
    } catch (error: any) {
      console.error('❌ 数据库连接测试失败:', error.message);
      console.error('⚠️  服务器将继续运行，但数据库功能可能不可用');
    }
  })().catch(err => {
    console.error('❌ 异步初始化错误:', err);
  });
});

server.on('error', (error: any) => {
  console.error('❌ 服务器错误:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用`);
  }
});

// 防止进程退出 - 确保server对象被引用
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

console.log('🟢 服务器进程保持活动状态');

