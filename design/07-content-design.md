# 07 · 内容设计

## 1. 阶段化内容解锁

内容线过多会让玩家同时面对过多选择，导致上手困难、注意力分散，因此必须阶段化。本项目采用 **4 阶段解锁**：

### 阶段 1：原始时代（0 - 30 分钟）

**主题**：生存 + 基础资源
**核心循环**：点击 → 资源 → 岗位 → 自动产出
**解锁内容**：
- 4 种基础资源：食物、木材、石头、人力
- 4 种基础岗位：农夫、伐木工、矿工、科学家
- 10 种基础科技
- 3 种基础建筑：小屋、仓库、研究站
- 2 个季节：春夏（简化）

**通关目标**：积累 100 万食物，解锁"文明升级"

### 阶段 2：文明时代（30 分钟 - 2 小时）

**主题**：工业 + 政府 + 战争
**核心循环**：科技 → 工业 → 政府 → 军事
**解锁内容**：
- 6 种工业资源：铁、钢、石油、电力…
- 8 种工业岗位
- 50 种工业/政府/军事科技
- 20 种建筑
- 4 种政府形态
- 季节系统完整（春夏秋冬）
- 5 种随机事件

**通关目标**：第一次重置（文明重置），获得 10 个重置点

### 阶段 3：星际时代（2 - 10 小时）

**主题**：太空探索 + 殖民
**核心循环**：探索 → 殖民 → 太空资源 → 基因改造
**解锁内容**：
- 5 种太空资源
- 20 个行星（可探测、可殖民）
- 40 种太空科技
- 基因系统（30 种特性）
- 3 种宇宙（正常 / 反物质 / 时间）
- 5 种太空事件（海盗、外星文明…）

**通关目标**：殖民 5 个行星，获得"星际重置"资格

### 阶段 4：终局时代（10 小时+）

**主题**：多宇宙 + 神性
**核心循环**：跨宇宙 → 终极科技 → 沙盒
**解锁内容**：
- 多宇宙旅行（8 个宇宙）
- 终极科技（时间旅行、维度折叠…）
- 沙盒模式（编辑参数）
- 隐藏成就
- 自定义文明

**通关目标**：通关所有宇宙，解锁"真结局"

## 2. 数值曲线设计

### 2.1 资源产出

```
产出/秒 = 基础值 × sqrt(数量) × 科技加成 × 政府加成 × 季节加成 × 重置加成

- sqrt(数量)：递减收益，防止后期爆炸
- 科技加成：每级 +50%（1.5x, 2.0x, 3.0x…）
- 政府加成：+0~+50%
- 季节加成：±30%
- 重置加成：每个重置点 +1%
```

### 2.2 成本曲线

```
成本 = 基础成本 × (成本倍率 ^ 数量)

- 成本倍率 1.15~1.3（典型放置游戏）
- 越后期成本指数增长，玩家需要不断重置
```

### 2.3 重置奖励

```
重置点数 = floor(sqrt(总资源 / 1e6))

- 1e6 = 100 万 → 1 点
- 1e8 = 1 亿 → 10 点
- 1e10 = 10 亿 → 100 点
- 1e12 = 1 万亿 → 1000 点
```

### 2.4 时间曲线

```
阶段 1 时长：30 分钟（基础循环）
阶段 2 时长：90 分钟（工业 + 政府）
阶段 3 时长：480 分钟（太空）
阶段 4 时长：600+ 分钟（终局）

总时长：~20 小时（核心内容）
+ 沙盒模式：无限
```

## 3. 资源设计

### 3.1 基础资源（阶段 1）

| 资源 | 图标 | 基础产出 | 基础成本 | 成本倍率 | 存储上限 |
|---|---|---|---|---|---|
| 食物 | 🍎 | 1 | 10 | 1.15 | 1000 |
| 木材 | 🌲 | 1 | 10 | 1.15 | 1000 |
| 石头 | 🪨 | 1 | 10 | 1.15 | 1000 |
| 人力 | 👥 | 1 | 10 | 1.15 | 100 |
| 研究 | 🔬 | 0 | 100 | 1.2 | 1000 |

### 3.2 工业资源（阶段 2）

| 资源 | 图标 | 基础产出 | 基础成本 | 成本倍率 | 解锁条件 |
|---|---|---|---|---|---|
| 铁 | ⚙️ | 1 | 50 | 1.15 | 铁冶炼科技 |
| 钢 | 🔩 | 1 | 100 | 1.18 | 钢铁科技 |
| 石油 | 🛢️ | 1 | 200 | 1.18 | 石油科技 |
| 电力 | ⚡ | 1 | 500 | 1.15 | 电网科技 |
| 煤炭 | ⛏️ | 1 | 80 | 1.15 | 采矿科技 |
| 稀有金属 | 💎 | 1 | 500 | 1.2 | 太空探测 |

### 3.3 太空资源（阶段 3）

| 资源 | 图标 | 基础产出 | 基础成本 | 解锁条件 |
|---|---|---|---|---|
| 太空石 | 🪐 | 1 | 1000 | 太空旅行 |
| 反物质 | ⚛️ | 1 | 5000 | 反物质宇宙 |
| 时间晶体 | ⏳ | 1 | 10000 | 时间科技 |
| 暗能量 | 🌌 | 1 | 50000 | 多宇宙科技 |
| 维度碎片 | 🌀 | 1 | 100000 | 维度折叠 |

## 4. 科技树设计

### 4.1 科技分类（共 300+ 条）

| 类别 | 数量 | 阶段 |
|---|---|---|
| 基础 | 20 | 1 |
| 工业 | 50 | 2 |
| 政府 | 30 | 2 |
| 军事 | 20 | 2 |
| 城建 | 30 | 2 |
| 太空 | 80 | 3 |
| 基因 | 40 | 3 |
| 终局 | 100+ | 4 |

### 4.2 科技树示例（阶段 1）

```
basic_research (基础科研)
├── production_boost_1 (生产加成 I)
│   ├── housing_1 (住房 I)
│   └── storage_1 (仓库 I)
├── basic_farming (基础农业)
│   ├── irrigation (灌溉)
│   └── plow (犁)
└── basic_mining (基础采矿)
    ├── coal_mining (采矿)
    └── iron_smelting (铁冶炼)
```

### 4.3 科技效果模板

```ts
type TechEffect = {
  resourceProduction?: Partial<Record<ResourceId, number>>;
  resourceStorage?: Partial<Record<ResourceId, number>>;
  manpowerStorage?: number;
  allProduction?: number;
  military?: number;
  economicBonus?: number;
  researchOutput?: number;
  gameSpeed?: number;
  unlock?: string[];  // 解锁的资源/建筑/科技
  spaceBonus?: number;
};
```

## 5. 事件设计

### 5.1 事件类型（共 30+ 条）

| 类型 | 数量 | 阶段 | 说明 |
|---|---|---|---|
| 灾害 | 5 | 2 | 饥荒、地震、洪水 |
| 发现 | 5 | 2 | 考古发现、遗迹 |
| 战争 | 5 | 2 | 边境战争、入侵 |
| 外交 | 3 | 2 | 贸易协定、条约 |
| 科技 | 5 | 3 | 科技突破、发明 |
| 太空 | 5 | 3 | 海盗、外星文明 |
| 终局 | 5 | 4 | 维度事件、时间旅行 |

### 5.2 事件设计模板

```ts
interface EventDef {
  id: string;
  name: string;
  description: string;
  duration: number;          // 秒，0 表示一次性
  frequency: number;         // 平均触发间隔（秒）
  severity: 'minor' | 'major';
  requiresMilitary?: number; // 军事对抗门槛
  effects?: Record<string, number>;   // 持续性效果
  rewards?: EventReward;     // 一次性奖励
  penalties?: EventPenalty;  // 战败惩罚
}

interface EventReward {
  research?: number;
  resources?: Record<ResourceId, number>;
  techs?: string[];
}

interface EventPenalty {
  food?: number;
  manpower?: number;
  resources?: Record<ResourceId, number>;
}
```

### 5.3 事件示例

```ts
{
  id: 'famine',
  name: 'Famine',
  description: 'Drought destroys your crops!',
  duration: 60,
  frequency: 300,
  severity: 'minor',
  effects: { foodProduction: 0.5 }
}

{
  id: 'discovery',
  name: 'Archaeological Discovery',
  description: 'Ancient ruins discovered!',
  duration: 0,
  frequency: 600,
  severity: 'major',
  rewards: { research: 100, resources: { iron: 50 } }
}

{
  id: 'border_war',
  name: 'Border War',
  description: 'Neighboring tribe attacks!',
  duration: 120,
  frequency: 900,
  severity: 'major',
  requiresMilitary: 10,
  rewards: { research: 200 },
  penalties: { food: -50, manpower: -10 }
}

{
  id: 'alien_contact',
  name: 'Alien Contact',
  description: 'Aliens want to trade!',
  duration: 0,
  frequency: 1800,
  severity: 'major',
  rewards: { research: 500, techs: ['warp_drive'] }
}
```

## 6. 成就设计

### 6.1 成就分类（共 50+ 条）

| 类别 | 数量 | 示例 |
|---|---|---|
| 进度 | 15 | 第一个资源、百万富翁 |
| 科技 | 10 | 研究 100 科技 |
| 太空 | 10 | 殖民 5 行星 |
| 重置 | 5 | 完成 3 次重置 |
| 成就 | 5 | 解锁 50 成就 |
| 隐藏 | 5 | 隐藏结局 |

### 6.2 成就示例

```ts
{
  id: 'first_steps',
  name: 'First Steps',
  description: 'Collect your first resource',
  category: 'progress',
  requirement: { resource: 'food', count: 1 },
  reward: { bonus: 'allProduction +5%' }
}

{
  id: 'space_explorer',
  name: 'Space Explorer',
  description: 'Discover 10 planets',
  category: 'space',
  requirement: { planetsDiscovered: 10 },
  reward: { bonus: 'spaceBonus +10%' }
}

{
  id: 'hidden_ending',
  name: '???',
  description: 'A hidden ending awaits...',
  category: 'secret',
  requirement: { allAchievements: true },
  reward: { bonus: 'true_ending' }
}
```

## 7. 本地化设计

### 7.1 支持语言（MVP）

| 语言 | 代码 | 优先级 |
|---|---|---|
| 英文 | en-US | P0 |
| 中文（简） | zh-CN | P0 |
| 中文（繁） | zh-TW | P1 |
| 日文 | ja-JP | P1 |
| 韩文 | ko-KR | P2 |
| 俄文 | ru-RU | P2 |
| 德文 | de-DE | P2 |

### 7.2 字符串格式

```json
{
  "resource_Food_name": "Food",
  "resource_Food_desc": "Food feeds your population. Each farmer generates %0 food per second.",
  "tech_basic_research_name": "Basic Research",
  "event_Famine_name": "Famine",
  "event_Famine_desc": "Drought destroys your crops! Food production reduced by 50% for %0 seconds."
}
```

**关键**：
- 使用 `%0 %1 %2` 占位符（纯序号占位，不与文案中的花括号冲突，便于替换与复用）
- 不要翻译 key
- 保留占位符（可调整位置）

---

*返回 [README](./README.md)*
