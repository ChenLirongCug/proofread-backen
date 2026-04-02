# 微信支付集成完整指南

## 📋 前置准备

### 1. 申请微信支付商户号

1. **访问**：https://pay.weixin.qq.com/
2. **准备材料**：
   - 营业执照扫描件
   - 法人身份证照片
   - 对公银行账户信息
   - 经营场景说明（SaaS服务平台）
3. **提交审核**：3-7个工作日
4. **签约**：审核通过后签署电子协议

### 2. 获取支付凭证

登录微信支付商户平台：https://pay.weixin.qq.com/

#### 获取商户号（mch_id）
- 位置：账户中心 → 商户信息
- 示例：`1234567890`

#### 设置APIv3密钥
- 位置：账户中心 → API安全 → 设置APIv3密钥
- **重要**：密钥为32位字符，设置后无法查看，请妥善保存
- 示例：`abcd1234efgh5678ijkl9012mnop3456`

#### 下载API证书
- 位置：账户中心 → API安全 → 申请API证书
- 下载文件：
  - `apiclient_cert.pem` - 商户证书
  - `apiclient_key.pem` - 商户私钥
- 保存到：`ProofRead-Backend/certs/` 目录

#### 获取证书序列号
- 方法1：在商户平台查看
- 方法2：使用OpenSSL命令：
  ```bash
  openssl x509 -in apiclient_cert.pem -noout -serial
  ```

#### 获取APPID
- 微信公众号APPID：公众号后台 → 开发 → 基本配置
- 或使用测试号：https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login

---

## 🔧 配置步骤

### 步骤1：创建证书目录

```bash
cd ProofRead-Backend
mkdir certs
```

### 步骤2：复制证书文件

将从微信商户平台下载的证书文件复制到 `certs/` 目录：
- `apiclient_cert.pem`
- `apiclient_key.pem`

### 步骤3：配置环境变量

复制示例配置文件：
```bash
cp .env.wechat.example .env.wechat
```

编辑 `.env.wechat` 文件，填写实际值：

```bash
# 微信支付商户号
WECHAT_PAY_MCHID=1234567890

# 微信支付API v3密钥（32位）
WECHAT_PAY_API_V3_KEY=abcd1234efgh5678ijkl9012mnop3456

# 微信支付商户API证书序列号
WECHAT_PAY_SERIAL_NO=ABC123DEF456

# 微信公众号或小程序APPID
WECHAT_PAY_APPID=wx1234567890abcdef

# 微信支付通知回调地址（必须是HTTPS公网地址）
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/wechat/notify

# API证书路径
WECHAT_PAY_CERT_PATH=./certs/apiclient_cert.pem
WECHAT_PAY_KEY_PATH=./certs/apiclient_key.pem
```

### 步骤4：加载环境变量

在 `ProofRead-Backend/src/app-pg.ts` 开头添加：

```typescript
import dotenv from 'dotenv';
dotenv.config(); // 加载 .env
dotenv.config({ path: '.env.wechat' }); // 加载 .env.wechat
```

---

## 🚀 启用微信支付功能

### 更新后端API

已创建的文件：
- ✅ `src/services/wechat-pay.service.ts` - 微信支付服务
- ⏳ 需要集成到 `src/app-pg.ts` 的支付接口

### 集成步骤（需手动完成）

1. **修改创建订单接口**（`/api/payment/create-order`）：
   - 调用 `createNativeOrder()` 生成二维码
   - 返回 `code_url` 给前端

2. **添加支付回调接口**（`/api/payment/wechat/notify`）：
   - 验证签名
   - 解密数据
   - 更新订单状态
   - 增加用户Token余额

3. **修改查询订单接口**（`/api/payment/order-status`）：
   - 可选：调用 `queryOrder()` 同步微信支付状态

---

## 📱 前端集成

### 显示支付二维码

使用 `qrcode` 库生成二维码：

```bash
npm install qrcode
npm install @types/qrcode --save-dev
```

前端代码示例（已在taskpane.ts中）：
```typescript
import QRCode from 'qrcode';

// 创建订单后显示二维码
const qrcodeCanvas = document.getElementById('qrcode-image');
await QRCode.toCanvas(qrcodeCanvas, codeUrl, {
  width: 200,
  margin: 1,
});
```

### 轮询订单状态

```typescript
const pollOrderStatus = async (orderNumber: string) => {
  const interval = setInterval(async () => {
    const result = await fetch(`/api/payment/order-status?orderNumber=${orderNumber}`);
    const data = await result.json();
    
    if (data.data.status === 'success') {
      clearInterval(interval);
      showRechargeSuccess();
    }
  }, 2000); // 每2秒查询一次
};
```

---

## 🧪 测试

### 测试环境

微信支付提供沙箱环境用于测试：
- 文档：https://pay.weixin.qq.com/wiki/doc/api/jsapi.php?chapter=23_1

### 本地测试

1. **使用ngrok暴露本地服务**：
   ```bash
   ngrok http 3001
   ```
   
2. **更新回调地址**：
   将ngrok提供的HTTPS地址填入 `WECHAT_PAY_NOTIFY_URL`
   
3. **测试支付流程**：
   - 创建订单
   - 生成二维码
   - 使用微信扫码支付（测试环境使用沙箱账号）

### 生产环境

1. **部署到云服务器**：需要有公网IP和域名
2. **配置HTTPS**：使用Let's Encrypt免费证书
3. **更新回调地址**：使用实际域名

---

## 📝 回调接口实现示例

```typescript
// /api/payment/wechat/notify
app.post('/api/payment/wechat/notify', async (req, res) => {
  const { timestamp, nonce, signature } = req.headers;
  const body = JSON.stringify(req.body);
  
  // 1. 验证签名
  if (!verifyNotifySignature(timestamp, nonce, body, signature)) {
    return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
  }
  
  // 2. 解密数据
  const { resource } = req.body;
  const decrypted = decryptNotifyResource(
    resource.ciphertext,
    resource.associated_data,
    resource.nonce
  );
  
  // 3. 处理支付结果
  const { out_trade_no, trade_state, transaction_id } = JSON.parse(decrypted);
  
  if (trade_state === 'SUCCESS') {
    // 更新订单状态
    // 增加用户Token余额
    // 记录充值日志
  }
  
  // 4. 返回成功
  res.json({ code: 'SUCCESS', message: '成功' });
});
```

---

## ⚠️ 安全注意事项

1. **不要将API密钥和证书提交到Git**
   - 已添加到 `.gitignore`：`.env.wechat`、`certs/`
   
2. **生产环境必须使用HTTPS**
   - 微信支付回调URL必须是HTTPS
   
3. **验证所有回调请求**
   - 必须验证签名
   - 必须验证金额
   
4. **防止重复通知**
   - 使用订单号做幂等性校验

---

## 📚 参考文档

- 微信支付开发文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
- Native支付：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
- SDK文档：https://github.com/klover2/wechatpay-node-v3

---

## 🆘 常见问题

### Q: 本地开发如何接收回调？
A: 使用 ngrok 或类似工具暴露本地服务到公网

### Q: 测试时能否不用真实支付？
A: 可以使用微信支付沙箱环境，或继续使用mock-pay接口

### Q: 需要备案的域名吗？
A: 生产环境建议使用已备案域名，但不是强制要求

### Q: 支持哪些支付方式？
A: 目前实现Native支付（扫码支付），也可扩展支持JSAPI（公众号）、H5、APP支付

---

## ✅ 下一步

1. 申请微信支付商户号（最重要）
2. 获取所有必需的配置参数
3. 运行 `npm install wechatpay-node-v3`（已完成✅）
4. 配置 `.env.wechat` 文件
5. 集成支付回调接口到 `app-pg.ts`
6. 测试完整支付流程

如需协助集成具体代码，请告知！
