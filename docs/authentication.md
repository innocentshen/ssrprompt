# SSRPrompt 认证增强方案（邮箱验证码 + 忘记密码 + 第三方登录）

本文档描述认证系统的设计与落点位置（并指导实现），包含：
- **邮箱验证码注册**（可开关，用于防滥用）
- **忘记密码**（邮箱验证码重置密码）
- **第三方登录**（Google OAuth、Linux.do OAuth）

## 1. 功能开关与约束

### 1.1 注册控制
- `ALLOW_REGISTRATION`：是否允许注册（已有逻辑）
- `REQUIRE_EMAIL_VERIFICATION`：注册时是否必须邮箱验证码

约束：
- `ALLOW_REGISTRATION=false` 时：`/auth/register` 禁用；OAuth 回调只能登录已存在用户，不允许创建新用户。
- `REQUIRE_EMAIL_VERIFICATION=true` 时：`/auth/register` 必须携带验证码 `code`，验证通过才创建用户。

### 1.2 第三方登录开关
- `OAUTH_GOOGLE_ENABLED`
- `OAUTH_LINUXDO_ENABLED`

## 2. 数据库结构（Prisma）

### 2.1 邮箱验证码表：`email_verifications`
用途：注册验证码、重置密码验证码

关键字段：
- `email`：目标邮箱
- `code_hash`：验证码的哈希（不落明文）
- `type`：`register` / `reset_password`
- `expires_at`：过期时间（默认 15 分钟）
- `attempts`：验证失败次数（默认最多 5 次）
- `verified`：是否已使用

### 2.2 OAuth 账号绑定表：`oauth_accounts`
用途：第三方账号与本系统用户绑定

关键字段：
- `user_id`：本系统用户 ID
- `provider`：`google` / `linuxdo`
- `provider_user_id`：第三方用户 ID
- `provider_email`：第三方邮箱（如有）
- `access_token_encrypted` / `refresh_token_encrypted`：令牌加密存储（可选）

### 2.3 User 表调整
- 增加 `oauthAccounts` 关联（不改变既有字段含义）

## 3. 后端 API 设计（/api/v1/auth）

### 3.1 公共配置
`GET /auth/config`

响应：
```json
{
  "allowRegistration": true,
  "requireEmailVerification": false,
  "oauth": {
    "google": { "enabled": false },
    "linuxdo": { "enabled": false }
  }
}
```

### 3.2 发送验证码（注册/重置密码）
`POST /auth/send-code`

请求：
```json
{ "email": "user@example.com", "type": "register" }
```

响应：
```json
{ "success": true, "expiresIn": 900 }
```

规则：
- `type=register`：如果邮箱已注册，返回 409（或按需改为不暴露存在性）。
- 发送频率：同一邮箱同一类型 60 秒内最多 1 次；并对 IP 做 rate limit。

### 3.3 注册（可选验证码）
`POST /auth/register`

请求（验证码开启时需要 `code`）：
```json
{ "email": "user@example.com", "password": "Admin@123456", "name": "Tom", "code": "123456" }
```

规则：
- `ALLOW_REGISTRATION=false`：返回 403
- `REQUIRE_EMAIL_VERIFICATION=true` 且 `code` 缺失/错误：返回 400

### 3.4 忘记密码 / 重置密码
`POST /auth/forgot-password`（语义接口，可内部复用 send-code）

请求：
```json
{ "email": "user@example.com" }
```

响应：
```json
{ "success": true, "expiresIn": 900 }
```

说明：建议不暴露邮箱是否存在（统一返回 success），避免枚举。

`POST /auth/reset-password`

请求：
```json
{ "email": "user@example.com", "code": "123456", "newPassword": "NewPass@1234" }
```

规则：
- 验证码通过后更新密码，并清理该用户所有 Session（强制登出其它设备）
- 可以顺带把 `emailVerified` 置为 `true`（因为已完成邮箱验证）

### 3.5 OAuth
入口（浏览器跳转）：
- `GET /auth/oauth/google`
- `GET /auth/oauth/linuxdo`

回调：
- `GET /auth/oauth/google/callback`
- `GET /auth/oauth/linuxdo/callback`

回调成功后重定向到前端：
- `/<frontend>/oauth/callback?accessToken=...&refreshToken=...&expiresAt=...`

安全点：
- 使用 `state` + HttpOnly Cookie 进行校验，防止 CSRF
- OAuth Token（如需存储）使用 AES-256-GCM 加密后入库

**Linux.do 特别说明**：
- Linux.do 的 user info 通常不返回邮箱；本系统 User 表要求 email 必填，因此需要生成一个稳定的“占位邮箱”（例如 `linuxdo+<providerUserId>@users.ssrprompt.local`），并在 UI 里允许后续绑定真实邮箱（后续增强项）。

## 4. 前端 UI 落点

### 4.1 登录页（LoginPage）
- “忘记密码？”：放在密码输入框下方/右侧
- “第三方登录”按钮同一行：Google 与 Linux.do 并排（仅当后端 config 返回 enabled）

### 4.2 注册页（LoginPage 内 register 模式）
- `requireEmailVerification=true` 时显示 “邮箱验证码” 输入框，右侧内嵌“发送验证码”按钮
- 倒计时/发送中/可重发状态

### 4.3 忘记密码页（ForgotPasswordPage）
- 邮箱、验证码（带发送按钮）、新密码、确认新密码

### 4.4 OAuth 回调页（OAuthCallbackPage）
- 解析 URL 参数，写入 token，拉取 `/auth/me`，然后跳回首页（或原路由）

## 5. 环境变量（server/.env.example）

新增（示例）：
- `REQUIRE_EMAIL_VERIFICATION=false`
- SMTP：
  - `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM`
- OAuth：
  - `OAUTH_GOOGLE_ENABLED` `OAUTH_GOOGLE_CLIENT_ID` `OAUTH_GOOGLE_CLIENT_SECRET` `OAUTH_GOOGLE_CALLBACK_URL`
  - `OAUTH_LINUXDO_ENABLED` `OAUTH_LINUXDO_CLIENT_ID` `OAUTH_LINUXDO_CLIENT_SECRET` `OAUTH_LINUXDO_CALLBACK_URL`

说明：SMTP/OAuth 变量可以按“启用时必须”原则校验；未启用时允许为空。

