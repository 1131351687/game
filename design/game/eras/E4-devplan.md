# E4 · 开发任务清单（当前版）

> **当前状态**：E4 核心循环、数据、UI、存档迁移、快速诊断与真实 E1→E4 全链路均已通过；以 `main` 和 `demo/src` 为准。旧的秩序/政体/官吏/法典开发清单已废弃。
>
> **目标**：完成“钢铁与铸币供给 -> 军团征伐 -> 平定期 -> 版图扩张 -> 统一科技 -> 统一天下”的可玩闭环，并保持 E1-E3 基线不被污染。

## 0. 当前实现摘要

- E4 时代已加入 `EraId`，`ERAS.E4.gateTech = 'unification'`。
- 新增铁、铸币；知识继续使用 `experience` 字段。
- 新增铁矿工、铸币工、军团兵。
- 新增铸币厂、军团营垒、驰道、武库。
- E4 科技分三线：钢铁与铸币、后勤与编户、军略与统一。
- 扩张使用统一公式源 `getExpansionRequirement()`。
- 军团战力由科技 `legionPowerMul` 和武库加成共同决定。
- E4 完成条件：`unification`、版图 ≥ 20、铸币 ≥ 150,000、军团营垒 ≥ 4。
- E4 不再使用秩序、政体、官吏、法典、行政覆盖率与维稳状态机。

## 1. 代码验收矩阵

| 项目 | 证据 | 状态 |
|---|---|---|
| E3 -> E4 资产继承 | `computeEraTransition` 回归 | 已完成 |
| 首座军工建筑可支付 | 回归断言首座铸币厂/营垒在 `territory = 1` 铁上限内 | 已完成 |
| 铁/铸币/军晌结算 | `tick` E4 分支与回归 | 已完成 |
| 版图扩张与平定期 | `getExpansionRequirement`、`expandTerritory`、tick | 已完成 |
| 武库与军团战力 | `getArmoryLegionBonus`、`getLegionPower` | 已完成 |
| 统一条件 | `checkAdvance` 与 E4 面板 | 已完成 |
| 快速可达性 | `diag-e4-fast.ts` | 已完成 |
| E1-E4 回归 | `npm run regression` | 已完成 |
| 生产构建 | `npm run build` | 已完成 |
| 完整链式自动试玩 | `npx --yes tsx src/dev/simulate.ts autoplay e4` | 已完成（2026-09-17） |
| 浏览器手动试玩 | 375px 与桌面视口 | 待完成 |
| 文档同步 | `E4-empire.md`、本文件 | 已完成 |

## 2. 已完成阶段

### P1 · 数据与状态

- 删除 `government_office`、`code_stele`、`official`。
- 新增 `armory` 与 `iron_miner`、`mint_worker`、`legion`。
- `GameState` 收敛为 `iron/coin/territory/legions/expansionPending/p1Unlocked/legacyPoints`。
- `SAVE_VERSION` 提升到 9，并清理旧存档字段。

### P2 · 引擎与系统层

- `tick` 的 E4 分支处理：
  - 铁矿产出；
  - 铸币产出与铁消耗；
  - 军团吃粮、铸币军晌；
  - 平定期到期；
  - 铁/铸币库存上限。
- `getTerritoryOutputMultiplier`、`getTerritoryCapacity`、`getExpansionRequirement` 成为版图与征伐的公共公式源。
- `store.expandTerritory()` 与 `store.abandonTerritory()` 复用引擎公式，不在 UI 重复算规则。

### P3 · UI

- `E4StatusChips` 显示版图、军团、下一战需求、平定期、军饷、遗产倍率。
- `EmpireDashboard` 显示统一战争、下一块版图、军团与军需、军营/武库、统一条件。
- 删除秩序、政体、官吏、法典面板。
- 科技网格按钢铁/后勤/军略三条路线展示，统一科技为终点。

### P4 · 配平与回归

- 首座铸币厂：木 1,200 + 铁 600。
- 首座军团营垒：木 1,000 + 铁 800。
- `diag-e4-fast.ts` 使用战争优先的岗位与建造策略，保留下一次征伐所需铁/铸币，避免自动试玩自我饿死。
- 快速诊断已能从 1 格版图扩到 24 格，完成统一检查。

## 3. 剩余工作

### R1 · 完整链式自动试玩

运行并记录：

```powershell
cd D:\try\Civilis\game\demo
npx --yes tsx src/dev/simulate.ts autoplay e4
```

结果（2026-09-17）：真实链式通过。E3 在 7356s 满足跃迁；E4 在 11,400s 后、12,000s 前完成统一检查。末态：人口 3202、版图 24、军团 95、铸币 686,335；`checkAdvance()` 允许进入 E5。首座铸币厂、首座军团营垒、24 格扩张和统一科技均实际发生。

要求：

- 从真实 E1 -> E2 -> E3 -> E4 状态进入；
- 不手工构造 E4 终态；
- 能看到统一科技完成和 `checkAdvance()` 通过；
- 若失败，修正数值或自动策略，不降低验收条件。

### R2 · 浏览器手动检查

打开 `npm run dev`，在 E4 状态检查：

- 375px：资源栏、状态条、文明面板无重叠或截断；
- 桌面：版图、军团、下一战需求、武库信息完整；
- 铸币厂、营垒、驰道、武库可建造；
- 无秩序、政体、官吏、法典按钮；
- 统一条件随数据变化实时更新。

### R3 · E5 交接预留

E4 完成只解锁进入 E5 的前置状态。E5 可以沿用：

- 版图；
- 军团/军制历史；
- 铸币资本；
- 统一后的知识与基础设施。

不得在 E4 文档中重新引入已经删除的内部经营系统。

## 4. 提交与推送规范

- 一个稳定功能组一个提交。
- 提交前运行：`npm run build`、`npm run regression`、`npx --yes tsx src/dev/diag-e4-fast.ts`、`git diff --check`。
- 不提交 `.tmp-*`、未跟踪的临时试验目录或凭据。
- 阶段完成后推送到 `origin/main`，报告提交 SHA、验证结果和剩余边界。
- 子代理只处理边界清楚的并行任务；`engine.ts`、`store.ts`、存档迁移和最终合并由主 AI 负责。

## 5. 当前完成定义

E4 可以标记为“可玩完成”，需要同时满足：

1. `E4-empire.md` 与代码一致；
2. 回归、构建、快速诊断全通过；
3. 完整链式试玩有结果记录（2026-09-17 已通过，末态版图 24、铸币 686,335）；
4. 浏览器 E4 手动检查通过；
5. 不存在旧秩序/政体/官吏/法典可执行路径。
