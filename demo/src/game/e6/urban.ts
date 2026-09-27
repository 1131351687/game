// E6 机器时代 · 城市化与污染（纯函数）
//
// 数值依据：design/game/eras/E6-machine.md §4.2/§4.3/§4.4 与 §11.7。
//
// ⚠️ 本模块是**逻辑斯谛模型首次出现"环境代价"**的地方：
//    前五个时代的人口 r 只受"食物够不够"影响，E6 起多了两个负向因子：
//      拥挤系数（城市化率驱动）  —— 人挤在一起会互相妨碍
//      卫生因子（污染驱动）      —— 工厂的烟尘与污水在杀人
//    两者连乘可以把 r 从 0.02 压到 0.0074 一带，形成**死亡螺旋**：
//      工厂多 → 污染高 → r 低 → 人口停 → 城市化率不升 → 玩家再建住宅 → 污染更高
//    唯一的出口是治理科技（公共卫生法 + 城市排水系统）。这不是可选项，
//    是 E6 后期能不能通关的前提。
//
// 所有函数均为纯函数。

import type { E1State } from '../engine';
import { E6 } from '../../data/constants';

/**
 * 来自 `aggregateEffects` 的 E6 城市治理参数。
 *
 * 与 energy.ts 同理：本模块不 import engine 的运行时函数（会形成循环依赖），
 * 聚合结果由 engine 侧注入。缺省即"无治理"。
 */
export interface E6UrbanEffects {
  /** 污染累积减免（加法键，上限 1.0） */
  pollutionReduce?: number;
  /** 拥挤系数缓解（加法键） */
  crowdingReduce?: number;
  /** 每人知识产出加成（分析机彩蛋） */
  knowledgePerPopAdd?: number;
}

const NO_URBAN_EFFECTS: Required<E6UrbanEffects> = {
  pollutionReduce: 0,
  crowdingReduce: 0,
  knowledgePerPopAdd: 0,
};

function ufx(e?: E6UrbanEffects): Required<E6UrbanEffects> {
  return { ...NO_URBAN_EFFECTS, ...(e ?? {}) };
}

/**
 * 城市化率 U = min(1, 工人住宅承载 / max(population, 1))。
 *
 * 口径依据 devplan §4.3 的拍板：设计文档只说"U = 城市人口/总人口"却未定义
 * 城市人口；工人住宅提供 K（+200/座），是最贴近"城市承载"的可量化来源。
 *
 * ⚠️ 本函数是 U 的**唯一定义来源**。getCrowdingCoef 与 UI 诊断都必须调它，
 *    禁止在别处另行推导 —— 否则两处口径漂移会让"城市化率 70%"这个跃迁条件
 *    变得无法解释（devplan §3.1 的明确要求）。
 */
export function getUrbanizationRate(state: E1State): number {
  const housing = state.buildings.worker_housing ?? 0;
  const capacity = housing * E6.POP_K_PER_HOUSING;
  const pop = Math.max(state.population ?? 0, 1);
  return Math.min(1, capacity / pop);
}

/**
 * 拥挤系数：按城市化率分档查表。
 *
 * ≤40% → 1.0（不拥挤）
 * >85% → 0.45（挤到影响繁衍）
 *
 * 用分档而非连续函数，是为了让 UI 能说清"你现在在哪一档、下一档在哪"。
 */
export function getCrowdingCoef(state: E1State, effects?: E6UrbanEffects): number {
  const e = ufx(effects);
  const u = getUrbanizationRate(state);
  // 治理科技的缓解直接取自 aggregateEffects（已按 eraDecay 衰减），
  // 不再在此处硬编码 tech id —— 否则跨代衰减会被绕过。
  const relief = e.crowdingReduce;

  for (const row of E6.CROWDING_TABLE) {
    if (u <= row.maxU) return Math.min(1, row.coef + relief);
  }
  return Math.min(1, E6.CROWDING_TABLE[E6.CROWDING_TABLE.length - 1].coef + relief);
}

/**
 * 污染治理速率（0–1 的减免比例）。
 *
 * 来源：公共卫生法 −25%、城市排水系统 −20%，
 * 外加表面冷凝器的 −5%（闭式循环少排污）。
 * 合计上限 1.0（全治）。
 *
 * ⚠️ devplan §七 矛盾 6 指出「污染治理速率来源未定义」（§4.3 引"卫生设施等级"
 *    但无对应建筑）。此处按 devplan 的推荐先用「科技减免」实现，
 *    待拍板后再补建筑来源。已标 TODO(balance)。
 */
export function getPollutionReduction(effects?: E6UrbanEffects): number {
  const e = ufx(effects);
  // 全部来自 aggregateEffects 的 pollutionReduce 加法键：
  //   公共卫生法 0.25 + 城市排水系统 0.20 + 表面冷凝器 0.05 = 0.50
  // ⚠️ devplan §七 矛盾 6 指出「污染治理速率来源未定义」（§4.3 引"卫生设施等级"
  //    但无对应建筑）。此处按 devplan 推荐先用科技减免实现，待拍板后补建筑来源。
  // TODO(balance)
  return Math.min(1, e.pollutionReduce);
}

/**
 * 污染累积推进。
 *
 * 累积 = Σ工厂 × 0.008/s × (1 − 治理减免)
 * 上限 250（卫生因子 = 1 − Pol/250，故满污染时卫生因子仍有 0.6，
 * 不会归零 —— 城市能被毒到虚弱，但不会直接判死刑）。
 */
export function tickPollution(
  pollution: number,
  state: E1State,
  dt: number,
  effects?: E6UrbanEffects
): { pollution: number; delta: number } {
  const factories = state.buildings.factory ?? 0;
  if (factories === 0) {
    // 无工厂时污染缓慢自然消散（风向、雨水）
    const decay = 0.5 * dt;
    const next = Math.max(0, pollution - decay);
    return { pollution: next, delta: next - pollution };
  }

  const reduction = getPollutionReduction(effects);
  const gain = factories * E6.POLLUTION_PER_FACTORY * (1 - reduction) * dt;
  // 治理到极限时也允许缓慢自净，否则玩家无法从高污染回头
  const naturalDecay = reduction > 0 ? 0.3 * reduction * dt : 0;

  let next = pollution + gain - naturalDecay;
  if (next < 0) next = 0;
  if (next > E6.POLLUTION_CAP) next = E6.POLLUTION_CAP;
  return { pollution: next, delta: next - pollution };
}

/**
 * 卫生因子 = 1 − 污染 / 250。
 *
 * 下限钳到 0.6：满污染时人口增速降到 60%，与拥挤系数（最低 0.45）
 * 连乘后 r = 0.02 × 0.45 × 0.6 = 0.0054，接近停滞但仍可恢复 ——
 * 死亡螺旋是"难"，不是"必死"，治理科技到位后能爬出来。
 */
export function getSanitationFactor(state: E1State): number {
  const p = state.pollution ?? 0;
  return Math.max(0.6, 1 - p / E6.POLLUTION_CAP);
}

/**
 * E6 人口增长率 r（/秒）。
 *
 * r = 0.02 × 拥挤系数 × 卫生因子
 *
 * ⚠️ 与旧时代的关键差异：
 *   - 季节在 E6 **关闭**（seasonR = 1，工业不看天吃饭）；
 *   - 但食物因子仍按存量判定（工业化 ≠ 粮食无限）。
 * 食物因子由调用方（engine）提供，此处只负责环境代价部分，
 * 避免本模块反向依赖 engine 的食物计算。
 */
export function getGrowthRateE6(
  state: E1State,
  foodFactor: number,
  effects?: E6UrbanEffects
): number {
  const crowding = getCrowdingCoef(state, effects);
  const sanitation = getSanitationFactor(state);
  return E6.POP_GROWTH_BASE * crowding * sanitation * foodFactor * E6.SEASON_R;
}

/**
 * E6 人口承载力 K = 900 + 工人住宅 × 200 + 旧时代全部遗产。
 *
 * ⚠️ 与 E5 的 getCapacity 修复同源教训：**跃迁只新增不重置**。
 *    E6 的 K 必须把 E1–E5 的住房与版图遗产全部继承，
 *    否则从 E5（K 数千）跃迁到 E6 会断崖式塌到 900 一带，人口一路归零。
 *    （E5 实装时正是漏了这个分支，已由 e5-autoplay 复现并修复。）
 */
export function getCapacityE6(state: E1State): number {
  const housing = state.buildings.worker_housing ?? 0;
  return E6.POP_K_BASE + housing * E6.POP_K_PER_HOUSING;
}

/**
 * 人口卡住诊断（UI 用）：分条给出"r 被谁拖住"。
 *
 * 设计意图：E6 的 r 有四个输入，玩家看到人口不动时必须能立刻知道
 * 该去哪儿处理。笼统的"人口增长缓慢"是失败的信息设计。
 */
export interface GrowthDiagnosis {
  crowding: number;
  sanitation: number;
  urbanization: number;
  pollution: number;
  /** 最严重的问题（按影响排序） */
  topIssue: 'crowding' | 'pollution' | 'none';
  /** 是否建议治理 */
  needsGovernance: boolean;
}

export function getGrowthDiagnosis(state: E1State, effects?: E6UrbanEffects): GrowthDiagnosis {
  const crowding = getCrowdingCoef(state, effects);
  const sanitation = getSanitationFactor(state);
  const urbanization = getUrbanizationRate(state);
  const pollution = state.pollution ?? 0;

  const crowdingLoss = 1 - crowding;
  const sanitationLoss = 1 - sanitation;
  const topIssue: GrowthDiagnosis['topIssue'] =
    crowdingLoss > sanitationLoss ? 'crowding' : sanitationLoss > 0.05 ? 'pollution' : 'none';

  return {
    crowding,
    sanitation,
    urbanization,
    pollution,
    topIssue,
    needsGovernance: crowding < 0.8 || sanitation < 0.85,
  };
}

/**
 * 知识产出（T2.6）：人口 × 0.3 × (1 + 0.03N)。
 *
 * N = 已研究 E6 科技数，**从 0 起步**（与 E5 的复利不同：E5 是本时代科技数
 * 驱动 R，E6 是直接挂在知识产出上）。印刷术的 k×0.6 已并入 0.3 系数。
 */
export function calcKnowledgeOutputE6(state: E1State, effects?: E6UrbanEffects): number {
  const e = ufx(effects);
  const pop = state.population ?? 0;
  let n = 0;
  for (const id of E6_TECH_IDS) {
    if (state.techs[id]) n++;
  }
  // 分析机彩蛋的加成走 aggregateEffects（受 eraDecay 影响），
  // 不再在此处硬编码 tech id。
  const perPop = E6.KNOWLEDGE_PER_POP + e.knowledgePerPopAdd;
  return pop * perPop * (1 + E6.KNOWLEDGE_COMPOUND_SLOPE * n);
}

/**
 * E6 全部科技 id（用于统计 N，不引入 data 层依赖以免循环引用）。
 * ⚠️ 新增 E6 科技时必须同步这里，否则复利项会漏算。
 */
const E6_TECH_IDS: string[] = [
  'steam_engine_industry',
  'coal_mining',
  'newcomen',
  'smeaton',
  'separate_condenser',
  'reciprocating_engine',
  'bessemer',
  'electromagnetic_induction',
  'railroad',
  'analytical_engine',
  'coke_smelting',
  'surface_condenser',
  'governor',
  'high_pressure',
  'compound_expansion',
  'dc_transmission',
  'ac_transmission',
  'hvac_transmission',
  'standardized_parts',
  'assembly_line',
  'public_health_act',
  'sewer_system',
  'steel_rail',
  'electric_power',
];

/** 已研究的 E6 科技数（供 UI 与复利显示） */
export function countE6Techs(state: E1State): number {
  let n = 0;
  for (const id of E6_TECH_IDS) {
    if (state.techs[id]) n++;
  }
  return n;
}
