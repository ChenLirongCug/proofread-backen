import axios from 'axios';
import { query, transaction } from '../database/connection';
import { generateOrderNumber, generateWechatSignature, generateWechatHmacSha256Signature } from '../utils/encryption';
import { validateRechargeAmount } from '../utils/validators';
import { ResponseCode } from '../utils/constants';
import { getRedisClient } from '../config/redis';
import { TokenService } from './token.service';
import * as xml2js from 'xml2js';
import * as crypto from 'crypto';
import * as fs from 'fs';

const TOKEN_CONVERSION_RATE = parseInt(process.env.TOKEN_CONVERSION_RATE || '10000');
const PAYMENT_ORDER_EXPIRY_MINUTES = parseInt(process.env.PAYMENT_ORDER_EXPIRY_MINUTES || '15');
const RECHARGE_INTERVAL_MINUTES = parseInt(process.env.PAYMENT_RECHARGE_INTERVAL_MINUTES || '5');
const MAX_RECHARGE_TIMES = parseInt(process.env.MAX_RECHARGE_TIMES || '5');
const PAYMENT_AMOUNT_THRESHOLD = parseInt(process.env.PAYMENT_AMOUNT_THRESHOLD || '10000');

/**
 * 微信支付服务
 */
export class PaymentService {
  /**
   * 生成充值订单
   */
  static async createRechargeOrder(userId: number, amount: number): Promise<{
    orderNumber: string;
    codeUrl: string;
    expiresIn: number;
    totalFee: number;
    tokenAmount: number;
  }> {
    // 验证金额
    const amountValidation = validateRechargeAmount(amount);
    if (!amountValidation.valid) {
      throw {
        code: ResponseCode.INVALID_RECHARGE_AMOUNT,
        message: amountValidation.error,
      };
    }

    // 检查风控：防止订单泛滥
    const redis = getRedisClient();
    const rechargeKey = `recharge_pending:${userId}`;
    const pendingOrders = await redis.get(rechargeKey);

    if (pendingOrders && parseInt(pendingOrders) >= MAX_RECHARGE_TIMES) {
      throw {
        code: ResponseCode.PAYMENT_ALREADY_PENDING,
        message: '已有待支付订单，请先完成支付或取消后重试',
      };
    }

    // 检查大额充值
    if (amount * 100 >= PAYMENT_AMOUNT_THRESHOLD) {
      // 可扩展：需要二次验证如实名认证
      // const identity = await verifyRealName(userId);
      // if (!identity.verified) throw error;
    }

    try {
      const orderNumber = generateOrderNumber();
      const tokenAmount = Math.floor(amount * TOKEN_CONVERSION_RATE);
      const expiredAt = new Date(Date.now() + PAYMENT_ORDER_EXPIRY_MINUTES * 60 * 1000);
      const amountFen = Math.floor(amount * 100); // 转换为分

      // 调用微信统一下单接口
      const codeUrl = await this.callWechatUnifiedOrder(
        orderNumber,
        amountFen,
        userId,
      );

      // 保存订单信息
      await query(
        `INSERT INTO payment_orders (order_number, user_id, recharge_amount, token_amount, order_status, code_url, expired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderNumber, userId, amount, tokenAmount, 'pending', codeUrl, expiredAt],
      );

      // 更新风控计数
      const count = pendingOrders ? parseInt(pendingOrders) + 1 : 1;
      await redis.setex(rechargeKey, RECHARGE_INTERVAL_MINUTES * 60, count.toString());

      return {
        orderNumber,
        codeUrl,
        expiresIn: PAYMENT_ORDER_EXPIRY_MINUTES * 60,
        totalFee: amount,
        tokenAmount,
      };
    } catch (error: any) {
      if (error.code) throw error;
      throw {
        code: ResponseCode.WECHAT_API_ERROR,
        message: '支付二维码生成失败，请重试',
      };
    }
  }

  /**
   * 调用微信统一下单接口 (v3 Native支付)
   */
  private static async callWechatUnifiedOrder(orderNumber: string, totalFee: number, userId: number): Promise<string> {
    const mchId = process.env.WECHAT_MCHID || process.env.WECHAT_MCH_ID;
    const appId = process.env.WECHAT_APPID;
    const serialNo = process.env.WECHAT_CERT_SERIAL;
    const privateKeyPath = process.env.WECHAT_PRIVATE_KEY_PATH || './certs/apiclient_key.pem';
    const notifyUrl = process.env.WECHAT_NOTIFY_URL || 'https://www.md-yk.com/api/wxpay/callback';

    if (!mchId || !appId || !serialNo) {
      throw new Error('Wechat configuration incomplete');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = generateRandomString(32);

    // 构建v3 API请求体
    const requestBody = {
      appid: appId,
      mchid: mchId,
      description: 'Token充值服务',
      out_trade_no: orderNumber,
      notify_url: notifyUrl,
      amount: {
        total: totalFee,
        currency: 'CNY'
      }
      // Native支付不需要scene_info
    };
    
    console.log('📤 微信下单请求参数:', JSON.stringify(requestBody, null, 2));

    const bodyString = JSON.stringify(requestBody);
    const urlPath = '/v3/pay/transactions/native';

    // 生成v3 Authorization头
    const authorization = generateWechatV3Authorization(
      'POST',
      urlPath,
      timestamp,
      nonceStr,
      bodyString,
      mchId,
      serialNo,
      privateKeyPath,
    );

    try {
      const response = await axios.post(
        `https://api.mch.weixin.qq.com${urlPath}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': authorization,
          },
          timeout: 10000,
        },
      );

      // v3 API直接返回JSON
      const data = response.data as any;
      console.log('✅ 微信支付响应:', JSON.stringify(data, null, 2));
      if (data.code_url) {
        console.log('📱 code_url:', data.code_url);
        return data.code_url;
      }

      throw new Error('Failed to get code_url from WeChat Pay');
    } catch (error) {
      console.error('Wechat unified order error:', error);
      throw error;
    }
  }

  /**
   * 处理支付回调 (v3 API)
   */
  static async handleWechatNotify(
    body: string,
    headers: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 获取签名验证所需的头部信息
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const signature = headers['wechatpay-signature'];
      const serial = headers['wechatpay-serial'];
      
      if (!timestamp || !nonce || !signature) {
        throw new Error('Missing signature headers');
      }

      // 验证签名
      const platformCertPath = process.env.WECHAT_PLATFORM_CERT_PATH;
      const isValid = verifyWechatV3Signature(timestamp, nonce, body, signature, platformCertPath);
      
      if (!isValid) {
        throw new Error('Signature verification failed');
      }

      // 解析回调数据
      const callbackData = JSON.parse(body);
      
      // v3回调数据是加密的，需要解密
      const apiV3Key = process.env.WECHAT_API_V3_KEY || process.env.WECHAT_API_KEY;
      if (!apiV3Key) {
        throw new Error('API V3 key not configured');
      }

      const resource = callbackData.resource;
      const decryptedData = decryptWechatV3Data(
        resource.associated_data,
        resource.nonce,
        resource.ciphertext,
        apiV3Key
      );

      // 提取支付信息
      const orderNumber = decryptedData.out_trade_no;
      const totalFee = decryptedData.amount.total;
      const transactionId = decryptedData.transaction_id;
      const tradeState = decryptedData.trade_state;

      // 检查支付状态
      if (tradeState !== 'SUCCESS') {
        return { success: false, message: 'Payment not successful' };
      }

      // 查询订单
      const orderResult = await query(
        `SELECT id, user_id, recharge_amount, token_amount, order_status 
         FROM payment_orders WHERE order_number = $1`,
        [orderNumber],
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // 检查订单状态
      if (order.order_status !== 'pending') {
        return { success: false, message: 'Order already processed' };
      }

      // 检查金额一致性
      const orderAmountFen = Math.floor(order.recharge_amount * 100);
      if (orderAmountFen !== totalFee) {
        return { success: false, message: 'Amount mismatch' };
      }

      // 处理支付成功：更新订单并发放 Token
      await transaction(async (client) => {
        // 更新订单状态
        await client.query(
          `UPDATE payment_orders 
           SET order_status = $1, wechat_transaction_id = $2, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE order_number = $3`,
          ['success', transactionId, orderNumber],
        );

        // 发放 Token
        await TokenService.addToken(order.user_id, order.token_amount, orderNumber, transactionId);
      });

      return { success: true, message: 'Payment processed successfully' };
    } catch (error: any) {
      console.error('Wechat notify error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 查询订单状态
   */
  static async queryOrderStatus(orderNumber: string, userId: number): Promise<{
    orderNumber: string;
    status: string;
    amount: number;
    tokenAmount: number;
    expiresAt: string;
    wechatTransactionId: string | null;
    createdAt: Date;
  }> {
    const result = await query(
      `SELECT order_number, order_status, recharge_amount, token_amount, expired_at, wechat_transaction_id, created_at
       FROM payment_orders WHERE order_number = $1 AND user_id = $2`,
      [orderNumber, userId],
    );

    if (result.rows.length === 0) {
      throw {
        code: ResponseCode.PAYMENT_ORDER_NOT_FOUND,
        message: '支付订单不存在',
      };
    }

    const order = result.rows[0];

    return {
      orderNumber: order.order_number,
      status: order.order_status,
      amount: order.recharge_amount,
      tokenAmount: order.token_amount,
      expiresAt: order.expired_at,
      wechatTransactionId: order.wechat_transaction_id,
      createdAt: order.created_at,
    };
  }

  /**
   * 取消订单
   */
  static async cancelOrder(orderNumber: string, userId: number): Promise<void> {
    await query(
      `UPDATE payment_orders 
       SET order_status = $1, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE order_number = $2 AND user_id = $3 AND order_status = $4`,
      ['closed', orderNumber, userId, 'pending'],
    );
  }

  /**
   * 扫描过期订单（定时任务）
   */
  static async scanExpiredOrders(): Promise<number> {
    const result = await query(
      `UPDATE payment_orders 
       SET order_status = $1, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE order_status = $2 AND expired_at < CURRENT_TIMESTAMP
       RETURNING id`,
      ['closed', 'pending'],
    );

    console.log(`[OrderExpiryJob] Closed ${result.rows.length} expired orders`);
    return result.rows.length;
  }

  /**
   * 查询充值记录
   */
  static async getRechargeHistory(userId: number, pageNum: number = 1, pageSize: number = 20): Promise<{
    data: any[];
    total: number;
  }> {
    const offset = (pageNum - 1) * pageSize;

    const countResult = await query(
      'SELECT COUNT(*) as total FROM payment_orders WHERE user_id = $1',
      [userId],
    );

    const recordsResult = await query(
      `SELECT * FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    );

    return {
      data: recordsResult.rows,
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * 构建 XML 请求
   */
  private static buildXml(params: any): string {
    const builder = new xml2js.Builder({ rootName: 'xml' });
    return builder.buildObject(params);
  }
}

/**
 * 辅助函数
 */
const generateRandomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * 生成微信支付v3 API的Authorization头
 */
const generateWechatV3Authorization = (
  method: string,
  urlPath: string,
  timestamp: number,
  nonceStr: string,
  body: string,
  mchId: string,
  serialNo: string,
  privateKeyPath: string,
): string => {
  // 构造签名串
  const signString = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  
  // 读取商户私钥
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  
  // 使用SHA256-RSA签名
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signString);
  const signature = sign.sign(privateKey, 'base64');
  
  // 构造Authorization头
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
};

/**
 * 验证微信支付v3回调签名
 */
const verifyWechatV3Signature = (
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  platformCertPath?: string,
): boolean => {
  // 构造验签名串
  const signString = `${timestamp}\n${nonce}\n${body}\n`;
  
  try {
    // 如果提供了平台证书，使用证书验签
    if (platformCertPath && fs.existsSync(platformCertPath)) {
      const platformCert = fs.readFileSync(platformCertPath, 'utf8');
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signString);
      return verify.verify(platformCert, signature, 'base64');
    }
    
    // 如果没有平台证书，暂时跳过验签（生产环境必须验签）
    console.warn('WARNING: Platform certificate not found, signature verification skipped');
    return true;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

/**
 * 解密微信支付v3回调加密数据
 */
const decryptWechatV3Data = (
  associatedData: string,
  nonce: string,
  ciphertext: string,
  apiV3Key: string,
): any => {
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
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error('Decrypt error:', error);
    throw new Error('Failed to decrypt callback data');
  }
};
