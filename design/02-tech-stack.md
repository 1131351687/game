# 02 · 技术栈选型

## 1. 选型原则

1. **纯前端**：无后端，可静态部署（GitHub Pages / Vercel / Cloudflare Pages）
2. **TypeScript**：数据表同构对象多，类型系统收益巨大
3. **响应式状态**：状态变更自动驱动视图重绘，从根上避免"改数据要手动重绘"导致的不一致
4. **代码分割**：按 Tab 懒加载，首屏 < 200KB
5. **离线优先**：PWA 能力（可选，v1.0 后加）
6. **可维护**：避免巨型文件，模块边界清晰

## 2. 核心技术栈

| 类别 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 语言 | TypeScript | 5.x | 类型系统 + 编译期检查 |
| 构建 | Vite | 5.x | 极速 HMR + Rollup 打包 |
| UI 框架 | **React 18** | 18.x | 生态成熟、Hooks 稳定、社区大 |
| 状态管理 | **Zustand** | 4.x | 极简 API、无 Provider、性能优 |
| 样式 | **Tailwind CSS** + CSS Variables | 3.x | 原子类 + 主题切换零成本 |
| 路由 | React Router | 6.x | 单页应用 + 子路由 |
| 图标 | lucide-react | 最新 | 轻量、可定制 |
| 图表 | **Recharts** | 2.x | React 原生、性能可接受 |
| 工具库 | **lodash-es** + **clsx** + **date-fns** | 最新 | 按需引入、Tree-shaking 友好 |
| 数字格式化 | 自研 `formatNumber` | — | 支持科学计数法 + 缩写后缀 |
| 本地化 | **i18next** + react-i18next | 23.x | 异步加载、命名空间 |
| 存档 | **Dexie.js**（IndexedDB 封装） | 4.x | Promise API + 类型安全 |
| 压缩 | **lz-string** 或 **pako** | 最新 | 存档体积压缩 |
| 测试 | **Vitest** + **Playwright** | 最新 | 单测 + E2E |
| Lint | **ESLint** + **Prettier** | 最新 | 代码规范 |
| 部署 | Vercel / Cloudflare Pages | — | 静态托管 |

### 为什么选 React 而不是 Vue 3

两者都能胜任。选 React 的理由：
- 生态更大（第三方库、教程、招聘）
- Hooks 的"组合式"思路更适合"派生量"这种场景
- 团队/社区更熟（如果你是 Vue 出身，可替换为 Vue 3 + Pinia，方案完全对称）

**Vue 3 替代方案**：把 React 18 替换为 Vue 3，Zustand 替换为 Pinia，Tailwind 保持不变。其余设计完全相同。

## 3. 依赖清单（建议 package.json）

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.0",
    "dexie": "^4.0.0",
    "lz-string": "^1.5.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.0.0",
    "lodash-es": "^4.17.21",
    "recharts": "^2.10.0",
    "lucide-react": "^0.300.0",
    "i18next": "^23.7.0",
    "react-i18next": "^13.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.50.0",
    "prettier": "^3.1.0"
  }
}
```

## 4. 关键技术决策

### 4.1 为什么用 Zustand 而不是 Redux

- Zustand API 极简：`create<State>()((set, get) => ({...}))`
- 无 Provider、无 Action、无 Reducer
- 支持 selector 订阅，性能优于 Context + useReducer
- 适合放置游戏"单一状态 + 高频更新"场景

### 4.2 为什么用 IndexedDB 而不是 localStorage

| 维度 | localStorage | IndexedDB |
|---|---|---|
| 容量 | 5MB | 数百 MB 到 GB |
| API | 同步 | 异步（Promise） |
| 阻塞 | **阻塞主线程** | 不阻塞 |
| 结构化 | 仅字符串 | 支持对象、Blob |
| 大存档 | 频繁 `JSON.stringify` 卡顿 | 后台写入，无感 |

**放置游戏存档会随时间膨胀**（事件日志、统计、成就解锁…），localStorage 必然爆。

### 4.3 为什么用 Tailwind 而不是 LESS/SASS

- 原子类，组件样式即代码
- CSS Variables 原生支持主题切换
- 无需预处理
- JIT 模式产物小（按需生成）
- 配合 `darkMode: 'class'` 一行切换深色模式

### 4.4 为什么不用 Web Worker 跑游戏逻辑

- 放置游戏逻辑量不大（每秒 < 1000 次计算），主线程足够
- Worker 跨线程通信有 1-2ms 延迟，对 250ms 循环可接受但无收益
- **只把定时器丢进 Worker**（避免浏览器节流 setTimeout），逻辑留在主线程

## 5. 开发环境

```bash
# 安装 Node.js 20 LTS
# 安装 pnpm（比 npm 快 3 倍）

pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 生产构建
pnpm test       # 单元测试
pnpm lint       # 代码检查
pnpm typecheck  # 类型检查
```

## 6. 代码风格约定

```ts
// ✅ 文件命名：kebab-case.ts / kebab-case.tsx
// ✅ 组件命名：PascalCase
// ✅ 变量/函数：camelCase
// ✅ 常量：UPPER_SNAKE_CASE
// ✅ 类型：PascalCase，不用 I 前缀
// ✅ 导出：显式 export，不用 export =
// ✅ 类型：用 interface 表示对象，用 type 表示联合/工具类型

// ✅ 单文件 < 400 行（超过就拆）
// ✅ 单函数 < 50 行（超过就拆）
// ✅ 缩进 2 空格
// ✅ 字符串用单引号
// ✅ 行尾加分号
// ✅ 不用 any（必须用时加注释说明）
```

## 7. 常见旧技术栈的迁移映射

| 常见旧方案 | 本项目替代 | 迁移成本 |
|---|---|---|
| jQuery `$.append(html)` | React JSX | 重写 |
| jQuery `$.ajax` | `fetch` + `import()` | 重写 |
| Vue 2 组件 | React 组件 | 重写 |
| Buefy UI | shadcn/ui 或自研 | 重写 |
| Popper.js | @popperjs/core + 自封装 | 复用 |
| Chart.js | Recharts | 重写 |
| SortableJS | @dnd-kit | 重写 |
| lz-string | lz-string（同库） | 复用 |
| esbuild | Vite | 配置 |
| LESS + csso | Tailwind | 重写 |
| servehere | Vite dev server | 复用 |
| gh-pages | Vercel CLI | 配置 |

**好消息**：lz-string、popper、sortable 思想可复用。**坏消息**：UI 层基本重写，但用 React 组件化反而更快。

---

*返回 [README](./README.md)*
