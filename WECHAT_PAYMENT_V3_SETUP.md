# 微信支付 v3 API 配置指南

## 一、必需配置项

### 1. WECHAT_CERT_SERIAL (商户证书序列号)

**获取方法：**

```bash
# 使用 OpenSSL 从商户证书中提取序列号
openssl x509 -in certs/apiclient_cert.pem -noout -serial

# 输出格式如: serial=1DDE55AD98ED71D6D011DA58AA8B83F00B5C4606
# 取等号后面的值，转换为大写即为序列号
```

**配置到 .env：**
```bash
WECHAT_CERT_SERIAL=1DDE55AD98ED71D6D011DA58AA8B83F00B5C4606
```

### 2. WECHAT_PLATFORM_CERT_PATH (微信平台证书)

**获取方法：**

方法一：通过微信支付官方工具下载
```bash
# 1. 下载证书工具
wget https://github.com/wechatpay-apiv3/CertificateDownloader/releases/download/v1.2.0/CertificateDownloader.jar

# 2. 运行工具下载平台证书
java -jar CertificateDownloader.jar \
  -k certs/apiclient_key.pem \
  -m 1629950103 \
  -s your_cert_serial_here \
  -f certs/wechatpay_platform.pem \
  -o certs/
```

方法二：通过API获取（需要手动解密）
- 参考文档: https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay5_1.shtml

### 3. 验证配置

**检查证书文件：**
```bash
ls -la certs/
# 应该包含:
# - apiclient_key.pem (商户私钥)
# - apiclient_cert.pem (商户证书，用于提取序列号)
# - apiclient_pub.pem (商户公钥)
# - wechatpay_platform.pem (微信平台证书，用于验证回调签名)
```

## 二、.env 完整配置示例

```bash
# === 微信支付配置 (v3 API) ===
# 微信开放分配的应用 ID
WECHAT_APPID=wxd304144de2c6ca43

# 商户号
WECHAT_MCH_ID=1629950103
WECHAT_MCHID=1629950103

# API v3 密钥 (32字节对称密钥，用于加解密回调数据)
WECHAT_API_KEY=MvMs4drtzvvISSjhD5uKAbdlNb18QxDw
WECHAT_API_V3_KEY=MvMs4drtzvvISSjhD5uKAbdlNb18QxDw

# 支付回调地址
WECHAT_NOTIFY_URL=https://www.md-yk.com/api/payment/wechat-notify

# 商户私钥路径
WECHAT_PRIVATE_KEY_PATH=./certs/apiclient_key.pem

# 商户证书序列号
WECHAT_CERT_SERIAL=1DDE55AD98ED71D6D011DA58AA8B83F00B5C4606

# 平台证书路径 (用于验证回调签名)
WECHAT_PLATFORM_CERT_PATH=./certs/wechatpay_platform.pem
```

## 三、v3 API 主要改动

### 1. 统一下单接口

**v2 (旧):**
- 端点: `POST /pay/unifiedorder`
- 格式: XML
- 签名: MD5

**v3 (新):**
- 端点: `POST /v3/pay/transactions/native`
- 格式: JSON
- 签名: SHA256-RSA2048

### 2. 支付回调

**v2 (旧):**
- 格式: XML
- 签名: MD5
- 响应: XML

**v3 (新):**
- 格式: JSON (加密)
- 签名: SHA256-RSA2048
- 响应: HTTP 204 (无内容)

### 3. 回调数据解密

v3回调的敏感数据使用AES-256-GCM加密，需要用API v3密钥解密：

```typescript
decryptWechatV3Data(
  resource.associated_data,  // 关联数据
  resource.nonce,             // 随机串
  resource.ciphertext,        // 密文
  apiV3Key                    // API v3密钥
)
```

## 四、测试流程

### 1. 本地测试

```bash
# 启动后端
npm run dev

# 测试创建订单
curl -X POST http://localhost:3001/api/payment/create-order \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rechargeAmount": 0.01}'

# 响应示例:
{
  "code": 200,
  "message": "success",
  "data": {
    "orderNumber": "ORD20240101120000123",
    "codeUrl": "weixin://wxpay/bizpayurl?pr=abc123",
    "expiresAt": "2024-01-01T12:15:00Z"
  }
}
```

### 2. 生产环境测试

```bash
# 1. 确保域名已配置HTTPS (Let's Encrypt)
certbot --nginx -d www.md-yk.com

# 2. 配置Nginx反向代理
# /etc/nginx/sites-available/proofread-backend

# 3. 在微信商户平台配置回调白名单
# - 回调地址: https://www.md-yk.com/api/payment/wechat-notify
# - IP白名单: 服务器公网IP

# 4. 使用真实金额测试 (0.01元)
# 5. 查看日志确认回调处理
pm2 logs proofread-backend
```

## 五、常见问题

### 1. 签名验证失败

**原因:**
- 商户证书序列号错误
- 私钥与证书不匹配
- 时间戳偏差过大

**解决方案:**
```bash
# 重新提取序列号
openssl x509 -in certs/apiclient_cert.pem -noout -serial

# 检查时间同步
ntpdate -u ntp.aliyun.com
```

### 2. 回调解密失败

**原因:**
- API v3密钥配置错误
- 密钥长度不是32字节

**解决方案:**
```bash
# 在微信商户平台重新设置API v3密钥
# 账户中心 -> API安全 -> 设置APIv3密钥
```

### 3. 平台证书过期

**原因:**
- 微信会定期更新平台证书

**解决方案:**
```bash
# 定期下载最新平台证书
java -jar CertificateDownloader.jar -k certs/apiclient_key.pem -m 1629950103 -s YOUR_SERIAL -f certs/wechatpay_platform.pem -o certs/
```

## 六、参考文档

- [微信支付v3 API文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [Native支付开发指南](https://pay.weixin.qq.com/wiki/doc/apiv3/open/pay/chapter2_7_2.shtml)
- [证书和签名](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml)
- [回调通知](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml)
