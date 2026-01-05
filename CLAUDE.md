# Claude Code 项目指令

## 项目简介

SSRPrompt v2.0 是一个 AI Prompt 开发和评测平台，采用前后端分离的 Monorepo 架构。

## 技术栈

- **前端**: React 18 + Vite + TypeScript + Tailwind CSS + Zustand
- **后端**: Express.js + TypeScript + Prisma ORM
- **数据库**: PostgreSQL
- **包管理**: pnpm workspace

## 项目结构

```
ssrprompt/
├── packages/
│   ├── client/          # 前端 React 应用
│   │   ├── src/
│   │   │   ├── api/     # API Client
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── store/   # Zustand Store
│   │   │   └── locales/ # 多语言
│   │   └── package.json
│   │
│   ├── server/          # 后端 Express 应用
│   │   ├── src/
│   │   │   ├── config/       # 环境配置
│   │   │   ├── controllers/  # 控制器
│   │   │   ├── services/     # 业务逻辑
│   │   │   ├── repositories/ # 数据访问层
│   │   │   ├── routes/       # 路由
│   │   │   ├── middleware/   # 中间件
│   │   │   └── utils/        # 工具函数
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   │
│   └── shared/          # 共享代码
│       └── src/
│           ├── types/      # 类型定义
│           ├── schemas/    # Zod 验证
│           ├── errors/     # 错误码
│           └── constants/  # 常量
│
├── package.json         # 根配置
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev              # 前端
pnpm dev:server       # 后端
pnpm dev:all          # 前后端同时启动

# 数据库
pnpm db:generate      # 生成 Prisma Client
pnpm db:push          # 推送 Schema
pnpm db:studio        # 打开 Prisma Studio

# 构建
pnpm build            # 前端
pnpm build:server     # 后端
```

## 数据库表结构变更规范

当需要修改数据库表结构时：

### 1. 修改 Prisma Schema

编辑 `packages/server/prisma/schema.prisma`：

```prisma
model NewTable {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("new_table")
}
```

### 2. 同步更新类型定义

在 `packages/shared/src/types/` 添加对应类型：

```typescript
export interface NewTable {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}
```

### 3. 添加 Zod 验证

在 `packages/shared/src/schemas/` 添加验证 Schema：

```typescript
export const CreateNewTableSchema = z.object({
  name: z.string().min(1),
});
```

### 4. 推送变更

```bash
pnpm db:push          # 开发环境
pnpm db:migrate       # 生产环境（创建迁移文件）
```

## 添加新 API 规范

### 完整流程

1. **类型定义** - `packages/shared/src/types/`
2. **Zod Schema** - `packages/shared/src/schemas/`
3. **Repository** - `packages/server/src/repositories/`
4. **Service** - `packages/server/src/services/`
5. **Controller** - `packages/server/src/controllers/`
6. **Routes** - `packages/server/src/routes/`
7. **前端 API** - `packages/client/src/api/`

### 示例：添加 Tags 功能

```typescript
// 1. packages/shared/src/types/tag.ts
export interface Tag {
  id: string;
  userId: string;
  name: string;
}

// 2. packages/shared/src/schemas/tag.ts
export const CreateTagSchema = z.object({
  name: z.string().min(1).max(50),
});

// 3. packages/server/src/repositories/tags.repository.ts
export class TagsRepository extends TenantRepository<Tag, ...> {
  // CRUD 方法
}

// 4. packages/server/src/services/tags.service.ts
export class TagsService {
  async findAll(userId: string) { ... }
}

// 5. packages/server/src/controllers/tags.controller.ts
export const tagsController = {
  list: async (req, res) => { ... }
};

// 6. packages/server/src/routes/tags.routes.ts
router.get('/', asyncHandler(tagsController.list));

// 7. packages/client/src/api/tags.ts
export const tagsApi = {
  list: () => apiClient.get<Tag[]>('/tags'),
};
```

## 安全规范

### API Key 加密

所有 API Key 必须使用 AES-256-GCM 加密存储：

```typescript
import { encrypt, decrypt } from '../utils/crypto.js';

// 存储时加密
const encryptedKey = encrypt(apiKey);

// 使用时解密
const apiKey = decrypt(encryptedKey);
```

### 多租户隔离

所有数据访问必须通过 `TenantRepository` 或显式包含 `userId` 过滤：

```typescript
// ✅ 正确 - 使用 TenantRepository
class MyRepository extends TenantRepository<...> { }

// ✅ 正确 - 显式过滤
prisma.myTable.findMany({ where: { userId } });

// ❌ 错误 - 缺少用户过滤
prisma.myTable.findMany();
```

### JWT 认证

受保护的路由必须使用 `authenticateJWT` 中间件：

```typescript
router.use('/protected', authenticateJWT, protectedRoutes);
```

## 代码风格

- 使用 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 样式使用 Tailwind CSS
- 避免 `any` 类型，使用 Zod 进行运行时验证
- 数据库查询明确指定字段，禁止 `SELECT *`

## 工作流规范

1. **代码变更前确认分支**：确保在正确的分支上工作
2. **先读后改**：修改文件前必须先读取
3. **小步提交**：每个功能点单独提交
4. **类型优先**：先定义类型，再实现逻辑
