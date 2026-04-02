# 微信支付v3回调部署指南

## ✅ 已完成的实现

### 1. 完整的回调处理逻辑 (app-pg.ts)

已实现以下功能：

#### ✓ 签名验证
- 使用平台证书验证微信回调签名 (RSA-SHA256)
- 支持开发环境跳过验证（需配置 `NODE_ENV=production` 强制验证）
- 详细的验证日志输出

#### ✓ 数据解密
- AES-256-GCM解密回调加密数据
- 使用 API v3 密钥解密 `resource.ciphertext`
- 提取支付信息：订单号、金额、微信交易ID、支付状态

#### ✓ 订单处理
完整的事务处理流程：
1. 查询订单并验证状态（防重复处理）
2. 验证金额一致性
3. 更新订单状态为 `success`
4. 增加用户 Token 余额
5. 更新 `token_accounts` 统计
6. 记录充值日志
7. 事务提交/回滚

## 📋 部署前检查清单

### 必需配置项

在服务器的 `.env` 文件中确认以下配置：

```bash
# 微信支付配置
WECHAT_APPID=wxd304144de2c6ca43
WECHAT_MCH_ID=1629950103
WECHAT_MCHID=1629950103

# API v3 密钥（32字节）
WECHAT_API_KEY=MvMs4drtzvvISSjhD5uKAbdlNb18QxDw
WECHAT_API_V3_KEY=MvMs4drtzvvISSjhD5uKAbdlNb18QxDw

# 回调地址
WECHAT_NOTIFY_URL=https://www.md-yk.com/api/wxpay/callback

# 商户私钥路径
WECHAT_PRIVATE_KEY_PATH=/root/ProofRead-Backend/certs/apiclient_key.pem

# 商户证书序列号（需要获取）
WECHAT_CERT_SERIAL=your_cert_serial_number_here

# 平台证书路径（用于验证回调签名）
WECHAT_PLATFORM_CERT_PATH=/root/ProofRead-Backend/certs/wechatpay_platform.pem

# 生产环境标识
NODE_ENV=production
```

### 获取证书序列号

```bash
# SSH登录到服务器
ssh root@123.56.67.271

# 进入项目目录
cd /root/ProofRead-Backend

# 从商户证书提取序列号
openssl x509 -in certs/apiclient_cert.pem -noout -serial

# 输出示例: serial=1DDE55AD98ED71D6D011DA58AA8B83F00B5C4606
# 将等号后的值复制到 .env 的 WECHAT_CERT_SERIAL
```

### 下载平台证书

**方法一：使用官方工具**
```bash
# 下载证书下载工具
wget https://github.com/wechatpay-apiv3/CertificateDownloader/releases/download/v1.2.0/CertificateDownloader.jar

# 运行工具下载平台证书
java -jar CertificateDownloader.jar \
  -k certs/apiclient_key.pem \
  -m 1629950103 \
  -s YOUR_CERT_SERIAL \
  -f certs/wechatpay_platform.pem \
  -o certs/
```

**方法二：开发环境测试（临时跳过）**
```bash
# 开发环境可以设置 NODE_ENV=development 临时跳过验证
# 生产环境必须配置平台证书！
echo "NODE_ENV=development" >> .env
```

## 🚀 部署步骤

### 1. 上传代码到服务器

```bash
# 本地推送到Git仓库
git add .
git commit -m "完成微信支付v3回调完整实现"
git push origin main

# 服务器拉取最新代码
ssh root@123.56.67.271
cd /root/ProofRead-Backend
git pull origin main
```

### 2. 安装依赖并构建

```bash
# 安装依赖
npm ci

# 构建TypeScript
npm run build

# 或直接运行开发模式
npm run dev
```

### 3. 配置Nginx反向代理

编辑 `/etc/nginx/sites-available/proofread-backend`:

```nginx
server {
    listen 80;
    server_name www.md-yk.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name www.md-yk.com;

    # SSL证书配置
    ssl_certificate /etc/letsencrypt/live/www.md-yk.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.md-yk.com/privkey.pem;

    # 微信支付回调路由（特殊处理）
    location /api/wxpay/callback {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 保留微信回调的特殊头部
        proxy_pass_request_headers on;
        
        # 增加超时时间
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # 其他API路由
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

激活配置：
```bash
sudo ln -s /etc/nginx/sites-available/proofread-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 配置SSL证书（HTTPS）

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d www.md-yk.com

# 证书将自动配置到Nginx并设置自动续期
```

### 5. 启动后端服务

```bash
# 使用PM2管理进程
npm install -g pm2

# 启动服务
pm2 start npm --name proofread-backend -- run dev

# 保存PM2配置
pm2 save

# 设置开机自启
pm2 startup
```

### 6. 在微信商户平台配置回调地址

1. 登录 [微信商户平台](https://pay.weixin.qq.com/)
2. 进入 **产品中心** > **开发配置**
3. 设置 **支付回调URL**: `https://www.md-yk.com/api/wxpay/callback`
4. 配置 **服务器IP白名单**: 添加 `123.56.67.271`

## 🧪 测试流程

### 1. 测试回调接口可访问性

```bash
# 从外网测试
curl -X POST https://www.md-yk.com/api/wxpay/callback \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'

# 期望返回 400 或 500（因为缺少签名头部）
# 如果能收到响应，说明路由配置正确
```

### 2. 查看服务器日志

```bash
# 查看PM2日志
pm2 logs proofread-backend

# 或直接查看输出
tail -f ~/.pm2/logs/proofread-backend-out.log
tail -f ~/.pm2/logs/proofread-backend-error.log
```

### 3. 创建测试订单

```bash
# 获取JWT Token（先登录）
TOKEN="your_jwt_token_here"

# 创建0.01元测试订单
curl -X POST https://www.md-yk.com/api/payment/create-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.01}'

# 返回的 codeUrl 用于生成二维码
```

### 4. 扫码支付并监控回调

```bash
# 实时查看日志
pm2 logs proofread-backend --lines 100

# 关键日志标识：
# 📥 收到微信支付回调
# ✅ 微信签名验证成功
# ✅ 回调数据解密成功
# 💰 开始处理支付成功逻辑
# 🎉 支付回调处理完成
```

## 🔧 故障排查

### 问题1: 收不到回调

**检查项：**
```bash
# 1. 确认Nginx正在运行
sudo systemctl status nginx

# 2. 检查端口开放
sudo ufw status
sudo ufw allow 443/tcp

# 3. 测试后端服务
curl http://localhost:3001/health

# 4. 检查防火墙规则
iptables -L -n
```

### 问题2: 签名验证失败

**原因：**
- 平台证书未配置或已过期
- 证书路径错误
- API v3密钥配置错误

**解决方案：**
```bash
# 重新下载平台证书
java -jar CertificateDownloader.jar -k certs/apiclient_key.pem -m 1629950103 -s YOUR_SERIAL -f certs/wechatpay_platform.pem -o certs/

# 验证证书有效性
openssl x509 -in certs/wechatpay_platform.pem -noout -text

# 临时跳过验证（仅开发）
echo "NODE_ENV=development" >> .env
pm2 restart proofread-backend
```

### 问题3: 解密失败

**原因：**
- API v3密钥配置错误（不是32字节）
- 密钥在微信平台已更改

**解决方案：**
```bash
# 1. 在微信商户平台重新设置API v3密钥
# 账户中心 -> API安全 -> 设置APIv3密钥

# 2. 更新.env配置
vim /root/ProofRead-Backend/.env
# 修改 WECHAT_API_V3_KEY

# 3. 重启服务
pm2 restart proofread-backend
```

### 问题4: 数据库事务失败

**检查项：**
```bash
# 1. 确认PostgreSQL运行正常
sudo systemctl status postgresql

# 2. 测试数据库连接
psql -U proofread_user -d proofread_db -h localhost

# 3. 检查表结构
\d payment_orders
\d token_accounts
\d recharge_logs

# 4. 查看数据库日志
sudo tail -f /var/log/postgresql/postgresql-*.log
```

## 📊 监控指标

### 关键日志位置

```bash
# PM2日志
~/.pm2/logs/proofread-backend-out.log
~/.pm2/logs/proofread-backend-error.log

# Nginx访问日志
/var/log/nginx/access.log

# Nginx错误日志
/var/log/nginx/error.log

# PostgreSQL日志
/var/log/postgresql/postgresql-*.log
```

### 重要监控命令

```bash
# 实时监控回调请求
tail -f /var/log/nginx/access.log | grep "/api/wxpay/callback"

# 监控支付成功日志
pm2 logs | grep "支付回调处理完成"

# 查看数据库连接数
psql -U proofread_user -d proofread_db -c "SELECT count(*) FROM pg_stat_activity;"

# 查看最近的充值记录
psql -U proofread_user -d proofread_db -c "SELECT * FROM recharge_logs ORDER BY created_at DESC LIMIT 10;"
```

## 📝 注意事项

1. **生产环境必须启用签名验证** - 设置 `NODE_ENV=production`
2. **定期更新平台证书** - 微信会定期轮换证书
3. **监控回调成功率** - 建议设置告警
4. **备份数据库** - 每日自动备份
5. **日志定期清理** - 避免磁盘占满

## 🔗 参考文档

- [微信支付v3 API文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [支付通知处理](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml)
- [证书和签名](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml)
