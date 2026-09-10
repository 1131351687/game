# 05 · 游戏子系统详细设计

> 本文档定义 10 个核心子系统的**数据结构 + 核心算法 + 交互流程**。每个子系统按统一模板：**目标 → 数据 → 算法 → 交互 → 解锁条件 → 注意事项**。

---

## 子系统总览

| # | 子系统 | 解锁阶段 | 核心作用 |
|---|---|---|---|
| 1 | 资源系统 | 始终 | 基础产出 |
| 2 | 岗位系统 | 始终 | 资源 → 食物/工业品 |
| 3 | 科技系统 | 始终 | 解锁 + 加成 |
| 4 | 城建系统 | 阶段 2 | 基础设施 |
| 5 | 政府/军事 | 阶段 2 | 政策 + 战争 |
| 6 | 季节/事件 | 阶段 2 | 随机性 |
| 7 | 太空探索 | 阶段 3 | 殖民地 |
| 8 | 基因/种族 | 阶段 3 | 特性改造 |
| 9 | 重置系统 | 阶段 4 | 长线成长 |
| 10 | 成就系统 | 始终 | 收集 + 引导 |

---

## 1. 资源系统（game/resources）

### 1.1 目标
- 基础产出单位
- 多资源并行管理
- 产出公式支持科技/建筑/政府加成

### 1.2 数据

```ts
// data/resources.ts
export const RESOURCES: ResourceDef[] = [
  {
    id: 'food',
    name: 'Food',
    icon: '🍎',
    baseValue: 1,
    baseCost: 10,
    costMultiplier: 1.15,
    category: 'basic',
    storage: 1000,
    unlock: { phase: 1 }
  },
  {
    id: 'wood',
    name: 'Wood',
    icon: '🌲',
    baseValue: 1,
    baseCost: 10,
    costMultiplier: 1.15,
    category: 'basic',
    storage: 1000,
    unlock: { phase: 1 }
  },
  {
    id: 'stone',
    name: 'Stone',
    icon: '🪨',
    baseValue: 1,
    baseCost: 10,
    costMultiplier: 1.15,
    category: 'basic',
    storage: 1000,
    unlock: { phase: 1 }
  },
  {
    id: 'manpower',
    name: 'Manpower',
    icon: '👥',
    baseValue: 1,
    baseCost: 10,
    costMultiplier: 1.15,
    category: 'basic',
    storage: 100,
    unlock: { phase: 1 }
  },
  {
    id: 'research',
    name: 'Research',
    icon: '🔬',
    baseValue: 0,  // 不直接产出，由科技研究消耗
    baseCost: 100,
    costMultiplier: 1.2,
    category: 'basic',
    storage: 1000,
    unlock: { phase: 1 }
  },
  {
    id: 'iron',
    name: 'Iron',
    icon: '⚙️',
    baseValue: 1,
    baseCost: 50,
    costMultiplier: 1.15,
    category: 'industrial',
    storage: 5000,
    unlock: { phase: 2, tech: 'iron_smelting' }
  },
  // ... 工业品、太空资源、特殊资源
];
```

### 1.3 产出算法

```ts
// engine.ts
export function calcOutput(
  resourceId: string,
  state: GameState,
  context: GameContext
): number {
  const def = RESOURCES.find(r => r.id === resourceId)!;
  const resourceState = state.resources[resourceId];
  if (!resourceState || !resourceState.unlocked) return 0;

  // 基础产出
  let output = def.baseValue * resourceState.count;

  // 科技加成
  if (state.techs['production_boost_1']?.unlocked) output *= 1.5;
  if (state.techs['production_boost_2']?.unlocked) output *= 2.0;

  // 政府加成
  output *= 1 + (state.government.economicBonus || 0);

  // 季节加成
  const seasonBonus = SEASONS[state.season.season]?.bonuses?.[resourceId] || 1;
  output *= seasonBonus;

  // 太空加成（殖民地贡献）
  output *= 1 + (context.spaceColoniesBonus || 0);

  // 重置加成
  output *= 1 + (state.prestige.points * 0.01);

  return output;
}
```

### 1.4 交互流程
1. 玩家点击"购买资源"按钮
2. 检查资源是否解锁（phase + tech）
3. 检查资金是否足够（`baseCost * costMultiplier^count`）
4. 检查存储是否未满
5. 扣款 + 增加资源数量
6. 触发派生量重算
7. UI 重绘

### 1.5 关键设计
- **存储上限**：资源超过上限时不再增加（鼓励升级存储建筑）
- **成本曲线**：`baseCost * costMultiplier^count`，放置游戏经典
- **解锁依赖**：阶段 + 科技 + 建筑三重门槛

---

## 2. 岗位系统（game/jobs）

### 2.1 目标
- 资源 → 食物/工业品（"农夫种粮食"逻辑）
- 工人分配 + 效率曲线

### 2.2 数据

```ts
// data/jobs.ts
export const JOBS: JobDef[] = [
  {
    id: 'farmer',
    name: 'Farmer',
    icon: '🌾',
    input: 'manpower',
    inputCost: 1,
    output: 'food',
    outputRate: 0.5,  // 每秒产出
    unlock: { phase: 1 }
  },
  {
    id: 'lumberjack',
    name: 'Lumberjack',
    icon: '🪓',
    input: 'manpower',
    inputCost: 1,
    output: 'wood',
    outputRate: 0.5,
    unlock: { phase: 1 }
  },
  {
    id: 'miner',
    name: 'Miner',
    icon: '⛏️',
    input: 'manpower',
    inputCost: 1,
    output: 'stone',
    outputRate: 0.4,
    unlock: { phase: 1 }
  },
  {
    id: 'scientist',
    name: 'Scientist',
    icon: '🧪',
    input: 'manpower',
    inputCost: 2,
    output: 'research',
    outputRate: 0.1,
    unlock: { phase: 1, tech: 'basic_research' }
  },
  // ... 工业岗位、太空岗位
];
```

### 2.3 产出算法（含递减收益）

```ts
// engine.ts
export function calcJobOutput(
  jobId: string,
  state: GameState
): { output: number; input: number } {
  const def = JOBS.find(j => j.id === jobId)!;
  const count = state.jobs[jobId]?.count || 0;
  if (count === 0) return { output: 0, input: 0 };

  // 递减收益：sqrt(count) * baseRate
  // 产出随投入次线性增长（开方衰减），防止后期数值爆炸
  const output = Math.sqrt(count) * def.outputRate;
  const input = count * def.inputCost;

  return { output, input };
}
```

### 2.4 交互流程
1. 玩家调整岗位工人数量（数字输入框 / +1 / +10 / +Max）
2. 检查 manpower 是否充足
3. 检查存储是否充足（输入消耗）
4. 更新 `state.jobs[jobId].count`
5. 触发产出重算

### 2.5 关键设计
- **sqrt 递减**：100 个农夫 ≠ 100×1 农夫，而是 sqrt(100)×1 = 10 农夫效率
- **Manpower 是瓶颈**：所有岗位都消耗 manpower，manpower 由建筑（住宅）提供
- **自动化**：v1.0 后可加入"自动分配"功能

---

## 3. 科技系统（game/tech）

### 3.1 目标
- 解锁新功能
- 提供加成
- 多分支树状结构

### 3.2 数据

```ts
// data/tech.ts
export const TECHS: TechDef[] = [
  {
    id: 'basic_research',
    name: 'Basic Research',
    cost: 100,
    costMultiplier: 1.5,
    maxLevel: 1,
    category: 'research',
    prerequisites: [],
    unlocks: ['scientist_job'],
    effects: { researchOutput: 1.0 }
  },
  {
    id: 'production_boost_1',
    name: 'Production Boost I',
    cost: 500,
    costMultiplier: 2.0,
    maxLevel: 1,
    category: 'production',
    prerequisites: ['basic_research'],
    effects: { foodProduction: 1.5, woodProduction: 1.5 }
  },
  {
    id: 'iron_smelting',
    name: 'Iron Smelting',
    cost: 1000,
    costMultiplier: 2.0,
    maxLevel: 1,
    category: 'industrial',
    prerequisites: ['production_boost_1'],
    unlocks: ['iron_resource', 'iron_smelter_building'],
    effects: {}
  },
  // ... 500+ 条科技
];
```

### 3.3 科技树结构

```ts
export interface TechTree {
  root: string;  // 'basic_research'
  nodes: Map<string, TechDef>;
  edges: [string, string][];  // [prereq, tech]
}

export function canResearch(
  techId: string,
  state: GameState
): { ok: boolean; reason?: string } {
  const def = TECHS.find(t => t.id === techId)!;

  // 检查前置科技
  for (const prereq of def.prerequisites) {
    if (!state.techs[prereq]?.unlocked) {
      return { ok: false, reason: `Requires ${TECHS.find(t => t.id === prereq)?.name}` };
    }
  }

  // 检查研究点
  if (state.resources.research.count < def.cost) {
    return { ok: false, reason: 'Not enough research' };
  }

  // 检查等级上限
  if ((state.techs[techId]?.level || 0) >= def.maxLevel) {
    return { ok: false, reason: 'Max level reached' };
  }

  return { ok: true };
}

export function unlockTech(techId: string): void {
  useStore.setState(state => ({
    resources: {
      ...state.resources,
      research: { ...state.resources.research, count: state.resources.research.count - TECHS.find(t => t.id === techId)!.cost }
    },
    techs: {
      ...state.techs,
      [techId]: { ...state.techs[techId], unlocked: true, level: (state.techs[techId]?.level || 0) + 1 }
    }
  }));
}
```

### 3.4 科技分类（按阶段）

| 阶段 | 类别 | 数量 | 示例 |
|---|---|---|---|
| 1 | 基础 | 20 | basic_research, production_boost_1 |
| 2 | 工业 | 50 | iron_smelting, steam_engine |
| 2 | 政府 | 30 | democracy, military_1 |
| 2 | 城建 | 30 | housing_1, power_grid |
| 3 | 太空 | 80 | rocket_scientific, warp_drive |
| 3 | 基因 | 40 | gene_editing, shape_shift |
| 4 | 终局 | 100+ | multi_universe, time_travel |

### 3.5 交互流程
1. 玩家点击科技节点
2. 显示 tooltip（描述、成本、效果、前置）
3. 检查 `canResearch()`
4. 扣研究点 + 解锁
5. 触发派生量重算 + 解锁新功能
6. 显示消息（"科研突破！"）

### 3.6 关键设计
- **前置链**：强制玩家按顺序解锁，引导玩法
- **解锁副作用**：`unlocks` 字段触发新功能（资源/建筑/岗位/Tab）
- **效果叠加**：`effects` 字段累加到产出公式
- **UI 渲染**：用网格布局 + 连接线显示树状结构

---

## 4. 城建系统（game/civics/buildings）

### 4.1 目标
- 提供基础加成（存储、产出、解锁）
- 视觉化文明发展

### 4.2 数据

```ts
// data/buildings.ts
export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hut',
    name: 'Hut',
    icon: '🏚️',
    cost: { wood: 10, stone: 5 },
    costMultiplier: 1.2,
    category: 'housing',
    effects: { manpowerStorage: 10 },
    unlock: { phase: 1 }
  },
  {
    id: 'storage',
    name: 'Storage',
    icon: '📦',
    cost: { wood: 20, stone: 10 },
    costMultiplier: 1.2,
    category: 'storage',
    effects: { allStorage: 500 },
    unlock: { phase: 1 }
  },
  {
    id: 'power_grid',
    name: 'Power Grid',
    icon: '⚡',
    cost: { iron: 50, research: 100 },
    costMultiplier: 1.5,
    category: 'infrastructure',
    effects: { allProduction: 1.1 },
    unlock: { phase: 2, tech: 'power_grid' }
  },
  // ... 50+ 建筑
];
```

### 4.3 关键设计
- **Manpower 存储**：住宅类建筑提供 manpower 上限
- **全局存储**：存储类建筑增加所有资源容量
- **产出加成**：基础设施类建筑提供全局产出
- **解锁**：建筑解锁后出现在"城建"Tab

---

## 5. 政府/军事系统（game/civics/government）

### 5.1 目标
- 政策选择（影响全局加成）
- 军事力量（用于战争事件）

### 5.2 数据

```ts
// data/governments.ts
export const GOVERNMENTS: GovernmentDef[] = [
  {
    id: 'tribe',
    name: 'Tribal Council',
    effects: { foodProduction: 1.2, researchOutput: 0.8 },
    unlock: { phase: 2 }
  },
  {
    id: 'democracy',
    name: 'Democracy',
    effects: { researchOutput: 1.5, military: 0.8 },
    unlock: { phase: 2, tech: 'democracy' }
  },
  {
    id: 'empire',
    name: 'Empire',
    effects: { military: 2.0, economicBonus: 0.5 },
    unlock: { phase: 2, tech: 'empire' }
  },
  // ...
];

export const MILITARY_TECHS: TechDef[] = [
  { id: 'spear', name: 'Spear', effects: { military: 1.0 } },
  { id: 'sword', name: 'Sword', effects: { military: 1.5 } },
  { id: 'gunpowder', name: 'Gunpowder', effects: { military: 3.0 } },
  // ...
];
```

### 5.3 关键设计
- **政府切换**：消耗大量资源，提供不同加成曲线
- **军事力量**：与随机战争事件对抗，决定胜负
- **间谍系统**：v1.0 后可加入（简化版：随机事件触发）

---

## 6. 季节/事件系统（game/events）

### 6.1 目标
- 打破节奏，增加随机性
- 季节影响产出

### 6.2 数据

```ts
// data/events.ts
export const EVENTS: EventDef[] = [
  {
    id: 'famine',
    name: 'Famine',
    description: 'Drought destroys your crops!',
    duration: 60,  // 秒
    effects: { foodProduction: 0.5 },
    frequency: 300,  // 平均 5 分钟一次
    severity: 'minor'
  },
  {
    id: 'discovery',
    name: 'Archaeological Discovery',
    description: 'Ancient ruins discovered!',
    duration: 0,  // 一次性
    rewards: { research: 100, resources: { iron: 50 } },
    frequency: 600,
    severity: 'major'
  },
  {
    id: 'war',
    name: 'Border War',
    description: 'Neighboring tribe attacks!',
    duration: 120,
    requiresMilitary: 10,
    rewards: { research: 200 },
    penalties: { food: -50, manpower: -10 },
    frequency: 900,
    severity: 'major'
  },
  // ... 20+ 事件
];

// data/seasons.ts
export const SEASONS: SeasonDef[] = [
  {
    id: 'spring',
    name: 'Spring',
    duration: 30,  // 游戏日
    bonuses: { food: 1.2, wood: 1.1 },
    color: '#4ade80'
  },
  {
    id: 'summer',
    name: 'Summer',
    duration: 30,
    bonuses: { food: 1.5, research: 0.8 },
    color: '#facc15'
  },
  {
    id: 'autumn',
    name: 'Autumn',
    duration: 30,
    bonuses: { food: 1.0, wood: 1.3 },
    color: '#f97316'
  },
  {
    id: 'winter',
    name: 'Winter',
    duration: 30,
    bonuses: { food: 0.7, wood: 0.8, research: 1.3 },
    color: '#e0f2fe'
  }
];
```

### 6.3 事件触发算法

```ts
// engine.ts
export function checkEvents(state: GameState): void {
  // 每个事件独立计时
  for (const event of EVENTS) {
    const eventState = state.events.pending[event.id];
    if (!eventState) continue;

    eventState.timer += 1;  // midLoop 1s 一次
    if (eventState.timer >= event.frequency) {
      // 触发事件
      triggerEvent(event.id);
      eventState.timer = 0;
      eventState.frequency = randomizeFrequency(event.frequency);  // ±20% 抖动
    }
  }
}

export function triggerEvent(eventId: string): void {
  const event = EVENTS.find(e => e.id === eventId)!;

  // 应用效果
  if (event.requiresMilitary) {
    if (state.government.military >= event.requiresMilitary) {
      // 战胜
      applyRewards(event.rewards);
      messageQueue.push(`Victory in ${event.name}!`, 'major_events');
    } else {
      // 战败
      applyPenalties(event.penalties);
      messageQueue.push(`Defeat in ${event.name}...`, 'major_events', { important: true });
    }
  } else if (event.rewards) {
    applyRewards(event.rewards);
    messageQueue.push(event.name, event.severity === 'major' ? 'major_events' : 'minor_events');
  } else if (event.effects) {
    // 持续性效果（如 famine）
    state.events.active[eventId] = {
      effects: event.effects,
      duration: event.duration
    };
    messageQueue.push(event.name, event.severity === 'major' ? 'major_events' : 'minor_events');
  }
}
```

### 6.4 关键设计
- **频率抖动**：±20% 随机，避免固定节奏
- **严重度分级**：minor / major，major 事件进重要消息
- **军事对抗**：玩家军事力量决定事件结果
- **持续性效果**：famine 这类事件持续 N 秒，影响产出

---

## 7. 太空探索系统（game/space）

### 7.1 目标
- 探索星系
- 殖民行星
- 解锁太空资源

### 7.2 数据

```ts
// data/space.ts
export const PLANETS: PlanetDef[] = [
  {
    id: 'mars',
    name: 'Mars',
    distance: 5,  // 单位：天文单位（简化）
    traits: ['cold', 'red'],
    resources: ['iron', 'rare_minerals'],
    unlock: { phase: 3, tech: 'space_travel' }
  },
  // ... 20+ 行星
];

export const UNIVERSES: UniverseDef[] = [
  {
    id: 'normal',
    name: 'Normal Universe',
    effects: {}
  },
  {
    id: 'antimatter',
    name: 'Antimatter Universe',
    effects: { allProduction: 2.0 },
    unlock: { prestigeLevel: 2 }
  },
  // ...
];
```

### 7.3 探索流程
1. 玩家解锁"太空旅行"科技
2. 打开太空 Tab，显示星系图
3. 点击行星 → 检查距离 + 燃料
4. 派遣探测器（消耗 manpower + 研究点）
5. 等待探测完成（实时 tick）
6. 显示行星信息（资源、特性）
7. 选择殖民 → 消耗大量资源
8. 殖民成功后，行星持续产出

### 7.4 关键设计
- **距离系统**：行星距离越远，探测/殖民成本越高
- **特性系统**：行星特性（cold/hot/rich/poisoned）影响殖民
- **多宇宙**：高阶段解锁"反物质宇宙"等，提供翻倍加成

---

## 8. 基因/种族系统（game/gene）

### 8.1 目标
- 改造玩家种族
- 选择特性（有得有失）

### 8.2 数据

```ts
// data/genes.ts
export const TRAITS: TraitDef[] = [
  {
    id: 'slow',
    name: 'Slow Metabolism',
    description: 'All timers 20% slower',
    effects: { gameSpeed: 1.2 },  // 实际更慢
    cost: { research: 1000 }
  },
  {
    id: 'hyper',
    name: 'Hyperactive',
    description: 'All timers 20% faster',
    effects: { gameSpeed: 0.8 },
    cost: { research: 1000, food: -500 }  // 负面代价
  },
  {
    id: 'efficient',
    name: 'Efficient',
    description: 'All outputs 10% higher',
    effects: { allProduction: 1.1 },
    cost: { research: 2000 }
  },
  // ... 30+ 特性
];
```

### 8.3 关键设计
- **有得有失**：每个特性都有代价，玩家权衡
- **永久生效**：种族特性一旦获得永久存在
- **解锁门槛**：高阶段（阶段 3）才解锁
- **存档影响**：种族特性影响游戏节奏，存档时保存

---

## 9. 重置系统（game/prestige）

### 9.1 目标
- 长线成长
- 每级解锁新玩法

### 9.2 数据

```ts
// data/prestige.ts
export const PRESTIGE_LEVELS: PrestigeDef[] = [
  {
    level: 1,
    name: 'Civilization Reset',
    description: 'Reset everything except achievements and prestige points',
    requirement: { totalResources: 1e6 },
    reward: { points: 10, unlock: ['prestige_1'] },
    multipliers: { allProduction: 1.1 }
  },
  {
    level: 2,
    name: 'Tech Reset',
    description: 'Reset tech but keep research points',
    requirement: { totalResources: 1e9, prestigeLevel: 1 },
    reward: { points: 100, unlock: ['prestige_2'] },
    multipliers: { allProduction: 1.5 }
  },
  {
    level: 3,
    name: 'Universe Reset',
    description: 'Reset everything, gain universe abilities',
    requirement: { totalResources: 1e12, prestigeLevel: 2 },
    reward: { points: 1000, unlock: ['universe_travel'] },
    multipliers: { allProduction: 2.0 }
  }
];
```

### 9.3 重置算法

```ts
export function canPrestige(level: number): boolean {
  const def = PRESTIGE_LEVELS.find(p => p.level === level)!;
  const state = useStore.getState();

  return (
    state.stats.totalResources >= def.requirement.totalResources &&
    (def.requirement.prestigeLevel ? state.prestige.level >= def.requirement.prestigeLevel : true)
  );
}

export function doPrestige(level: number): void {
  const def = PRESTIGE_LEVELS.find(p => p.level === level)!;

  useStore.setState({
    // 重置资源、科技、建筑
    resources: createInitialResources(),
    jobs: {},
    techs: {},
    buildings: {},
    government: { regime: 'none', military: 0 },
    space: { sectors: [], planets: [] },

    // 保留：成就、设置、统计
    achievements: useStore.getState().achievements,
    settings: useStore.getState().settings,
    stats: useStore.getState().stats,

    // 更新重置数据
    prestige: {
      level: Math.max(state.prestige.level, level),
      points: state.prestige.points + def.reward.points
    }
  });

  messageQueue.push(`Reset to ${def.name}!`, 'achievements', { important: true });
  forceSave();  // 立即存档
}
```

### 9.4 关键设计
- **多级重置**：每级解锁新系统
- **点数奖励**：永久加成
- **解锁内容**：每级解锁新功能（如"多宇宙旅行"）
- **立即存档**：重置后必须立即保存

---

## 10. 成就系统（game/achieve）

### 10.1 目标
- 收集感
- 引导玩家
- 长线目标

### 10.2 数据

```ts
// data/achievements.ts
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_resource',
    name: 'First Steps',
    description: 'Collect your first resource',
    category: 'progress',
    requirement: { resource: 'food', count: 1 },
    reward: { bonus: 'allProduction +5%' },
    icon: '🎯'
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Accumulate 1 million food',
    category: 'progress',
    requirement: { resource: 'food', count: 1e6 },
    reward: { bonus: 'foodStorage +50%' }
  },
  {
    id: 'space_explorer',
    name: 'Space Explorer',
    description: 'Discover 10 planets',
    category: 'space',
    requirement: { planetsDiscovered: 10 },
    reward: { bonus: 'spaceBonus +10%' }
  },
  // ... 50+ 成就
];
```

### 10.3 成就检查

```ts
// engine.ts
export function checkAchievements(state: GameState): void {
  for (const achievement of ACHIEVEMENTS) {
    if (state.achievements[achievement.id]?.unlocked) continue;

    const met = checkRequirement(achievement.requirement, state);
    if (met) {
      unlockAchievement(achievement.id);
    }
  }
}

function checkRequirement(req: any, state: GameState): boolean {
  if (req.resource) {
    return (state.resources[req.resource]?.count || 0) >= req.count;
  }
  if (req.planetsDiscovered) {
    return state.space.planetsDiscovered >= req.planetsDiscovered;
  }
  if (req.techsUnlocked) {
    return countUnlockedTechs(state) >= req.techsUnlocked;
  }
  // ... 其他条件
  return false;
}

function unlockAchievement(id: string): void {
  const achievement = ACHIEVEMENTS.find(a => a.id === id)!;
  useStore.setState(state => ({
    achievements: {
      ...state.achievements,
      [id]: { unlocked: true, unlockedAt: Date.now() }
    }
  }));
  messageQueue.push(`Achievement: ${achievement.name}!`, 'achievements', { important: true });
}
```

### 10.4 关键设计
- **分类**：progress / space / space / prestige / secret
- **奖励**：部分成就提供永久加成（小心不要破坏平衡）
- **隐藏成就**：某些成就不显示描述，解锁后揭晓
- **成就墙**：专门 Tab 展示所有成就

---

## 子系统协作关系图

```
[资源] ─── [岗位] ─── [科技]
   │           │          │
   │           │          ▼
   │           │     [城建]
   │           │          │
   │           ▼          ▼
   │      [政府]     [季节/事件]
   │           │          │
   │           ▼          ▼
   │        [军事]      [太空]
   │                    │
   │                    ▼
   │                 [基因]
   │                    │
   ▼                    ▼
[成就] ←─── [重置] ←─── [成就]
```

- **资源** 是基础，所有系统都依赖
- **科技** 是解锁关键，驱动阶段推进
- **重置** 是长线核心，每级解锁新系统
- **成就** 贯穿全程，提供收集感

---

## 子系统开发优先级

| 优先级 | 子系统 | 周次 |
|---|---|---|
| P0 | 资源、岗位、科技、存档 | W2-W3 |
| P1 | 城建、政府、季节、事件 | W4-W5 |
| P2 | 太空、基因、重置、成就 | W6-W7 |
| P3 | 多宇宙、间谍、沙盒 | v1.0 后 |

---

*返回 [README](./README.md)*
