# 11 · 附录

## 1. 数值平衡表模板

### 1.1 Excel 模板结构

```
Sheet 1: 资源表
  列：ID | 名称 | 基础产出 | 基础成本 | 成本倍率 | 存储上限 | 解锁阶段 | 备注

Sheet 2: 岗位表
  列：ID | 名称 | 输入 | 输入成本 | 输出 | 输出速率 | 解锁阶段 | 备注

Sheet 3: 科技表
  列：ID | 名称 | 类别 | 成本 | 最大等级 | 前置 | 效果 | 解锁 | 备注

Sheet 4: 建筑表
  列：ID | 名称 | 类别 | 成本 | 效果 | 解锁 | 备注

Sheet 5: 事件表
  列：ID | 名称 | 频率 | 持续 | 严重度 | 效果 | 奖励 | 惩罚 | 备注

Sheet 6: 成就表
  列：ID | 名称 | 类别 | 条件 | 奖励 | 隐藏 | 备注

Sheet 7: 平衡性测试
  列：阶段 | 资源 | 科技 | 建筑 | 时间 | 玩家反馈
```

### 1.2 平衡性调整原则

1. **前期（0-30 分钟）**：节奏快，每 5 分钟解锁新内容
2. **中期（30 分钟-2 小时）**：节奏适中，每 10 分钟解锁新内容
3. **后期（2-10 小时）**：节奏慢，每 30 分钟解锁新内容
4. **终局（10 小时+）**：自由探索，沙盒模式

### 1.3 关键数值公式

```
资源产出 = 基础值 × sqrt(数量) × 科技 × 政府 × 季节 × 重置
资源成本 = 基础成本 × (成本倍率 ^ 数量)
重置点数 = floor(sqrt(总资源 / 1e6))
科技成本 = 基础成本 × (成本倍率 ^ 等级)
事件频率 = 基础频率 × (1 + 随机(0, 0.4) - 0.2)
```

## 2. 存档迁移示例

### 2.1 完整迁移示例

```ts
// migration.ts
import type { GameSnapshot } from './types';

export const CURRENT_VERSION = 3;

const migrations: Migration[] = [
  // v0 → v1：初始版本
  {
    from: 0,
    to: 1,
    migrate: (data: any) => {
      // 添加缺失字段
      return {
        ...data,
        version: 1,
        seed: data.seed || 2,
        warSeed: data.warSeed || 2,
        timestamp: data.timestamp || Date.now(),
        settings: { ...defaultSettings, ...data.settings },
        stats: { ...defaultStats, ...data.stats },
      };
    }
  },

  // v1 → v2：添加新资源 'iron'
  {
    from: 1,
    to: 2,
    migrate: (data: any) => {
      if (!data.resources.iron) {
        data.resources.iron = {
          id: 'iron',
          count: 0,
          unlocked: false,
          outputPerSecond: 0
        };
      }
      data.version = 2;
      return data;
    }
  },

  // v2 → v3：修改重置结构
  {
    from: 2,
    to: 3,
    migrate: (data: any) => {
      if (!data.prestige.history) {
        data.prestige.history = [];
      }
      data.version = 3;
      return data;
    }
  }
];

export function migrate(data: any): GameSnapshot {
  let current = data;
  let version = current.version || 0;

  while (version < CURRENT_VERSION) {
    const migration = migrations.find(m => m.from === version);
    if (!migration) {
      throw new Error(`No migration from v${version} to v${version + 1}`);
    }
    current = migration.migrate(current);
    version = migration.to;
  }

  return current as GameSnapshot;
}
```

### 2.2 存档兼容性测试

```ts
// 测试用例
describe('save migration', () => {
  test('migrate v0 to v3', () => {
    const v0 = { resources: { food: { count: 100 } } };
    const migrated = migrate(v0);
    expect(migrated.version).toBe(3);
    expect(migrated.resources.food.count).toBe(100);
    expect(migrated.resources.iron).toBeDefined();
    expect(migrated.prestige.history).toEqual([]);
  });

  test('migrate v1 to v3', () => {
    const v1 = {
      version: 1,
      resources: { food: { count: 100 } }
    };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(3);
    expect(migrated.resources.iron).toBeDefined();
  });

  test('migrate v2 to v3', () => {
    const v2 = {
      version: 2,
      prestige: { level: 1, points: 10 }
    };
    const migrated = migrate(v2);
    expect(migrated.version).toBe(3);
    expect(migrated.prestige.history).toEqual([]);
  });
});
```

## 3. API 模板

### 3.1 资源 API

```ts
// game/resources/api.ts

export const ResourceAPI = {
  // 获取资源定义
  getDef(id: string): ResourceDef {
    return RESOURCES.find(r => r.id === id)!;
  },

  // 获取资源状态
  getState(id: string): ResourceState {
    return useStore.getState().resources[id];
  },

  // 计算产出
  calcOutput(id: string): number {
    return calcOutput(id, useStore.getState(), getContext());
  },

  // 计算成本
  calcCost(id: string, count: number = 1): number {
    const def = this.getDef(id);
    const state = this.getState(id);
    const currentCount = state.count;
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += def.baseCost * Math.pow(def.costMultiplier, currentCount + i);
    }
    return total;
  },

  // 购买资源
  buy(id: string, count: number = 1): boolean {
    const def = this.getDef(id);
    const state = this.getState(id);

    // 检查解锁
    if (!state.unlocked) return false;

    // 检查存储
    if (state.count + count > def.storage) return false;

    // 检查成本
    const cost = this.calcCost(id, count);
    const currency = getCurrency();
    if (currency < cost) return false;

    // 执行购买
    useStore.setState(s => ({
      resources: {
        ...s.resources,
        [id]: { ...s.resources[id], count: s.resources[id].count + count }
      }
    }));
    subtractCurrency(cost);
    return true;
  },

  // 购买最大数量
  buyMax(id: string): number {
    const def = this.getDef(id);
    const state = this.getState(id);
    const storageLeft = def.storage - state.count;
    const currency = getCurrency();

    let count = 0;
    let totalCost = 0;
    while (count < storageLeft) {
      const nextCost = def.baseCost * Math.pow(def.costMultiplier, state.count + count);
      if (totalCost + nextCost > currency) break;
      totalCost += nextCost;
      count++;
    }

    if (count > 0) this.buy(id, count);
    return count;
  }
};
```

### 3.2 科技 API

```ts
// game/tech/api.ts

export const TechAPI = {
  // 获取科技定义
  getDef(id: string): TechDef {
    return TECHS.find(t => t.id === id)!;
  },

  // 检查是否可以研究
  canResearch(id: string): { ok: boolean; reason?: string } {
    const def = this.getDef(id);
    const state = useStore.getState();

    // 检查前置
    for (const prereq of def.prerequisites) {
      if (!state.techs[prereq]?.unlocked) {
        return { ok: false, reason: `Requires ${TECHS.find(t => t.id === prereq)?.name}` };
      }
    }

    // 检查研究点
    const research = state.resources.research.count;
    if (research < def.cost) {
      return { ok: false, reason: 'Not enough research' };
    }

    // 检查等级
    const level = state.techs[id]?.level || 0;
    if (level >= def.maxLevel) {
      return { ok: false, reason: 'Max level reached' };
    }

    return { ok: true };
  },

  // 研究科技
  research(id: string): boolean {
    const check = this.canResearch(id);
    if (!check.ok) return false;

    const def = this.getDef(id);
    useStore.setState(s => ({
      resources: {
        ...s.resources,
        research: { ...s.resources.research, count: s.resources.research.count - def.cost }
      },
      techs: {
        ...s.techs,
        [id]: { ...s.techs[id], unlocked: true, level: (s.techs[id]?.level || 0) + 1 }
      }
    }));

    // 触发解锁副作用
    def.unlocks.forEach(unlock => triggerUnlock(unlock));

    messageQueue.push(`Researched ${def.name}!`, 'achievements');
    return true;
  },

  // 获取科技效果
  getEffect(id: string, effectKey: string): number {
    const def = this.getDef(id);
    return def.effects[effectKey] || 1;
  },

  // 计算所有科技加成
  getAllBonus(effectKey: string): number {
    const state = useStore.getState();
    let bonus = 1;
    for (const [id, tech] of Object.entries(state.techs)) {
      if (!tech.unlocked) continue;
      const def = this.getDef(id);
      bonus *= (def.effects[effectKey as keyof TechEffect] || 1);
    }
    return bonus;
  }
};
```

## 4. 参考清单

### 4.1 参考项目

| 项目 | 网址 | 借鉴点 |
|---|---|---|
| Cookie Clicker | https://orteil.dashnet.org/cookieclicker/ | 核心循环、数字格式化 |
| Anomaly Game | https://anomalygame.github.io/ | 数值曲线、重置设计 |
| Universal Cartographer | https://fabiensanglard.net/uc2.html | UI 布局、信息密度 |
| Town of Salem | https://townofsalem.net/ | 事件系统、社区设计 |

### 4.2 参考文章

- [Building Idle Games](https://www.gamedeveloper.com/design/building-idle-games)
- [Incremental Game Design](https://www.gamasutra.com/view/feature/144019/incremental_game_design.php)
- [Web Worker Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [IndexedDB Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

### 4.3 参考库

- **Dexie.js**：https://dexie.org/
- **Zustand**：https://zustand.docs.pmnd.rs/
- **i18next**：https://www.i18next.com/
- **Recharts**：https://recharts.org/
- **Tailwind CSS**：https://tailwindcss.com/
- **Vite**：https://vitejs.dev/

## 5. 快速开始

### 5.1 创建项目

```bash
# 使用 Vite 创建 React + TypeScript 项目
pnpm create vite civilis --template react-ts
cd civilis

# 安装依赖
pnpm add zustand dexie lz-string clsx date-fns lodash-es recharts lucide-react i18next react-i18next
pnpm add -D tailwindcss postcss autoprefixer @types/lodash-es
pnpm add -D vitest eslint prettier

# 初始化 Tailwind
npx tailwindcss init
```

### 5.2 目录结构

```bash
mkdir -p src/{core/{clock,save,rng,message,i18n,format},game/{resources,jobs,tech,buildings,government,space,gene,events,season,prestige,achieve},state,ui/{app,tabs,components,renderers},data,hooks,styles}
```

### 5.3 启动开发

```bash
pnpm dev
# 打开 http://localhost:5173
```

### 5.4 第一个文件

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## 6. 常见问题

### Q1：为什么要用 Worker 跑定时器？

**A**：浏览器后台标签页会节流 `setTimeout`（从 250ms 变成 1s 甚至更慢）。Worker 不受此影响，保证游戏时钟稳定。

### Q2：为什么要用 IndexedDB 而不是 localStorage？

**A**：localStorage 上限 5MB 且同步阻塞，放置游戏存档会随时间膨胀。IndexedDB 上限数百 MB 且异步不阻塞。

### Q3：为什么用 sqrt 递减？

**A**：放置游戏的核心难题是数值爆炸。sqrt 递减让 100 个工人的效率 = 10 个工人，而不是 100 倍，避免后期失控。

### Q4：存档版本迁移为什么重要？

**A**：每次加新字段都要迁移，否则旧存档会缺字段导致崩溃。从第一天就做，避免后期灾难。

### Q5：如何平衡？

**A**：用 Excel 维护数值表，每周做一次平衡性测试。关键看"阶段时长"是否符合预期（阶段 1 = 30 分钟）。

### Q6：如何避免玩家卡死？

**A**：提供"跳过"按钮、"加速"功能、"立即存档"。确保玩家可以随时退出，不会丢档。

### Q7：如何测试存档兼容性？

**A**：每次发布前，用旧版本存档测试新版本能否读取。写自动化迁移测试用例。

### Q8：如何处理移动端？

**A**：响应式布局 + 触控优化 + 简化资源栏。W8 专门做移动端适配。

## 7. 许可证

本项目使用 **MPL-2.0**，允许修改、商用、闭源，但修改的源文件必须开源。

---

*返回 [README](./README.md)*
