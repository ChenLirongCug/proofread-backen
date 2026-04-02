# ProofRead 项目完整测试指南

## 📋 测试工程师执行手册

作为测试工程师，本指南将帮助你对ProofRead项目进行**全面质量检查**。

---

## 🎯 测试范围

### 1. **功能测试** (test-api-comprehensive.js)
- ✅ 用户注册/登录/登出
- ✅ Token管理和验证
- ✅ 单点登录限制
- ✅ 支付订单创建
- ✅ 注册频率限制
- ✅ 并发请求处理

### 2. **数据库测试** (test-database-integrity.js)
- ✅ 表结构完整性
- ✅ 字段约束检查
- ✅ 索引效率验证
- ✅ 外键关系正确性
- ✅ 数据一致性
- ✅ 查询性能测试

### 3. **安全测试** (test-security.js)
- ✅ SQL注入防护
- ✅ XSS跨站脚本防护
- ✅ 身份验证安全
- ✅ 会话管理安全
- ✅ 请求频率限制
- ✅ 暴力破解防护
- ✅ Token劫持防护
- ✅ 信息泄露检查

---

## 🚀 快速开始

### 前置条件

1. **确保后端服务运行**
   ```bash
   cd ProofRead-Backend
   npm start
   ```
   服务应该在 `http://localhost:3001` 启动

2. **确保数据库连接正常**
   - PostgreSQL服务运行中
   - 数据库 `proofread_db` 存在
   - .env文件配置正确

### 执行所有测试

```bash
# 方式1: 使用npm脚本（推荐）
npm run test:all

# 方式2: 生成HTML报告
npm run test:report

# 方式3: 单独执行某个测试套件
npm run test:api        # API功能测试
npm run test:db         # 数据库测试
npm run test:security   # 安全测试
```

### 查看测试报告

执行 `npm run test:report` 后，会在当前目录生成 `test-report.html`

**打开方式：**
- Windows: 双击文件
- 或在浏览器中打开: `file:///C:/Users/chenl/OfficeAddinApps/ProofRead-Backend/test-report.html`

---

## 📊 测试结果解读

### 成功标准

✅ **通过率 ≥ 90%** - 项目质量合格  
⚠️ **通过率 70-90%** - 需要修复部分问题  
❌ **通过率 < 70%** - 存在严重问题，不可上线

### 关键测试项

| 测试项 | 重要性 | 说明 |
|--------|--------|------|
| SQL注入防护 | 🔴 极高 | 必须全部通过 |
| 身份验证安全 | 🔴 极高 | 必须全部通过 |
| 数据完整性 | 🟠 高 | 不允许有孤立数据 |
| 单点登录 | 🟠 高 | 业务核心功能 |
| 注册频率限制 | 🟡 中 | 防止滥用 |

---

## 🔍 测试详解

### 1. API功能测试

**测试内容：**
```javascript
// 1. 健康检查
GET /health → 200

// 2. 用户注册
POST /api/auth/register
{
  "account": "test@example.com",
  "password": "Test123456!"
}
→ 201 (首次) / 400 (重复) / 429 (频繁)

// 3. 用户登录
POST /api/auth/login
{
  "account": "test@example.com",
  "password": "Test123456!"
}
→ 200 (成功) / 401 (失败)

// 4. Token验证
GET /api/auth/verify
Headers: Authorization: Bearer <token>
→ 200 (有效) / 401 (无效)

// 5. 单点登录测试
设备A登录 → 获取tokenA
设备B登录 → 获取tokenB
使用tokenA访问 → 401 (被踢出)
使用tokenB访问 → 200 (正常)
```

**预期结果：**
- 所有正常流程返回正确状态码
- 异常输入被妥善处理
- 单点登录正确执行

---

### 2. 数据库完整性测试

**检查项：**

```sql
-- 1. 表存在性
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';
→ users, tokens, orders, active_sessions

-- 2. 字段约束
SELECT column_name, is_nullable 
FROM information_schema.columns
WHERE table_name = 'users';
→ account NOT NULL, UNIQUE

-- 3. 索引效率
EXPLAIN ANALYZE 
SELECT * FROM users WHERE account = 'test@example.com';
→ 执行时间 < 100ms

-- 4. 数据一致性
SELECT COUNT(*) FROM tokens t
LEFT JOIN users u ON t.user_id = u.id
WHERE u.id IS NULL;
→ 0 (无孤立tokens)
```

**预期结果：**
- 所有必需表和字段存在
- 约束正确配置
- 无数据孤立/冗余

---

### 3. 安全测试

**攻击场景测试：**

#### SQL注入
```javascript
// 尝试注入
account: "admin' OR '1'='1"
password: "anything"
→ 必须返回401，不能登录成功
```

#### XSS攻击
```javascript
// 尝试XSS
account: "<script>alert('XSS')</script>"
→ 必须被拒绝或转义
```

#### 暴力破解
```javascript
// 连续10次错误登录
for (i = 0; i < 10; i++) {
  login(account, "wrong_password_" + i)
}
→ 应该触发频率限制 (429)
```

#### Token劫持
```javascript
// 用户A的token在用户B的设备使用
tokenA在不同User-Agent下访问
→ 理想情况应被拒绝（当前警告）
```

**预期结果：**
- SQL注入100%防护
- XSS攻击被阻止
- 有请求频率限制
- Token安全机制完善

---

## 🛠️ 常见问题处理

### 问题1: 测试连接失败

**错误信息：**
```
Error: connect ECONNREFUSED 127.0.0.1:3001
```

**解决方案：**
```bash
# 检查后端是否启动
netstat -ano | findstr :3001

# 如果没有运行，启动后端
cd ProofRead-Backend
npm start
```

---

### 问题2: 数据库连接失败

**错误信息：**
```
Error: password authentication failed for user "postgres"
```

**解决方案：**
```bash
# 1. 检查.env配置
cat .env

# 2. 确认PostgreSQL服务运行
# Windows服务管理器中检查 postgresql-x64-18

# 3. 测试数据库连接
psql -U postgres -d proofread_db
```

---

### 问题3: 注册频率限制误报

**现象：**
```
所有注册都返回429，即使是首次注册
```

**原因：**
测试脚本在同一IP快速注册多个账号，触发频率限制

**解决方案：**
```javascript
// 在测试脚本中添加延迟
await new Promise(resolve => setTimeout(resolve, 3700000)); // 等待1小时

// 或者临时放宽限制（仅测试环境）
// 在app-pg.ts中修改
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1小时
// 改为
const oneHourAgo = new Date(Date.now() - 10 * 1000); // 10秒
```

---

### 问题4: 单点登录测试失败

**现象：**
```
设备A被踢出后，tokenA仍然有效
```

**排查步骤：**

1. **检查active_sessions表**
```sql
SELECT * FROM active_sessions WHERE user_id = 1;
```

2. **检查session验证逻辑**
```typescript
// src/app-pg.ts
const session = await SessionService.validateSession(userId, deviceId);
if (!session) {
  return res.status(401).json({ code: 401, message: '会话已过期' });
}
```

3. **检查设备ID生成**
```javascript
// User-Agent必须不同才能模拟不同设备
headers: {
  'User-Agent': 'Device-A'  // vs 'Device-B'
}
```

---

## 📈 性能基准

### 响应时间要求

| 端点 | 平均响应时间 | P95 | P99 |
|------|-------------|-----|-----|
| /health | < 10ms | < 20ms | < 50ms |
| /api/auth/login | < 200ms | < 500ms | < 1s |
| /api/auth/register | < 300ms | < 600ms | < 1s |
| /api/token/balance | < 100ms | < 200ms | < 500ms |
| /api/payment/create-order | < 500ms | < 1s | < 2s |

### 并发能力

- **并发用户:** ≥ 100
- **QPS:** ≥ 500
- **错误率:** < 0.1%

---

## 🚨 测试失败处理流程

### 严重级别分类

**P0 - 阻断上线**
- SQL注入防护失败
- 身份验证绕过
- 数据丢失风险

**P1 - 必须修复**
- 单点登录失败
- 支付订单异常
- 数据库约束缺失

**P2 - 建议修复**
- 弱密码未拦截
- CORS策略过宽
- 响应时间过长

**P3 - 优化项**
- 日志不完善
- 错误提示不友好
- 性能可优化

### 修复验证

1. **修复代码**
2. **重新执行相关测试**
   ```bash
   npm run test:security  # 修复安全问题后
   npm run test:api       # 修复功能问题后
   ```
3. **确认测试通过**
4. **更新测试报告**

---

## 📝 测试检查清单

在正式上线前，确保：

- [ ] API功能测试通过率 ≥ 95%
- [ ] 数据库完整性测试通过率 = 100%
- [ ] 安全测试通过率 = 100%
- [ ] 所有P0/P1问题已修复
- [ ] 性能基准达标
- [ ] 测试报告已归档
- [ ] 已在生产环境验证
- [ ] 回滚方案准备就绪

---

## 🎓 扩展阅读

### 测试最佳实践

1. **自动化测试集成到CI/CD**
   ```yaml
   # .github/workflows/test.yml
   - name: Run Tests
     run: npm run test:all
   ```

2. **定期回归测试**
   - 每次发版前执行完整测试
   - 每周执行一次安全测试
   - 每月检查数据库完整性

3. **监控和告警**
   - 生产环境实时监控
   - 错误率超过阈值告警
   - 性能下降自动通知

### 推荐工具

- **压力测试:** Apache JMeter, K6
- **API测试:** Postman, Insomnia
- **安全扫描:** OWASP ZAP, Burp Suite
- **性能监控:** New Relic, Datadog

---

## 📞 支持与反馈

遇到问题？

1. 查看 `test-report.html` 详细日志
2. 检查 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. 提交Issue到项目仓库

**测试愉快！** 🎉
