# PRD：文件转文字（PDF/图片）+ 可选 OCR + 文件服务（MinIO）

- 版本：v1.3（按最新评审修订）
- 日期：2026-01-08
- 端：浏览器端（性能优先）
- 范围：仅 PDF、图片（png/jpg/webp）；Excel 不做

---

## 1) 背景

- 部分模型/API 仅支持纯文本（不支持视觉/不支持文件输入），需要先把 PDF/图片抽取成文本再提交给大模型。
- PaddleOCR 可本地部署，适合作为主力；Datalab 用于拓展/实验，由用户在设置中明确选择。
- 现有附件以 `base64` 形态落库/存历史，体积大、重复存储多、预览与二次处理成本高；因此本期引入文件服务（MinIO），统一以 `fileId` 引用附件。

---

## 2) 目标（Goals）

### 2.1 OCR 与文件上传的可用性

- OCR 由用户在设置中决定是否启用。
- 启用 OCR 时，仅“当前所选模型 `supports_vision=false`”允许上传文件并走 OCR 流程。
- OCR 成功后，将文本纳入“当前对话上下文”用于提问（见 4.3）。

### 2.2 Provider 二选一

- 服务商二选一：PaddleOCR 或 Datalab（不做自动路由/兜底）。
- 支持 系统内置 或 自定义（API URL + Key）；`api_key` 加密落库。

### 2.3 文件服务（MinIO）与 `fileId` 引用（本期必须）

- 统一将文件（PDF/图片）存入文件服务（MinIO），后端转发（浏览器不直连 MinIO）。
- 所有历史记录（Trace / Evaluation TestCase 等）仅保存 `fileId` + 元信息，不重复保存文件本体。
- 支持预览/下载：历史记录根据 `fileId` 获取文件内容，避免二次存储。
- 20MB 以内为默认上限（上传与预览链路一致）。

### 2.4 发送前预算校验（不切割）

- 点击发送时，按模型配置的 `max_context_length` 做上下文预算校验：不切割，预算不足直接拦截。
- 若为评测中心用例：直接返回超上下文错误（不调用 LLM）。

### 2.5 设置中提供“服务商测试”（必须）

- 在设置中提供“测试当前 OCR Provider”：上传文件 → 真实调用 → 展示结果预览与统计，辅助用户评估效果。

---

## 3) 非目标（Non-goals）

- 不做：自动路由/优先级/fallback/一键切换 provider 重试（但 UI 需要展示流程节点与终止原因）。
- 不做：检索、分块拼装、按需发送。
- 不做：视觉模型的文件直传链路（本 PRD 只覆盖“非视觉 + OCR 转文字”）。
- 文件不做会话临时：文件按系统方式落库/存储（与当前处理方式一致）。

---

## 4) 关键规则（强约束）

### 4.1 文件上传入口可用性

当且仅当：

- OCR 已启用 = true
- 当前模型 `supports_vision = false`

才显示/启用“上传文件”入口；否则禁用并提示原因。

### 4.2 OCR 失败即终止

- OCR 失败：流程终止，不进入预算校验/不调用 LLM。

### 4.3 “只在当前对话首次发送一次并随后只引用”

- 对每个 `conversation_id × file_id`：
  - 只生成/写入一次“附件文本消息”（包含 OCR `full_text`）。
  - 后续提问不再重复生成该“附件文本消息”，只在用户消息中追加短引用（例如：引用附件：`contract.pdf`）。
- 发送前预算校验时，需把该“附件文本消息”计入上下文（后续可能因上下文增长而被拦截，这是预期行为）。

---

## 5) 功能需求（FR）

### 5.1 模型管理：supports_vision

- 在“添加/编辑模型”支持配置 `supports_vision: boolean`。
- 用途：决定 OCR 启用时是否允许文件上传。

### 5.2 设置：OCR 总开关

- 设置项：启用文件 OCR（PDF/图片转文本）（默认建议 Off）
- Off：禁用文件上传入口。
- On：若模型无视觉，则允许文件上传并触发 OCR。

### 5.3 设置：服务商二选一（Provider）

- OCR 服务商（单选）：PaddleOCR / Datalab
- 不并行、不自动切换。

### 5.4 设置：服务商配置（系统内置/自定义）

- 字段：
  - `credential_source: system | custom`
  - `base_url`：custom 必填（system 只读展示）
  - `api_key`：custom 需要则填写（加密落库）
- 约束：
  - system key 永不下发前端，仅后端 proxy 使用。
  - custom key 加密落库，UI 仅显示 last4。

### 5.5 设置：服务商测试（必须）

- 上传 PDF/图片，后端按当前 provider 配置实际调用
- 展示：
  - 是否连通（成功/失败、耗时、错误原因）
  - OCR 是否成功（成功/失败）
  - 输出预览（前 N 字；PDF 可按页预览更佳）
  - 统计：页数、总字符数（可选）

### 5.6 对话页：流程节点展示（必须）

节点固定展示（不做 fallback 逻辑）：

1. 文件上传/入库（files）
2. OCR 处理中
3. OCR 成功/失败（失败终止）
4. 发送时预算校验
5. 发送到 LLM

### 5.7 文件服务（MinIO）：上传/预览/历史引用（必须）

- 上传：浏览器 → 后端（multipart）→ MinIO；返回 `fileId`
- 预览/下载：浏览器 → 后端（鉴权 + Range）→ MinIO
- 落库：历史记录仅保存 `fileId/name/type/size` 引用（不保存 base64）

---

## 6) 数据与存储

### 6.1 文件表（新增）

- `files`
  - `id (uuid)`：fileId
  - `user_id`
  - `original_name`
  - `mime_type`
  - `size`
  - `sha256`（可用于未来去重）
  - `bucket`
  - `object_key`
  - `created_at/updated_at`

### 6.2 OCR 设置（用户级）

- `ocr_provider_settings`
  - `user_id`
  - `ocr_enabled`
  - `selected_provider (paddle|datalab)`
  - `credential_source (system|custom)`
  - `base_url`
  - `api_key_ciphertext`（加密）
  - `api_key_last4`
  - `key_id/key_version`
  - `created_at/updated_at`

### 6.3 OCR 结果（与 file_id 绑定）

- `ocr_results`
  - `id`
  - `file_id`
  - `conversation_id`（用于“首次注入一次”的追溯）
  - `provider`
  - `status (success|failed)`
  - `error`
  - `full_text`
  - `pages_json`（可选：页级文本用于预览）
  - `created_at`

### 6.4 对话-文件注入状态（避免重复“首次发送”）

- `conversation_attachments`
  - `conversation_id`
  - `file_id`
  - `ocr_result_id`
  - `injected_message_id`
  - `injected_at`

---

## 7) 后端 API（建议）

### 7.1 Files（已落地/本期必须）

- `POST /api/v1/files`：multipart 上传，返回 `{ id, name, type, size, createdAt }`
- `GET /api/v1/files/:id/meta`：元信息
- `GET /api/v1/files/:id`：下载/预览（支持 Range）

### 7.2 OCR 抽取（本期规划）

- `POST /api/v1/ocr/extract`
  - 入参：`file_id, conversation_id`
  - 行为：创建 job，调用选定 provider，写入 `ocr_results`
- `GET /api/v1/ocr/extract/:job_id`
  - 返回：`status/progress/result_id/error`

### 7.3 OCR 测试（本期规划/必须）

- `POST /api/v1/ocr/test`
  - 入参：multipart file（或 file_id） +（可选）临时 provider 配置（或直接用当前用户设置）
  - 返回：`success/latency_ms/preview_text/preview_pages/error`

### 7.4 对话发送（本期规划）

- `POST /api/v1/chat/send`
  - 入参：`conversation_id, message, is_eval_case`
  - 服务端逻辑：
    1. 若对话存在已 OCR 成功但未注入的附件：先写入一次“附件文本消息”
    2. 计算预算；超限则按规则拦截/报错
    3. 调用 LLM

> 备注：如果继续沿用 `POST /api/v1/chat/completions`，建议扩展消息内容支持 `file_ref: {fileId}` 作为内部引用格式，由后端在 OCR/发送阶段拉取文件并处理。

---

## 8) 安全

### 8.1 api_key 加密落库

- 信封加密：AES-256-GCM + KMS/主密钥（记录 key_id/version）
- system key 永不下发前端

### 8.2 文件服务与网络隔离

- MinIO 仅内网可达；浏览器不直连
- 所有上传/下载经后端鉴权转发

### 8.3 自定义 base_url 安全

- 自定义 base_url 走后端 proxy 必须 SSRF 防护（白名单/禁止内网/禁止重定向/端口限制等）

---

## 9) 线框图（Wireframes）

### 9.1 模型管理：添加/编辑模型（supports_vision）

```
+-------------------- Add/Edit Model --------------------+
| Name: [Text-only-A]                                     |
| Base URL: [https://...]                                 |
| Max Context Length: [8000]                              |
| Supports Vision:  [ ] (checkbox)                        |
| [Save]                                                  |
+---------------------------------------------------------+
```

### 9.2 对话页：上传入口受 OCR + supports_vision 控制

```
+---------------- Chat ----------------+
| Model: Text-only-A  Vision: No       |
| OCR: On                              |
| [Attach File] (enabled)              |
+--------------------------------------+

+---------------- Chat ----------------+
| Model: Vision-Model  Vision: Yes     |
| OCR: On                              |
| [Attach File] (disabled)             |
| Tip: OCR 上传仅支持非视觉模型          |
+--------------------------------------+
```

### 9.3 对话页：流程节点（失败终止）

```
File: contract.pdf
(1) Upload & Store   [✓]
(2) OCR Processing   [··· 12/48]
(3) OCR Result       [✓] success
(4) Budget Check     [✓]
(5) Send to LLM      [✓]

失败时：
(3) OCR Result       [✗] error=timeout
=> Stop (LLM not called)
```

### 9.4 设置页：OCR 开关 + Provider 单选 + 测试

```
+----------- OCR Settings -----------+
| [✓] Enable OCR for files           |
| Provider: (•) PaddleOCR ( ) Datalab|
| Credential: (•) System ( ) Custom  |
| Base URL: [http://127.0.0.1:18080] |
| API Key:  [************] last4=ABCD|
| [Test Provider...]  [Save]         |
+-----------------------------------+
```

### 9.5 Provider 测试弹窗：上传文件与输出预览

```
| Provider: PaddleOCR                        |
| Base URL: http://127.0.0.1:18080          |
| API Key: ****                              |
| Test File: [Choose...] (pdf/jpg/png/webp)  |
| [Run Test]                                 |
| Result: SUCCESS  Latency: 2.1s             |
| Pages: 12   Chars: 18,234                  |
| Preview: (first 1000 chars / per page)     |
| [Close]                                    |
+-------------------------------------------+
```

---

## 10) 验收标准（AC）

- 文件服务可用：上传返回 `fileId`；预览/下载可用（含 Range）。
- 历史记录附件仅保存 `fileId` 引用，不重复保存文件本体；可基于 `fileId` 预览与二次处理。
- OCR 开关关闭时：文件上传入口禁用。
- OCR 开关开启且模型不支持视觉：文件上传入口可用并触发 OCR。
- OCR 失败终止流程，不调用 LLM。
- 每个对话×文件只注入一次“附件文本消息”，后续只引用。
- 发送前预算校验：不切割，超限拦截；评测中心用例直接返回超上下文错误。
- 设置中可测试 OCR provider 并看到输出预览。

