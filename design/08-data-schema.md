# 08 · 数据 Schema

> 本文档定义所有核心数据的 TypeScript 接口，作为代码实现的参考。

## 1. 存档结构

```ts
// 完整存档
export interface GameSnapshot {
  version: number;          // 存档版本号（用于迁移）
  seed: number;             // 游戏随机种子
  warSeed: number;          // 战争随机种子
  timestamp: number;        // 存档时间

  resources: Record<string, ResourceState>;
  jobs: Record<string, JobState>;
  techs: Record<string, TechState>;
  buildings: Record<string, BuildingState>;
  government: GovernmentState;
  space: SpaceState;
  events: EventState;
  season: SeasonState;
  prestige: PrestigeState;
  achievements: AchievementState;
  settings: Settings;
  stats: Stats;

  // 不入存档：messages（太占空间）
  // 不入存档：queue（重启后清空）
}
```

## 2. 资源

```ts
// 资源定义
export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;             // emoji 或 SVG id
  baseValue: number;        // 基础产出值
  baseCost: number;         // 基础成本
  costMultiplier: number;   // 成本倍率
  category: ResourceCategory;
  storage: number;          // 存储上限
  unlock: UnlockCondition;
}

export type ResourceId =
  | 'food' | 'wood' | 'stone' | 'manpower' | 'research'
  | 'iron' | 'steel' | 'oil' | 'power' | 'coal'
  | 'space_rock' | 'antimatter' | 'time_crystal' | 'dark_energy' | 'dimension_shard';

export type ResourceCategory = 'basic' | 'industrial' | 'space' | 'special';

// 资源运行时状态
export interface ResourceState {
  id: ResourceId;
  count: number;            // 当前数量
  unlocked: boolean;        // 是否解锁
  outputPerSecond: number;  // 当前产出（派生量缓存）
}

// 解锁条件
export interface UnlockCondition {
  phase?: 1 | 2 | 3 | 4;
  tech?: string;            // 需要的前置科技
  building?: string;        // 需要的前置建筑
  prestige?: number;        // 需要的重置等级
}
```

## 3. 岗位

```ts
export interface JobDef {
  id: string;
  name: string;
  icon: string;
  input: ResourceId;        // 消耗的资源
  inputCost: number;        // 每个工人消耗
  output: ResourceId;       // 产出的资源
  outputRate: number;       // 每个工人基础产出
  unlock: UnlockCondition;
}

export interface JobState {
  id: string;
  count: number;            // 工人数量
  unlocked: boolean;
}
```

## 4. 科技

```ts
export interface TechDef {
  id: string;
  name: string;
  cost: number;             // 研究点成本
  costMultiplier: number;   // 升级成本倍率
  maxLevel: number;         // 最大等级
  category: TechCategory;
  prerequisites: string[];  // 前置科技
  unlocks: string[];        // 解锁的资源/建筑/岗位
  effects: TechEffect;
}

export type TechCategory =
  | 'research' | 'production' | 'industrial' | 'government'
  | 'military' | 'space' | 'gene' | 'endgame';

export interface TechEffect {
  resourceProduction?: Partial<Record<ResourceId, number>>;
  resourceStorage?: Partial<Record<ResourceId, number>>;
  manpowerStorage?: number;
  allProduction?: number;
  military?: number;
  economicBonus?: number;
  researchOutput?: number;
  gameSpeed?: number;
  spaceBonus?: number;
}

export interface TechState {
  id: string;
  unlocked: boolean;
  level: number;            // 当前等级
}
```

## 5. 建筑

```ts
export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  cost: Partial<Record<ResourceId, number>>;  // 建造成本
  costMultiplier: number;
  category: BuildingCategory;
  effects: BuildingEffect;
  unlock: UnlockCondition;
}

export type BuildingCategory =
  | 'housing' | 'storage' | 'infrastructure' | 'production' | 'special';

export interface BuildingEffect {
  manpowerStorage?: number;
  allStorage?: number;
  allProduction?: number;
  resourceProduction?: Partial<Record<ResourceId, number>>;
}

export interface BuildingState {
  id: string;
  count: number;
  unlocked: boolean;
}
```

## 6. 政府

```ts
export interface GovernmentDef {
  id: string;
  name: string;
  description: string;
  effects: GovernmentEffect;
  unlock: UnlockCondition;
}

export interface GovernmentEffect {
  foodProduction?: number;
  researchOutput?: number;
  military?: number;
  economicBonus?: number;
}

export interface GovernmentState {
  regime: string;           // 当前政府 ID
  military: number;         // 军事力量
  militaryTechs: string[];  // 解锁的军事科技
}
```

## 7. 太空

```ts
export interface PlanetDef {
  id: string;
  name: string;
  distance: number;         // 距离（天文单位简化）
  traits: PlanetTrait[];    // 特性
  resources: ResourceId[];  // 产出资源
  unlock: UnlockCondition;
}

export type PlanetTrait = 'cold' | 'hot' | 'red' | 'blue' | 'rich' | 'poisoned' | 'water' | 'gas';

export interface PlanetState {
  id: string;
  discovered: boolean;
  colonized: boolean;
  production: number;       // 当前产出
}

export interface SpaceState {
  sectors: SpaceSector[];
  planets: Record<string, PlanetState>;
  planetsDiscovered: number;
  planetsColonized: number;
  universe: string;         // 当前宇宙
}

export interface SpaceSector {
  id: string;
  name: string;
  planets: string[];
}
```

## 8. 基因/种族

```ts
export interface TraitDef {
  id: string;
  name: string;
  description: string;
  effects: TraitEffect;
  cost: Partial<Record<ResourceId, number>>;
}

export interface TraitEffect {
  gameSpeed?: number;       // 游戏速度倍率
  allProduction?: number;
  foodConsumption?: number;
  // ...
}

export interface GeneState {
  traits: string[];         // 已选特性
}
```

## 9. 事件

```ts
export interface EventDef {
  id: string;
  name: string;
  description: string;
  duration: number;         // 秒，0 表示一次性
  frequency: number;        // 平均触发间隔（秒）
  severity: 'minor' | 'major';
  requiresMilitary?: number;
  effects?: Record<string, number>;
  rewards?: EventReward;
  penalties?: EventPenalty;
}

export interface EventReward {
  research?: number;
  resources?: Partial<Record<ResourceId, number>>;
  techs?: string[];
}

export interface EventPenalty {
  food?: number;
  manpower?: number;
  resources?: Partial<Record<ResourceId, number>>;
}

export interface EventState {
  current: string | null;
  timer: number;
  pending: Record<string, { timer: number; frequency: number }>;
  active: Record<string, { effects: Record<string, number>; duration: number }>;
}
```

## 10. 季节

```ts
export interface SeasonDef {
  id: string;
  name: string;
  duration: number;         // 游戏日
  bonuses: Partial<Record<ResourceId, number>>;
  color: string;            // 主题色
}

export interface SeasonState {
  day: number;              // 当前游戏日
  season: string;           // 当前季节 ID
  cycle: number;            // 完成的循环次数
}
```

## 11. 重置

```ts
export interface PrestigeDef {
  level: number;
  name: string;
  description: string;
  requirement: {
    totalResources: number;
    prestigeLevel?: number;
  };
  reward: {
    points: number;
    unlock: string[];
  };
  multipliers: {
    allProduction?: number;
  };
}

export interface PrestigeState {
  level: number;
  points: number;
  history: PrestigeHistory[];
}

export interface PrestigeHistory {
  level: number;
  timestamp: number;
  points: number;
}
```

## 12. 成就

```ts
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  requirement: AchievementRequirement;
  reward: AchievementReward;
  icon: string;
  hidden?: boolean;
}

export type AchievementCategory =
  | 'progress' | 'tech' | 'space' | 'prestige' | 'secret';

export interface AchievementRequirement {
  resource?: { id: ResourceId; count: number };
  planetsDiscovered?: number;
  planetsColonized?: number;
  techsUnlocked?: number;
  prestigeLevel?: number;
  allAchievements?: boolean;
  // ... 其他条件
}

export interface AchievementReward {
  bonus: string;
  productionBonus?: number;
}

export interface AchievementState {
  unlocked: boolean;
  unlockedAt: number;
}
```

## 13. 设置

```ts
export interface Settings {
  locale: string;           // 'en-US' | 'zh-CN' | ...
  theme: 'dark' | 'light' | 'auto';
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  numberNotation: 'short' | 'scientific' | 'full';
  pause: boolean;
  speed: 1 | 2 | 4 | 8;
  keyMap: Record<string, string>;
  expose: boolean;          // 调试模式
  sPackOn: boolean;         // 启用 string pack
  tabLoad: boolean;         // Tab 懒加载
}
```

## 14. 统计

```ts
export interface Stats {
  startTime: number;
  playTime: number;         // 总游戏时间（秒）
  totalResources: Record<ResourceId, number>;  // 历史累计
  resets: number;           // 重置次数
  achievementsUnlocked: number;
  planetsDiscovered: number;
  planetsColonized: number;
  techsUnlocked: number;
}
```

## 15. 消息

```ts
export interface Message {
  id: string;
  text: string;
  category: MessageCategory;
  timestamp: number;
  duration: number;
  important: boolean;
}

export type MessageCategory =
  | 'all' | 'progress' | 'queue' | 'research_queue' | 'combat'
  | 'spy' | 'events' | 'major_events' | 'minor_events'
  | 'achievements' | 'hell';
```

## 16. 存档迁移示例

```ts
// 假设 v1 → v2：添加了新资源 'iron'
export const migrations: Migration[] = [
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
  }
];
```

## 17. 关键设计原则

1. **所有 ID 用字符串**（不用数字枚举，方便扩展）
2. **所有时间用秒**（避免毫秒/秒混用）
3. **所有金额用 number**（JS number 安全到 1e15，足够放置游戏）
4. **所有效果用倍率**（`production: 1.5` = +50%，不用百分比）
5. **存档不存 UI 状态**（只存游戏状态）
6. **存档版本化**（每次破坏性变更都 bump version）
7. **派生量不入存档**（outputPerSecond 等运行时算）

---

*返回 [README](./README.md)*
