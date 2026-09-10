# 03 · 架构设计

## 1. 四层分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  UI 层 (ui/)                                                │
│  React 组件、Tabs、渲染函数、交互处理                          │
├─────────────────────────────────────────────────────────────┤
│  状态层 (state/)                                            │
│  Zustand Store、派生量缓存、快照                              │
├─────────────────────────────────────────────────────────────┤
│  玩法层 (game/)                                             │
│  资源 / 岗位 / 科技 / 政府 / 太空 / 重置 / 成就 等业务逻辑    │
├─────────────────────────────────────────────────────────────┤
│  核心层 (core/)                                             │
│  时钟 / 存档 / 随机数 / 消息 / 本地化 / 格式化                 │
└─────────────────────────────────────────────────────────────┘
                          ↕
                 ┌─────────────────┐
                 │  数据层 (data/) │
                 │  纯 JSON/TS 常量 │
                 └─────────────────┘
```

### 调用方向规则

- **核心层 (core)**：不依赖任何其他层
- **数据层 (data)**：不依赖任何其他层
- **玩法层 (game)**：可依赖 core + data，**不可依赖 state 或 ui**
- **状态层 (state)**：可依赖 core + data + game
- **UI 层 (ui)**：可依赖所有其他层

**禁止**：玩法层直接操作 DOM，UI 层直接修改状态（必须通过 action）

## 2. 目录结构

```
civilis/
├── public/
│   ├── icons/                  # 图标资源
│   └── fonts/                  # 字体
├── src/
│   ├── core/                   # 核心基础设施
│   │   ├── clock/              # 游戏时钟
│   │   │   ├── worker.ts       # Web Worker 入口
│   │   │   ├── scheduler.ts    # 三级循环调度
│   │   │   └── types.ts
│   │   ├── save/               # 存档系统
│   │   │   ├── db.ts           # Dexie 数据库定义
│   │   │   ├── migration.ts    # 版本迁移
│   │   │   ├── serializer.ts   # JSON + 压缩
│   │   │   └── index.ts
│   │   ├── rng/                # 随机数
│   │   │   ├── lcg.ts          # 线性同余
│   │   │   └── index.ts
│   │   ├── message/            # 消息队列
│   │   │   ├── queue.ts
│   │   │   └── filters.ts
│   │   ├── i18n/               # 本地化
│   │   │   ├── init.ts
│   │   │   └── locales/
│   │   ├── format/             # 数字格式化
│   │   │   └── number.ts
│   │   └── logger.ts           # 日志
│   │
│   ├── game/                   # 玩法系统
│   │   ├── resources/          # 资源系统
│   │   │   ├── types.ts
│   │   │   ├── engine.ts       # 产出计算
│   │   │   └── actions.ts
│   │   ├── jobs/               # 岗位系统
│   │   │   ├── types.ts
│   │   │   ├── engine.ts
│   │   │   └── actions.ts
│   │   ├── tech/               # 科技系统
│   │   │   ├── types.ts
│   │   │   ├── tree.ts         # 科技树
│   │   │   └── actions.ts
│   │   ├── civics/             # 政府系统
│   │   │   ├── types.ts
│   │   │   ├── engine.ts
│   │   │   └── actions.ts
│   │   ├── space/              # 太空探索
│   │   │   ├── types.ts
│   │   │   ├── planets.ts
│   │   │   └── actions.ts
│   │   ├── gene/               # 基因/种族
│   │   ├── events/             # 随机事件
│   │   ├── season/             # 季节
│   │   ├── prestige/           # 重置系统
│   │   └── achieve/            # 成就系统
│   │
│   ├── state/                  # 状态管理
│   │   ├── store.ts            # 主 Store
│   │   ├── selectors.ts        # 选择器
│   │   ├── derivations.ts      # 派生量缓存
│   │   ├── snapshots.ts        # 快照
│   │   └── actions/            # 业务 actions
│   │       └── index.ts
│   │
│   ├── ui/                     # UI 层
│   │   ├── app/
│   │   │   ├── App.tsx         # 根组件
│   │   │   └── layout/
│   │   ├── tabs/               # 主 Tabs
│   │   │   ├── CivilTab.tsx
│   │   │   ├── CivicTab.tsx
│   │   │   ├── ResearchTab.tsx
│   │   │   ├── SpaceTab.tsx
│   │   │   ├── StatsTab.tsx
│   │   │   └── SettingsTab.tsx
│   │   ├── components/         # 通用组件
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Queue.tsx
│   │   │   ├── NumberInput.tsx
│   │   │   ├── Chart.tsx
│   │   │   └── MessageLog.tsx
│   │   └── renderers/          # 子系统渲染器
│   │       ├── ResourcePanel.tsx
│   │       ├── TechTree.tsx
│   │       └── SpaceMap.tsx
│   │
│   ├── data/                   # 纯数据表
│   │   ├── resources.ts        # 资源定义
│   │   ├── jobs.ts             # 岗位定义
│   │   ├── tech.ts             # 科技定义（500+ 条）
│   │   ├── events.ts           # 事件定义（20+ 条）
│   │   ├── seasons.ts          # 季节定义
│   │   ├── civilizations.ts    # 文明定义
│   │   └── achievements.ts     # 成就定义
│   │
│   ├── hooks/                  # React Hooks
│   │   ├── useGameClock.ts
│   │   ├── useResource.ts
│   │   └── useSave.ts
│   │
│   ├── styles/                 # 全局样式
│   │   ├── index.css           # Tailwind 入口
│   │   └── themes.ts           # 主题定义
│   │
│   └── main.tsx                # 应用入口
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

## 3. 模块边界规则

### 3.1 core/ 规则
- **不依赖任何其他层**
- 不允许 import game / state / ui / data
- 函数必须是纯函数（无副作用，除存档写入）
- 测试覆盖率必须 100%

### 3.2 data/ 规则
- **纯数据，零逻辑**
- 不允许 import 任何业务代码
- 只允许 export 常量
- 类型定义集中在 `types.ts`

### 3.3 game/ 规则
- 可 import core + data
- **不允许 import state 或 ui**
- 每个子系统内部结构一致：`types.ts / engine.ts / actions.ts`
- `engine.ts` 是纯函数（计算产出、消耗等）
- `actions.ts` 修改状态（调用 store action）

### 3.4 state/ 规则
- 可 import core + data + game
- **不允许 import ui**
- Zustand store 集中在此
- 派生量必须有缓存策略

### 3.5 ui/ 规则
- 可 import 所有层
- **不允许直接修改状态**（必须调用 store action）
- 组件尽量无状态（props 驱动）
- 渲染器只读 state，不写 state

## 4. 数据流（单向）

```
用户操作 (UI)
    ↓
store action (state/)
    ↓
业务逻辑 (game/)
    ↓
状态更新 (state/)
    ↓
UI 重绘 (ui/)
```

**禁止**：
- UI 直接改 state（`store.setState(...)` 在组件里）
- game 层直接操作 DOM
- 跨层调用（UI 直接调 game）

## 5. 主循环与数据流集成

```
Worker 时钟 (core/clock/)
    ↓ postMessage {loop: 'main', periods}
scheduler (core/clock/scheduler.ts)
    ↓
execGameLoops(periods)
    ├─ fastLoop()    → state.derivations 更新
    ├─ midLoop()     → game/events 触发
    ├─ doCallbacks() → game/prestige 存档
    └─ longLoop()    → core/save 写盘 + game/achieve 检查
```

详见 04-core-systems.md。

## 6. 子系统模块模板

每个子系统都遵循统一结构：

```
game/{system}/
├── types.ts         # 类型定义
├── engine.ts        # 纯函数（计算、判断）
├── actions.ts       # 状态修改（调用 store）
├── index.ts         # 导出
└── README.md        # 子系统说明（可选）
```

### types.ts 示例（resources）
```ts
export interface ResourceDef {
  id: string;
  name: string;
  icon: string;
  baseValue: number;
  baseCost: number;
  costMultiplier: number;
  unlock: UnlockCondition;
  category: 'basic' | 'industrial' | 'space' | 'special';
}

export interface ResourceState {
  id: string;
  count: number;
  storage: number;
  unlocked: boolean;
}
```

### engine.ts 示例
```ts
export function resourceOutput(def: ResourceDef, state: ResourceState, context: GameContext): number {
  const base = def.baseValue * state.count;
  const techBonus = context.techs['production_boost'] ? 1.5 : 1;
  return base * techBonus;
}
```

### actions.ts 示例
```ts
export function addResource(id: string, amount: number): void {
  useStore.setState(state => ({
    resources: {
      ...state.resources,
      [id]: { ...state.resources[id], count: state.resources[id].count + amount }
    }
  }));
}
```

## 7. 关键文件清单（MVP 必须实现）

| 文件 | 职责 | 优先级 |
|---|---|---|
| `core/clock/worker.ts` | Web Worker 定时器 | P0 |
| `core/clock/scheduler.ts` | 三级循环调度 | P0 |
| `core/save/db.ts` | IndexedDB 数据库 | P0 |
| `core/save/migration.ts` | 版本迁移 | P0 |
| `core/rng/lcg.ts` | 种子随机 | P0 |
| `core/format/number.ts` | 数字格式化 | P0 |
| `game/resources/engine.ts` | 资源产出 | P0 |
| `game/jobs/engine.ts` | 岗位产出 | P0 |
| `game/tech/tree.ts` | 科技树 | P0 |
| `game/prestige/engine.ts` | 重置逻辑 | P0 |
| `state/store.ts` | Zustand 主 Store | P0 |
| `ui/app/App.tsx` | 根组件 | P0 |
| `data/resources.ts` | 资源定义 | P0 |
| `data/jobs.ts` | 岗位定义 | P0 |
| `data/tech.ts` | 科技定义 | P0 |

详见 10-roadmap.md 的"里程碑"部分。

## 8. 功能模块与代码位置映射

| 功能模块 | 本项目实现位置 |
|---|---|
| 全局状态变量 | `state/store.ts` + `game/*/types.ts` |
| 主循环与应用入口 | `ui/app/App.tsx` + `core/clock/scheduler.ts` |
| 页面布局与 Tab 渲染 | `ui/app/layout/` + `ui/tabs/` |
| 通用工具（格式化 / 消息 / 随机 / 时钟） | 拆为 `core/format` + `core/message` + `core/rng` + `core/clock` |
| 资源定义与产出逻辑 | `game/resources/` + `data/resources.ts` |
| 岗位与工人分配 | `game/jobs/` + `data/jobs.ts` |
| 科技树 | `game/tech/` + `data/tech.ts` |
| 太空探索 | `game/space/` + `data/civilizations.ts` |
| 随机事件 | `game/events/` + `data/events.ts` |
| 季节 / 周期性玩法 | `game/season/` + `data/seasons.ts` |
| 多级重置 | `game/prestige/` |
| 成就系统 | `game/achieve/` + `data/achievements.ts` |
| 本地化 | `core/i18n/` |
| 样式 | `styles/index.css` + Tailwind |

---

*返回 [README](./README.md)*
