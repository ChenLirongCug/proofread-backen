import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './database/connection';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

// 简单的内存数据存储（开发/测试用）
interface User {
  id: number;
  account: string;
  password: string;
  tokenBalance: number;
}

interface TokenLog {
  id: number;
  userId: number;
  amount: number;
  timestamp: string;
  type: string;
}

const users: User[] = [];
let userIdCounter = 1;

const tokenLogs: TokenLog[] = [];
let tokenLogIdCounter = 1;

// 中间件
app.use(cors({
  origin: ['http://localhost:3000', 'https://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT 中间件
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 2004, message: '缺少认证令牌' });
  }

  try {
    // jwt.verify 返回类型为 string | JwtPayload，直接断言为 any 以便读取自定义字段
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ code: 2004, message: '无效的令牌' });
  }
};

// ===== 认证接口 =====

// 注册
app.post('/api/auth/register', async (req: any, res: any) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) {
      return res.status(400).json({ code: 1001, message: '账号和密码不能为空' });
    }

    // 检查账号是否已存在
    if (users.find((u) => u.account === account)) {
      return res.status(400).json({ code: 2005, message: '账号已存在' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    const user: User = {
      id: userIdCounter++,
      account,
      password: hashedPassword,
      tokenBalance: 10000, // 免费额度
    };

    users.push(user);

    // 生成 JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      code: 0,
      message: '注册成功',
      data: {
        userId: user.id,
        token,
        tokenBalance: user.tokenBalance,
      },
    });
  } catch (error) {
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 登录
app.post('/api/auth/login', async (req: any, res: any) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) {
      return res.status(400).json({ code: 1001, message: '账号和密码不能为空' });
    }

    const user = users.find((u) => u.account === account);
    if (!user) {
      return res.status(401).json({ code: 2002, message: '账号或密码错误' });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ code: 2002, message: '账号或密码错误' });
    }

    // 生成 JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      code: 0,
      message: '登录成功',
      data: {
        userId: user.id,
        token,
        tokenBalance: user.tokenBalance,
      },
    });
  } catch (error) {
    res.status(500).json({ code: 5000, message: '服务器错误' });
  }
});

// 验证 token
app.get('/api/auth/verify', authenticateToken, (req: any, res: any) => {
  const user = users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ code: 2001, message: '用户不存在' });
  }

  res.json({
    code: 0,
    message: '令牌有效',
    data: {
      userId: user.id,
      account: user.account,
    },
  });
});

// ===== Token 接口 =====

// 查询 Token 余额
app.get('/api/token/balance', authenticateToken, (req: any, res: any) => {
  const user = users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ code: 2001, message: '用户不存在' });
  }

  res.json({
    code: 0,
    message: '查询成功',
    data: {
      availableBalance: user.tokenBalance,
      totalUsed: 0,
      totalRecharged: 0,
    },
  });
});

// 查询 Token 消费历史
app.get('/api/token/logs', authenticateToken, (req: any, res: any) => {
  const logs = tokenLogs.filter((log) => log.userId === req.userId);

  res.json({
    code: 0,
    message: '查询成功',
    data: {
      logs: logs,
      total: logs.length,
    },
  });
});

// 扣减 Token（模拟审校）
app.post('/api/token/deduct', authenticateToken, (req: any, res: any) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ code: 1002, message: '扣减金额必须大于 0' });
  }

  const user = users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ code: 2001, message: '用户不存在' });
  }

  if (user.tokenBalance < amount) {
    return res.status(400).json({ code: 3001, message: 'Token 余额不足' });
  }

  user.tokenBalance -= amount;

  tokenLogs.push({
    id: tokenLogIdCounter++,
    userId: req.userId,
    amount,
    timestamp: new Date().toISOString(),
    type: 'proofreading',
  });

  res.json({
    code: 0,
    message: '扣减成功',
    data: {
      remainingBalance: user.tokenBalance,
    },
  });
});

// ===== 支付接口 =====

interface PaymentOrder {
  id: number;
  orderNumber: string;
  userId: number;
  amount: number;
  tokenAmount: number;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
}

const paymentOrders: PaymentOrder[] = [];
let orderIdCounter = 1;

// 创建充值订单
app.post('/api/payment/create-order', authenticateToken, (req: any, res: any) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ code: 1003, message: '充值金额必须大于 0' });
  }

  const user = users.find((u) => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ code: 2001, message: '用户不存在' });
  }

  const orderNumber = `RECH${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const tokenAmount = amount * 10000; // 1 元 = 10,000 Token

  const order: PaymentOrder = {
    id: orderIdCounter++,
    orderNumber,
    userId: req.userId,
    amount,
    tokenAmount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  paymentOrders.push(order);

  res.status(201).json({
    code: 0,
    message: '订单创建成功',
    data: {
      orderNumber,
      amount,
      tokenAmount,
      testUrl: `http://localhost:${PORT}/api/payment/mock-pay?orderNumber=${orderNumber}`,
    },
  });
});

// 查询订单状态
app.get('/api/payment/order-status', authenticateToken, (req: any, res: any) => {
  const { orderNumber } = req.query;

  const order = paymentOrders.find(
    (o) => o.orderNumber === orderNumber && o.userId === req.userId
  );

  if (!order) {
    return res.status(404).json({ code: 4001, message: '订单不存在' });
  }

  res.json({
    code: 0,
    message: '查询成功',
    data: {
      orderNumber: order.orderNumber,
      status: order.status,
      amount: order.amount,
      tokenAmount: order.tokenAmount,
    },
  });
});

// 模拟支付（用于本地联调测试）
app.post('/api/payment/mock-pay', (req: any, res: any) => {
  const { orderNumber } = req.query;

  const order = paymentOrders.find((o) => o.orderNumber === orderNumber);
  if (!order) {
    return res.status(404).json({ code: 4001, message: '订单不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({ code: 4002, message: '订单不是待支付状态' });
  }

  // 标记订单为成功
  order.status = 'success';

  // 给用户加 Token
  const user = users.find((u) => u.id === order.userId);
  if (user) {
    user.tokenBalance += order.tokenAmount;
  }

  res.json({
    code: 0,
    message: '模拟支付成功（仅用于测试）',
    data: {
      orderNumber,
      status: 'success',
      tokenAmount: order.tokenAmount,
    },
  });
});

// 健康检查
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ===== 调试接口 =====

// 获取所有用户（仅用于调试）
app.get('/api/debug/users', (req: any, res: any) => {
  res.json({
    code: 0,
    message: '用户列表',
    data: users.map(u => ({
      id: u.id,
      account: u.account,
      tokenBalance: u.tokenBalance,
    })),
    total: users.length,
  });
});

// 清空所有数据（仅用于调试）
app.post('/api/debug/clear', (req: any, res: any) => {
  users.length = 0;
  tokenLogs.length = 0;
  userIdCounter = 1;
  tokenLogIdCounter = 1;
  res.json({
    code: 0,
    message: '已清空所有数据',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ProofRead 后端模拟服务已启动                               ║
║  API 地址: http://localhost:${PORT}                             ║
║  环境: 开发模式（本地联调）                                  ║
║  数据: 仅在内存中（重启后清空）                              ║
║  微信支付: 使用 /api/payment/mock-pay 模拟支付              ║
║  调试接口:                                                   ║
║    查看用户: GET http://localhost:${PORT}/api/debug/users       ║
║    清空数据: POST http://localhost:${PORT}/api/debug/clear      ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
