import * as Joi from 'joi';

/**
 * 账号格式验证（手机号或邮箱）
 */
export const validateAccount = (account: string): { valid: boolean; error?: string } => {
  const phonePattern = /^1[3-9]\d{9}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (phonePattern.test(account)) {
    return { valid: true };
  }
  
  if (emailPattern.test(account)) {
    return { valid: true };
  }
  
  return { valid: false, error: '账号必须为11位手机号或有效邮箱' };
};

/**
 * 密码复杂度验证
 */
export const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: '密码长度不能少于8位' };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: '密码必须包含小写字母' };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: '密码必须包含大写字母' };
  }
  
  if (!/\d/.test(password)) {
    return { valid: false, error: '密码必须包含数字' };
  }
  
  return { valid: true };
};

/**
 * 充值金额验证
 */
export const validateRechargeAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0 || !Number.isFinite(amount)) {
    return { valid: false, error: '充值金额必须大于0' };
  }
  
  if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    return { valid: false, error: '充值金额最多精确到分' };
  }
  
  return { valid: true };
};

/**
 * 注册请求参数验证
 */
export const validateRegisterRequest = (data: any) => {
  const schema = Joi.object({
    account: Joi.string().required().messages({
      'any.required': '账号不能为空',
      'string.empty': '账号不能为空',
    }),
    password: Joi.string().required().messages({
      'any.required': '密码不能为空',
      'string.empty': '密码不能为空',
    }),
  });
  
  return schema.validate(data, { abortEarly: false });
};

/**
 * 登录请求参数验证
 */
export const validateLoginRequest = (data: any) => {
  const schema = Joi.object({
    account: Joi.string().required(),
    password: Joi.string().required(),
  });
  
  return schema.validate(data, { abortEarly: false });
};

/**
 * 充值请求参数验证
 */
export const validateRechargeRequest = (data: any) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
  });
  
  return schema.validate(data);
};

/**
 * 支付回调参数验证
 */
export const validatePaymentNotification = (data: any) => {
  const schema = Joi.object({
    out_trade_no: Joi.string().required(),
    total_fee: Joi.number().required(),
    transaction_id: Joi.string().required(),
    trade_state: Joi.string().valid('SUCCESS', 'FAIL', 'REFUND', 'NOTPAY', 'CLOSED', 'REVOKED').required(),
    sign: Joi.string().required(),
  });
  
  return schema.validate(data);
};
