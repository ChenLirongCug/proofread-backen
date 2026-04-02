import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

/**
 * 生成随机盐值（用户专属）
 */
export const generateSalt = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * 生成密码哈希值（SHA3-256 + 盐值）
 */
export const hashPassword = (password: string, salt: string): string => {
  const combined = password + salt;
  return crypto.createHash('sha256').update(combined).digest('hex');
};

/**
 * 验证密码
 */
export const verifyPassword = (inputPassword: string, storedHash: string, salt: string): boolean => {
  const inputHash = hashPassword(inputPassword, salt);
  return inputHash === storedHash;
};

/**
 * 生成订单号（RECH + yyyyMMddHHmmss + 6位随机数）
 */
export const generateOrderNumber = (): string => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RECH${timestamp}${random}`;
};

/**
 * 生成唯一的请求签名
 */
export const generateSignature = (data: any, secret: string): string => {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const content = `${JSON.stringify(data)}${timestamp}${nonce}${secret}`;
  return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * 验证请求签名
 */
export const verifySignature = (data: any, signature: string, timestamp: number, nonce: string, secret: string): boolean => {
  const content = `${JSON.stringify(data)}${timestamp}${nonce}${secret}`;
  const expectedSignature = crypto.createHash('sha256').update(content).digest('hex');
  return expectedSignature === signature;
};

/**
 * 生成微信支付签名（MD5）
 */
export const generateWechatSignature = (params: any, apiKey: string): string => {
  const keys = Object.keys(params).sort();
  const string = keys.map(key => `${key}=${params[key]}`).join('&') + `&key=${apiKey}`;
  return crypto.createHash('md5').update(string).digest('hex').toUpperCase();
};

/**
 * 生成微信支付 HMAC-SHA256 签名
 */
export const generateWechatHmacSha256Signature = (message: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
};

/**
 * 生成随机字符串
 */
export const generateRandomString = (length: number = 32): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

/**
 * AES 加密（用于敏感配置）
 */
export const encryptAES = (text: string, key: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * AES 解密
 */
export const decryptAES = (text: string, key: string): string => {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32)), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};
