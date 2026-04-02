import Payment from 'wechatpay-node-v3';
import fs from 'fs';
import path from 'path';

// 微信支付配置
const wechatPayConfig = {
  appid: process.env.WECHAT_PAY_APPID || '',
  mchid: process.env.WECHAT_PAY_MCHID || '',
  serial_no: process.env.WECHAT_PAY_SERIAL_NO || '',
  apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || '',
  privateKey: fs.existsSync(process.env.WECHAT_PAY_KEY_PATH || '') 
    ? fs.readFileSync(process.env.WECHAT_PAY_KEY_PATH || '')
    : Buffer.from(''),
  publicKey: fs.existsSync(process.env.WECHAT_PAY_CERT_PATH || '')
    ? fs.readFileSync(process.env.WECHAT_PAY_CERT_PATH || '')
    : Buffer.from(''),
};

// 检查配置是否完整
export function isWechatPayConfigured(): boolean {
  return !!(
    wechatPayConfig.appid &&
    wechatPayConfig.mchid &&
    wechatPayConfig.serial_no &&
    wechatPayConfig.apiV3Key &&
    wechatPayConfig.privateKey
  );
}

// 初始化微信支付实例
let payment: any = null;

if (isWechatPayConfigured()) {
  payment = new Payment({
    appid: wechatPayConfig.appid,
    mchid: wechatPayConfig.mchid,
    serial_no: wechatPayConfig.serial_no,
    publicKey: wechatPayConfig.publicKey,
    privateKey: wechatPayConfig.privateKey,
    key: wechatPayConfig.apiV3Key,
    authType: 'certificate',
  });
  console.log('✅ 微信支付已初始化');
} else {
  console.warn('⚠️  微信支付未配置，将使用模拟支付');
}

/**
 * 创建Native支付订单（生成二维码）
 */
export async function createNativeOrder(params: {
  orderNumber: string;
  description: string;
  amount: number; // 单位：元
  notifyUrl?: string;
}) {
  if (!payment) {
    throw new Error('微信支付未配置');
  }

  const { orderNumber, description, amount, notifyUrl } = params;

  try {
    const result = await payment.native({
      description,
      out_trade_no: orderNumber,
      notify_url: notifyUrl || process.env.WECHAT_PAY_NOTIFY_URL || '',
      amount: {
        total: Math.round(amount * 100), // 微信支付金额单位为分
        currency: 'CNY',
      },
    });

    return {
      success: true,
      code_url: result.code_url, // 二维码链接
      orderNumber,
    };
  } catch (error: any) {
    console.error('创建微信支付订单失败:', error);
    throw new Error(error.message || '创建支付订单失败');
  }
}

/**
 * 查询订单状态
 */
export async function queryOrder(orderNumber: string) {
  if (!payment) {
    throw new Error('微信支付未配置');
  }

  try {
    const result = await payment.getTransactionByOutTradeNo({
      out_trade_no: orderNumber,
    });

    return {
      success: true,
      trade_state: result.trade_state, // SUCCESS/REFUND/NOTPAY/CLOSED/REVOKED/USERPAYING/PAYERROR
      transaction_id: result.transaction_id,
      amount: result.amount?.total ? result.amount.total / 100 : 0,
    };
  } catch (error: any) {
    console.error('查询微信支付订单失败:', error);
    return {
      success: false,
      error: error.message || '查询失败',
    };
  }
}

/**
 * 关闭订单
 */
export async function closeOrder(orderNumber: string) {
  if (!payment) {
    throw new Error('微信支付未配置');
  }

  try {
    await payment.closeOrder({
      out_trade_no: orderNumber,
    });
    return { success: true };
  } catch (error: any) {
    console.error('关闭微信支付订单失败:', error);
    throw new Error(error.message || '关闭订单失败');
  }
}

/**
 * 验证支付回调签名
 */
export function verifyNotifySignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string
): boolean {
  if (!payment) {
    return false;
  }

  try {
    return payment.verifySign({
      timestamp,
      nonce,
      body,
      signature,
    });
  } catch (error) {
    console.error('验证微信支付回调签名失败:', error);
    return false;
  }
}

/**
 * 解密支付回调数据
 */
export function decryptNotifyResource(
  ciphertext: string,
  associated_data: string,
  nonce: string
): any {
  if (!payment) {
    throw new Error('微信支付未配置');
  }

  try {
    return payment.decipher_gcm(ciphertext, associated_data, nonce);
  } catch (error) {
    console.error('解密微信支付回调数据失败:', error);
    throw error;
  }
}

export { payment };
