# 微信支付接入任务清单

## 阶段一：申请与准备（需3-7天）

- [ ] 访问微信支付商户平台 https://pay.weixin.qq.com/
- [ ] 准备企业资质材料
  - [ ] 营业执照扫描件
  - [ ] 法人身份证正反面照片
  - [ ] 对公银行账户信息
  - [ ] 经营场景描述文档
- [ ] 提交商户入驻申请
- [ ] 等待审核（3-7个工作日）
- [ ] 签署电子协议
- [ ] 获得商户号（mch_id）

## 阶段二：配置参数（1小时）

- [x] 安装SDK：`npm install wechatpay-node-v3` ✅
- [ ] 登录微信商户平台 https://pay.weixin.qq.com/
- [ ] 设置APIv3密钥
  - 位置：账户中心 → API安全 → 设置APIv3密钥
  - 记录32位密钥：`WECHAT_PAY_API_V3_KEY`
- [ ] 下载API证书
  - 位置：账户中心 → API安全 → 申请API证书
  - 下载：`apiclient_cert.pem` 和 `apiclient_key.pem`
  - 保存到：`ProofRead-Backend/certs/`
- [ ] 获取证书序列号
  - 方法：`openssl x509 -in certs/apiclient_cert.pem -noout -serial`
  - 记录：`WECHAT_PAY_SERIAL_NO`
- [ ] 获取微信公众号APPID
  - 位置：微信公众平台 → 开发 → 基本配置
  - 或申请测试号：https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login
  - 记录：`WECHAT_PAY_APPID`

## 阶段三：代码集成（2-3小时）

- [x] 创建微信支付服务：`src/services/wechat-pay.service.ts` ✅
- [ ] 配置环境变量
  - [ ] 创建 `certs/` 目录
  - [ ] 复制证书文件到 `certs/`
  - [ ] 复制 `.env.wechat.example` 为 `.env.wechat`
  - [ ] 填写所有配置参数
- [ ] 更新 `src/app-pg.ts` 加载微信支付配置
  ```typescript
  import dotenv from 'dotenv';
  dotenv.config();
  dotenv.config({ path: '.env.wechat' });
  ```
- [ ] 修改创建订单接口（`/api/payment/create-order`）
  - [ ] 集成 `createNativeOrder()`
  - [ ] 返回二维码 `code_url`
- [ ] 实现支付回调接口（`/api/payment/wechat/notify`）
  - [ ] 验证签名
  - [ ] 解密通知数据
  - [ ] 更新订单状态
  - [ ] 增加用户Token余额
  - [ ] 返回成功响应
- [ ] 更新订单状态查询接口
  - [ ] 可选：调用微信查询接口同步状态

## 阶段四：前端集成（1小时）

- [ ] 安装二维码库：`npm install qrcode @types/qrcode`
- [ ] 修改充值页面显示二维码
- [ ] 实现订单状态轮询
- [ ] 显示支付成功/失败提示
- [ ] 更新余额显示

## 阶段五：部署与测试（1-2天）

- [ ] 本地测试
  - [ ] 安装ngrok：https://ngrok.com/
  - [ ] 启动ngrok：`ngrok http 3001`
  - [ ] 更新 `WECHAT_PAY_NOTIFY_URL` 为ngrok地址
  - [ ] 测试完整支付流程
- [ ] 生产环境部署
  - [ ] 准备云服务器（阿里云/腾讯云）
  - [ ] 配置域名和HTTPS证书
  - [ ] 更新 `WECHAT_PAY_NOTIFY_URL` 为正式域名
  - [ ] 部署后端代码
  - [ ] 测试生产环境支付

## 阶段六：上线与监控

- [ ] 配置微信支付异常监控
- [ ] 设置订单自动关闭任务
- [ ] 准备客服通道
- [ ] 编写支付操作文档
- [ ] 培训客服人员

---

## 🚀 当前进度

✅ **已完成**：
- 安装 `wechatpay-node-v3` SDK
- 创建微信支付服务模块
- 编写集成文档

⏳ **进行中**：
- 等待商户号申请

📝 **下一步**：
1. **立即行动**：访问 https://pay.weixin.qq.com/ 申请商户号
2. **准备材料**：整理企业资质文件
3. **提交申请**：填写入驻信息

---

## 📞 需要帮助？

如果在任何步骤遇到问题：
1. 查看 `WECHAT-PAY-GUIDE.md` 详细文档
2. 参考微信支付官方文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
3. 联系微信支付客服：95017

---

**预计总耗时**：5-10天
- 商户申请审核：3-7天
- 代码集成与测试：2-3天
