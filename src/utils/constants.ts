/**
 * 业务响应码（标准化）
 */
export enum ResponseCode {
  // 成功
  SUCCESS = 0,
  
  // 参数错误 (1000-1999)
  INVALID_ACCOUNT = 1001,
  INVALID_PASSWORD = 1002,
  INVALID_RECHARGE_AMOUNT = 1003,
  MISSING_REQUIRED_PARAMS = 1004,
  
  // 账号问题 (2000-2999)
  ACCOUNT_NOT_FOUND = 2001,
  ACCOUNT_OR_PASSWORD_ERROR = 2002,
  ACCOUNT_LOCKED = 2003,
  ACCOUNT_DISABLED = 2004,
  ACCOUNT_ALREADY_EXISTS = 2005,
  
  // Token 问题 (3000-3999)
  INSUFFICIENT_TOKEN = 3001,
  TOKEN_ACCOUNT_NOT_FOUND = 3002,
  TOKEN_DEDUCTION_FAILED = 3003,
  
  // 支付问题 (4000-4999)
  PAYMENT_ORDER_NOT_FOUND = 4001,
  PAYMENT_ORDER_EXPIRED = 4002,
  PAYMENT_ORDER_CLOSED = 4003,
  PAYMENT_ALREADY_PENDING = 4004,
  PAYMENT_FAILED = 4005,
  WECHAT_API_ERROR = 4006,
  PAYMENT_AMOUNT_MISMATCH = 4007,
  
  // 系统错误 (5000+)
  DATABASE_ERROR = 5001,
  REDIS_ERROR = 5002,
  SIGNATURE_VERIFICATION_FAILED = 5003,
  INVALID_TOKEN = 5004,
  SYSTEM_ERROR = 5000,
}

/**
 * 响应消息映射
 */
export const ResponseMessages: Record<ResponseCode, string> = {
  [ResponseCode.SUCCESS]: '操作成功',
  [ResponseCode.INVALID_ACCOUNT]: '账号格式不正确',
  [ResponseCode.INVALID_PASSWORD]: '密码不符合复杂度要求',
  [ResponseCode.INVALID_RECHARGE_AMOUNT]: '充值金额格式错误',
  [ResponseCode.MISSING_REQUIRED_PARAMS]: '缺少必要参数',
  [ResponseCode.ACCOUNT_NOT_FOUND]: '账号不存在',
  [ResponseCode.ACCOUNT_OR_PASSWORD_ERROR]: '账号或密码错误',
  [ResponseCode.ACCOUNT_LOCKED]: '账号已被锁定，请稍后再试',
  [ResponseCode.ACCOUNT_DISABLED]: '账号已禁用',
  [ResponseCode.ACCOUNT_ALREADY_EXISTS]: '账号已存在',
  [ResponseCode.INSUFFICIENT_TOKEN]: '您的免费 Token 额度已用尽，请充值后继续使用',
  [ResponseCode.TOKEN_ACCOUNT_NOT_FOUND]: 'Token 账户不存在',
  [ResponseCode.TOKEN_DEDUCTION_FAILED]: 'Token 扣减失败',
  [ResponseCode.PAYMENT_ORDER_NOT_FOUND]: '支付订单不存在',
  [ResponseCode.PAYMENT_ORDER_EXPIRED]: '支付订单已过期',
  [ResponseCode.PAYMENT_ORDER_CLOSED]: '支付订单已关闭',
  [ResponseCode.PAYMENT_ALREADY_PENDING]: '已有待支付订单，请先完成支付或取消后重试',
  [ResponseCode.PAYMENT_FAILED]: '支付失败，请重试',
  [ResponseCode.WECHAT_API_ERROR]: '微信支付接口调用失败',
  [ResponseCode.PAYMENT_AMOUNT_MISMATCH]: '支付金额不匹配',
  [ResponseCode.DATABASE_ERROR]: '数据库操作失败',
  [ResponseCode.REDIS_ERROR]: '缓存操作失败',
  [ResponseCode.SIGNATURE_VERIFICATION_FAILED]: '请求签名验证失败',
  [ResponseCode.INVALID_TOKEN]: '无效的令牌',
  [ResponseCode.SYSTEM_ERROR]: '系统错误，请稍后重试',
};

/**
 * 标准化响应格式
 */
export interface ApiResponse<T = any> {
  code: ResponseCode;
  message: string;
  data?: T;
  timestamp: number;
}

/**
 * 生成成功响应
 */
export const successResponse = <T = any>(data?: T, codeOrMessage: ResponseCode | string = ResponseCode.SUCCESS): ApiResponse<T> => {
  let code: ResponseCode = ResponseCode.SUCCESS;
  let message: string = ResponseMessages[ResponseCode.SUCCESS];
  if (typeof codeOrMessage === 'string') {
    message = codeOrMessage;
  } else {
    code = codeOrMessage;
    message = ResponseMessages[code];
  }

  return {
    code,
    message,
    data,
    timestamp: Date.now(),
  };
};

/**
 * 生成错误响应
 */
export const errorResponse = (code: ResponseCode, customMessage?: string): ApiResponse => {
  return {
    code,
    message: customMessage || ResponseMessages[code],
    timestamp: Date.now(),
  };
};

/**
 * 列表响应
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
  pageSize: number;
  pageNum: number;
}

/**
 * 生成列表响应
 */
export const listResponse = <T>(items: T[], total: number, pageNum: number, pageSize: number, message?: string): ApiResponse<ListResponse<T>> => {
  const payload = {
    items,
    total,
    pageSize,
    pageNum,
  };
  if (message) return successResponse(payload, message);
  return successResponse(payload, ResponseCode.SUCCESS);
};
