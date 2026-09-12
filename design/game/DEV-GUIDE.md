# 时代实装 · 通用执行手册

> **读者**：负责实装某个时代的 AI 模型或人类开发者。
> **假设**：你已读完该时代的 `E{N}-devplan.md`（含实施级规格），本文告诉你**怎么安全地动手**。
> **核心原则**：每完成一小步就验证一次；基线变了就是你的错，不是"接受新基线"。

---

## 一、架构速览

```
UI 层 ui/            组件与渲染。只读 state，通过 action 间接修改。
状态层 state/        Zustand store、存档读写迁移、动作入口。
玩法层 game/         游戏规则（纯函数，禁止碰 DOM）。← 每代主要改动区
核心层 core/         时钟（Worker 三档循环）、存档机制、格式化。← 全部复用，不改
数据层 data/         纯常量（资源/岗位/建筑/科技/时代定义）。← 每代新增条目
```

**调用方向（单向，不可逆）**：`UI → state → game → data`

**禁止**：
- `game/` 直接操作 DOM
- 组件里直接 `useStore.setState()`
- UI 直接调 game 层函数（必须通过 store action）

**每一层的职责边界**：

| 层 | 职责 | 不该做的事 |
|---|---|---|
| `data/` | 定义"有什么"（资源/岗位/建筑/科技的名称、数值、依赖） | 不含逻辑 |
| `game/` | 定义"怎么算"（产出公式、消耗、限制、跃迁条件） | 不碰 DOM、不碰 localStorage |
| `state/` | 定义"怎么存取"（Zustand 字段、action、存档迁移） | 不含游戏规则 |
| `ui/` | 定义"怎么显示"（面板、按钮、提示） | 不含游戏规则 |

---

## 二、开工前必须确认

### 2.1 工作区检查

```bash
cd D:\try\game
git status -s                # 应为空（或只有你自己的改动）
git log --oneline -3        # 确认 HEAD 是预期的
npx tsc --noEmit            # 必须 0 error（基线）
```

**如果 `git status` 有别人的未提交改动**：先与用户确认处置方式。
不要 `git add -A` 一把抓——之前发生过把别人的半成品卷进提交的事故。

### 2.2 基线快照

开工前记录以下数字（实装完成后必须**一字不差**）：

| 基线 | 命令 | 期望值 |
|---|---|---|
| E1 门槛 | `npx tsx src/dev/simulate.ts autoplay beeline` | 1163s |
| E2 通关 | `npx tsx src/dev/simulate.ts autoplay e2` | 1920s |
| 类型检查 | `npx tsc --noEmit` | 0 error |
| 构建 | `npm run build` | 成功 |

### 2.3 分支隔离（并行开发时）

```bash
git worktree add .worktrees/e{N} -b feat-e{N}
echo ".worktrees/" >> .gitignore   # 如果还没加
```

⚠️ **分支名不能带斜杠**：`-b feat/e4` 会报 `invalid reference`。用 `feat-e4`。

⚠️ **worktree 需要 node_modules**：用 junction 链接主树的依赖（PowerShell）：
```powershell
New-Item -ItemType Junction -Path ".worktrees\e{N}\demo\node_modules" -Target "D:\try\game\demo\node_modules" | Out-Null
```

⚠️ **worktree 里的 `era.ts` 是分支创建时的旧版**。如果上一个时代的实现还未提交到 main，
你需要把主工作区的 data 文件**复制**过来作为起点（这叫"E3 数据快照采纳"），否则你的
E{N} 数据层会在缺少前代字段的情况下报 34 个类型错误。

---

## 三、每代实装的通用模式

每个新时代 = **一批新规则 + 一批新字段**。新规则进 `game/`，新字段进 `state/`。

### 3.1 数据层（`data/`）—— 6 个文件 14 处改动

| 文件 | 改什么 | 注意 |
|---|---|---|
| `era.ts` | EraId 加代号；advanceConditions 类型加新键；ERAS 加新代条目 | EraId 不加会导致**全线类型错误** |
| `resources.ts` | ResourceId 加新资源；RESOURCES 加定义；MATERIAL_RESOURCES 加 id | 锡等"必须进口"的资源也加（产出为 0 是引擎层的事） |
| `jobs.ts` | JobId 加新岗位；JOBS 加定义；`outputRateByEra` 按时代覆盖 | 特殊岗位用 `special` 标记；`output` 可为占位值 |
| `buildings.ts` | BuildingId 加新建筑；limit 联合类型按需扩展；BUILDINGS 加定义 | BuildingPanel 的 LIMIT_LABEL/LIMIT_ICON 同步补键 |
| `techs.ts` | TechBranch 加新分支；TechEffects 加新键；TECHS spread 新数组；TECHS_BY_BRANCH / BRANCH_INFO / BRANCH_ORDER 同步 | **三处必须同步**，否则 Record 类型不完整 |
| `constants.ts` | 加 `E{N}` 常量块 | 不改前代常量 |

### 3.2 引擎层（`game/`）

- **新机制**放**新文件**（如 E3 的 `record.ts` / `trade.ts`），不要往 `engine.ts`（已 1,101 行）里塞
- 纯函数，**禁止碰 DOM / localStorage / console.log**
- 所有新函数加时代门控（见 §四）
- 在 `engine.ts` 里 `export` 供 `state/` 调用

### 3.3 状态层（`state/`）

- `initialState()` 加新字段（初始值 0 / 空数组 / 空对象）
- `GameState` 接口加字段类型
- `engineView()` 加新字段映射
- `doTick()` 加新子系统的 tick 调用（注意执行顺序，见 §六）
- **`SAVE_VERSION` +1**
- `loadSnapshot()` 加迁移逻辑（旧字段补 0 / 折算 / 新字段初始化）
- 新 action（如 `recordTech / establishRoute / switchGovernment`）

### 3.4 UI 层（`ui/`）

- 新面板组件（如 `RecordPanel / TradePanel / EmpirePanel`）
- 现有面板扩展（TopBar 资源序、JobPanel 新岗位、TechGrid 新状态）
- `App.tsx` 挂新面板（按 `isModuleUnlocked` 渐进解锁）
- 所有 UI 文案用简体中文

---

## 四、时代门控（防止新机制漏进旧时代）

**这是最大的坑**。E3 的教训：34 个类型错误全因为 `EraId` 没加 `'E3'`。

### 4.1 门控模式

```ts
// 引擎函数内的时代门控
const seasonR = eff.seasonsEnabled ? getSeasonGrowthFactor(...) : 1;   // E2+
const fireFactor = state.era === 'E1' ? getFireFactor(state) : 1;      // E1 独有
if (aggregateEffects(state).seasonsEnabled) { ... }                    // E2+
```

### 4.2 验证方法

```bash
# 改完引擎后必须跑：
npx tsx src/dev/simulate.ts autoplay beeline   # E1 门槛必须 1163s
npx tsx src/dev/simulate.ts autoplay e2        # E2 通关必须 1920s
```

**如果基线变了**：你的新机制漏进了旧时代。修法是加时代门控，不是"接受新基线"。

### 4.3 SSR 字节回归

渲染层面的改动需要逐字节比对（新建面板除外——它们只在解锁后出现）：

```bash
npx tsx src/dev/tmp-render.tsx > /tmp/now.html
# 与基线比对（见 ssr-byte-diff-regression skill）
```

### 4.4 反向铁律：新时代是"叠加开放"，不是换版本（用户拍板 2026-09-12）

时代门控只拦"新机制漏进旧时代"，**绝不反过来把旧内容从新时代剥离**。
进 E2 后玩家必须仍能看到/使用 E1 的一切：已学科技、漏学科技（仍可研究）、
建筑（可继续新建，除非数据声明 supersededBy/obsoleteAfterEra）、
无进阶关系的岗位、资源与产出。

- 跃迁交接：`game/transition.ts` 只新增（唯一副作用 = 新时代时钟归零）。
- 科技 UI 数据源必须用 `techsUpToEra(era)`（当前+以前所有时代），
  **不是** `techsOfEra(era)` —— 后者会让已学/漏学的旧科技"消失"（踩过：TechGrid）。
- 建筑用 `eraBuildings` / `isBuildingBuildable`（所属时代已到达即可建）。
- 例外必须**数据声明**（`supersededBy` / `obsoleteAfterEra` / `JobDef.upgradesTo`），
  不许在 UI/引擎里写死时代过滤。

---

## 五、存档迁移（SAVE_VERSION 每代 +1）

### 5.1 版本链

| 版本 | 对应时代 | 主要变化 |
|---|---|---|
| 5 | E2 定居 | 谷物并入食物；旧跃迁映射还原 |
| 6 | E3 城市 | +knowledge/copper/tin/bronze/recorded/tradeRoutes/reputation |
| 7 | E4 帝国 | +iron/coin/order/territory/legacy |
| 8 | E5 远洋 | +paper/books/researchPoints/literacy/ships |
| 9 | E6 工业 | +coal/steam/mechanical/power/pollution/urbanization |
| 10 | E7 电气 | +electricity/oil/fertilizer/assembly/petrol |
| 11 | E8 信息 | +data/compute/automationLines/networkNodes |

### 5.2 迁移模板

```ts
// loadSnapshot() 内：
const oldVersion = data.version ?? 0;

// v5 → v6：E3 新字段
if (oldVersion < 6) {
  // knowledge = 0; copper = 0; tin = 0; bronze = 0; recorded = []; ...
  // 新字段一律补零值/空数组，**不清除旧字段**
}

// v6 → v7：E4 新字段
if (oldVersion < 7) {
  // iron = 0; coin = 0; order = 70; territory = 1; ...
}
```

### 5.3 铁律

- **不清除旧字段**——即使它们不再被当前时代使用（文明积累不清零）
- **新字段一律补零值/空数组**——不假设旧存档有这些数据
- **需要折算的资源**（如 E3 的 grain → food）在迁移中显式处理，并注释"这是资源合并"

---

## 六、tick 执行顺序（顺序错会算错账）

```
doTick(dt) 的标准执行顺序：
 1  资源产出（含季节/时代倍率）
 2  资源消耗（人口吃粮 / 冶炼投料 / 军团军饷 / 官吏俸禄）
 3  贸易结算（如有；30 秒一轮）
 4  人口增长（依赖第 2 步的食物余额）
 5  知识/研究产出（依赖第 4 步的人口）
 6  玩家手动操作的效果（刻录 / 建贸易路线 / 切政体）
 7  限制检查（存储上限 / 秩序触发 / 污染累积）
 8  消息与统计
```

> **E2 的教训**：贸易（或任何"救急"机制）必须排在人口消耗**之前**——
> 否则"断粮 → 贸易救回"会晚一拍体现，玩家会看到莫名其妙的人口下跌。

---

## 七、岗位退役与进阶

### 7.1 数据声明（`jobs.ts`）

```ts
// 进阶：这个岗位的从业者在条件满足后转为新岗位
upgradesTo: { job: 'farmer', hint: '…' },

// 退役判定由引擎计算（isJobRetired）：进阶目标的时代到来 → 源岗位退役
```

### 7.2 引擎逻辑（`game/engine.ts`）

- `isJobRetired(jobId, state)`：`eraDistance(upgradesTo.job 的 era, state.era) >= 0`
- `applyJobUpgradeAll(state)`：批量转出（时代入口调用）
- `applyJobUpgrade(state)`：逐 tick 转 1 人（处理"玩家又派回去了"的情况）

### 7.3 规则

- 退役岗位**还有人时仍显示**（"已取消·正在转出"），人清零后彻底消失
- 退役岗位**不接受新分配**（`setJobCount` 拒绝）
- 退役岗位的**产出管线停止**（该岗位人数为 0 → 产出为 0）

---

## 八、研究货币演进

| 代 | 货币 | 产出方 | 字段 |
|---|---|---|---|
| E1/E2 | 经验 | 人口 × 0.03/s | `experience` |
| E3 | 知识 | 书吏 × 0.15/s | `experience`（复用字段，E3 起语义变为"知识"） |
| E5 | 研究点 | 学者消耗典籍产出 | 新字段（待 E5 实装时定） |
| E6 | 研究点（承接） | — | 同 E5 |

**规则**：
- 旧字段**不清零**——文明积累不清零（铁律 3）
- 新货币字段在对应时代的迁移中**补 0**
- 研究货币的切换用 `getResearchCurrency(state)` 门控，不硬编码

---

## 九、验证清单（每个时代完成后必须全跑）

```bash
# 1. 类型检查
npx tsc --noEmit                        # 0 error

# 2. 前代基线（一字不差）
npx tsx src/dev/simulate.ts autoplay beeline   # E1 门槛
npx tsx src/dev/simulate.ts autoplay e2        # E2 通关
# 如果 E3 已实装：autoplay e3 也要跑

# 3. 新时代模拟
npx tsx src/dev/simulate.ts autoplay e{N}      # 新时代的通关测试

# 4. 构建
npm run build                                  # 成功

# 5. SSR 逐字节回归（如果改了渲染层）
#    见 ssr-byte-diff-regression skill
```

---

## 十、常见坑（全部实际踩过，不要重蹈覆辙）

| # | 坑 | 后果 | 预防 |
|---|---|---|---|
| 1 | `EraId` 联合类型没加新代号 | 所有引用新代名的数据文件报 34 个类型错误 | **第一件事**先加 EraId |
| 2 | store 的 `initialState()` 没加新字段 | 旧存档读档后新字段为 `undefined` → NaN | initialState / GameState / loadSnapshot 三处同步 |
| 3 | 新条件类型（如 `minResources`）没在 `checkAdvance` 注册 | 条件静默失效——era.ts 写了但不生效 | 加条件键时**同步改 engine.ts 的 checkAdvance** |
| 4 | 新机制没有时代门控 | 前代基线全变（E1 不再 1163s） | 每个引擎函数内的时代判断 + 基线回归 |
| 5 | `git add -A` 把别人的半成品卷进提交 | 提交里出现不认识的改动 | 只 `git add` 你改过的文件，或先 `git status` 确认 |
| 6 | SSR 测试只写 `setState` 不改 `getInitialState()` | SSR 读到陈旧状态，断言莫名失败 | **同时**写 init 对象和活 store |
| 7 | store 动作（如 `advanceEra`）替换了 state 对象，旧引用失效 | 渲染断言用到旧引用的数据 | 动作之后重新 `getState()` 或 `Object.assign(init, getState())` |
| 8 | tick 内的执行顺序不对 | "断粮→贸易救回"晚一拍；人口莫名下跌 | 贸易/救急机制排在人口消耗**之前** |
| 9 | 科技 id 与建筑 id 重名（如 `granary`） | 命名空间不同不报错，但极易混淆 | 科技 id 加后缀（如 `granary_tech`）或改名 |
| 10 | `branch` 联合类型加新值但 `BRANCH_INFO` / `TECHS_BY_BRANCH` 没补 | Record 类型不完整 → tsc 报错 | 加 branch 时同步补三处：TechBranch / TECHS_BY_BRANCH / BRANCH_INFO + BRANCH_ORDER |

---

## 十一、发现设计文档矛盾时的处理

1. **列出来**，写进计划文档的"待拍板"节
2. **不要擅自大改**设计文档的数值或叙事
3. **给出推荐方案**（含理由与备选），让用户/下一轮拍板
4. 实装时按推荐方案走，**在代码注释里写明"这是按推荐方案 X 实装的"**
5. 设计文档在配平阶段回写

**实际案例**（均已解决）：
- E3 文档"食物消耗 0.2" vs E2 代码 0.25 → 统一为 0.25（E2 已实装的为准）
- E4 文档"起始人口 1,000" vs E3 末态 ~2,160 → 按跃迁不重置原则，取 E3 末态继承
- E3 文档"经验每代清零" vs 用户拍板"文明积累不清零" → 文档已修订

---

## 十二、设计文档更新回路

实装完成后，**必须回写设计文档**：

1. 数值修正（`TODO(balance)` → 实测值）
2. 新机制的"已实装"标注
3. 口径统一（如"谷物已并入食物"）
4. 与实装不符的旧叙事标记为"已废弃"

> **为什么**：设计文档是下一个时代实装者的唯一上下文来源。
> 如果文档与代码不一致，下一个实装者会走弯路。

---

## 十三、并行开发（worktree 隔离）

当多个时代需要同时开发时：

```bash
# 主工作区：时代 N（另一个 AI 在做）
# 分支 worktree：时代 N+1（你在这做）
git worktree add .worktrees/e{N+1} -b feat-e{N+1}
echo ".worktrees/" >> .gitignore   # 如果还没加
```

**规则**：
- 分支名**不带斜杠**（`feat-e4` 不是 `feat/e4`——此环境嵌套 ref 会报 invalid reference）
- worktree 目录放在 `.worktrees/` 内（加入 .gitignore）
- **上一个时代的数据层快照采纳进新分支**（复制主工作区的 data 文件），确保编译通过
- 新时代的代码改动**只在新分支**上，不碰主工作区
- 上一个时代合入 main 后，把新分支 rebase 到 main
- `node_modules` 用 junction 链接主树（PowerShell `New-Item -ItemType Junction`）

---

*返回 [游戏规划索引](./README.md) ｜ [时代方向提案](./era-directions.md)*
