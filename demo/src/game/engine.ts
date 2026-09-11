// 游戏引擎（多时代）
// 只做纯计算；状态变更由 store 负责
// 数值来源：design/game/02-tech-eras.md 第 11 节 + 各时代设计文档

import { TECHS, TECH_MAP, type TechEffects } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDING_MAP, type BuildingId } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { ERAS, eraDistance, eraDecay, type EraId } from '../data/era';
import {
  getFoodFactorFromStorage,
  getSeasonGrowthFactor,
  getSeasonOutputMultiplier,
  getGranaryCapacity,
  getSeasonFromElapsed,
  YEAR_DURATION_SEC,
  type SeasonId,
} from './season';
import {
  FIRE,
  FIRE_TIER_INFO,
  POPULATION,
  FOOD_FACTOR,
  BUILDING_EFFECTS,
  E2,
  getFireTier,
  getToolMultiplier,
  type FireTier,
} from '../data/constants';

// ─────────────────────────────────────────────
// 状态形状（引擎只读）
// ─────────────────────────────────────────────
export interface EraState {
  /** 当前所处时代 */
  era: EraId;
  food: number;
  wood: number;
  stone: number;
  experience: number;
  /** 人口：**始终为整数**（小数增长累积在 populationProgress 里） */
  population: number;
  /** 人口增长的累积进度（0..1）；满 1 时人口 +1 */
  populationProgress: number;
  fire: number;
  jobs: Record<string, number>;
  buildings: Record<string, number>;
  techs: Record<string, boolean>;
  autoMaintainFire: boolean;

  // ─────────────────────────────────────────────
  // E2 定居时代
  // ─────────────────────────────────────────────

  /** 谷物：定居时代的主粮，受粮仓容量限制 */
  grain: number;
  /** 活体牲畜：既是储备也是畜力，**不占粮仓容量** */
  livestock: number;
  /** 织物 */
  fabric: number;
  /**
   * 本时代已经过的秒数。
   *
   * 这是季节循环的**唯一驱动源**：季节完全由它推导（`getSeasonFromElapsed`），
   * 不另存「当前季节」字段——两个字段迟早会互相矛盾。
   * 跨时代跃迁时归零，所以每个时代都从春天开始。
   */
  eraElapsedSec: number;
}

/** @deprecated 旧名单时代命名，仅为向后兼容保留。新代码请用 EraState */
export type E1State = EraState;

// ─────────────────────────────────────────────
// 科技效果聚合
// ─────────────────────────────────────────────
export interface AggregatedEffects {
  fireEnabled: boolean;
  activeFireRestore: boolean;
  fireDecayMultiplier: number;
  fireMaxBonus: number;
  removeWeakFoodPenalty: boolean;
  foodMultiplier: number;
  stoneMultiplier: number;
  expMultiplier: number;
  gathererMultiplier: number;
  toolTier: number;
  buildingCostMultiplier: number;
  stabilityBonus: number;
  huntPartyThreshold: number;
  huntPartyBonus: number;
  foodStorageMultiplier: number;
  enableAdvance: boolean;

  // ─────────────────────────────────────────────
  // E2 定居时代（核心科技：农业）
  // ─────────────────────────────────────────────

  /** 季节循环是否开启（农业核心科技） */
  seasonsEnabled: boolean;
  /** 四季农业倍率加成（加法，叠加在季节基础值之上） */
  seasonAgriBonus: Record<SeasonId, number>;
  /** 谷物总产出乘数 */
  grainMultiplier: number;
  /** 按岗位的效率乘数 */
  jobMultiplier: Partial<Record<JobId, number>>;
  /** 按资源的产出乘数 */
  resourceMultiplier: Partial<Record<ResourceId, number>>;

  /** 牲畜产食物乘数 */
  livestockFoodMul: number;
  /** 夏季牧人效率乘数 */
  summerHerderMul: number;
  /** 每座畜栏存栏上限加成 */
  penCapacityAdd: number;
  /** 牲畜世代等级（取最大） */
  livestockTier: number;
  /** 饥荒时牲畜存活率（0=全死，0.5=活一半；取最大） */
  livestockFamineSurvival: number;

  /** 田地出产乘数 */
  fieldYieldMul: number;
  /** 田地效率上限（取最大） */
  fieldEfficiencyCap: number;
  /** 饲料成本乘数（<1 降低） */
  feedCostMultiplier: number;

  /** 村落民居成本乘数 */
  villageHouseCostMul: number;
  /** 单座粮仓容量（取最大） */
  granaryPerUnit: number;
  /** 粮仓总容量乘数 */
  granaryCapacityMul: number;
  /** 陶窑容量加成（取最大） */
  kilnBonus: number;
  /** 粮仓溢出阈值加成 */
  granaryOverflowBonus: number;
  /** 岗位切换成本乘数（<1 降低） */
  jobSwitchCostMul: number;
  /** 取消 E1 承载力硬顶 */
  removeCapacityCap: boolean;
}

const DEFAULT_EFFECTS: AggregatedEffects = {
  fireEnabled: false,
  activeFireRestore: false,
  fireDecayMultiplier: 1,
  fireMaxBonus: 0,
  removeWeakFoodPenalty: false,
  foodMultiplier: 1,
  stoneMultiplier: 1,
  expMultiplier: 1,
  gathererMultiplier: 1,
  toolTier: 0,
  buildingCostMultiplier: 1,
  stabilityBonus: 0,
  huntPartyThreshold: 0,
  huntPartyBonus: 0,
  foodStorageMultiplier: 1,
  enableAdvance: false,

  // ── E2 定居时代 ──
  seasonsEnabled: false,
  seasonAgriBonus: { spring: 0, summer: 0, autumn: 0, winter: 0 },
  grainMultiplier: 1,
  jobMultiplier: {},
  resourceMultiplier: {},
  livestockFoodMul: 1,
  summerHerderMul: 1,
  penCapacityAdd: 0,
  livestockTier: 0,
  livestockFamineSurvival: 0,
  fieldYieldMul: 1,
  fieldEfficiencyCap: 1,
  feedCostMultiplier: 1,
  villageHouseCostMul: 1,
  granaryPerUnit: 0,
  granaryCapacityMul: 1,
  kilnBonus: 0,
  granaryOverflowBonus: 0,
  jobSwitchCostMul: 1,
  removeCapacityCap: false,
};

export function aggregateEffects(state: E1State): AggregatedEffects {
  // 注意：seasonAgriBonus / jobMultiplier / resourceMultiplier 是引用类型，
  // 必须新建。若沿用浅拷贝，写入会穿透到 DEFAULT_EFFECTS 上，
  // 污染此后所有调用（E1 的配平会被悄悄改掉）。
  const acc: AggregatedEffects = {
    ...DEFAULT_EFFECTS,
    seasonAgriBonus: { ...DEFAULT_EFFECTS.seasonAgriBonus },
    jobMultiplier: {},
    resourceMultiplier: {},
  };

  for (const tech of TECHS) {
    if (!state.techs[tech.id]) continue;
    const e: TechEffects = tech.effects;

    // ── 时代衰减 ──
    //
    // 设计规则：旧时代的核心科技「不废弃，只降权」
    //   主引擎期 ×1.00 → 地基期 ×0.60 → ×0.36 → ×0.22 → 下限 ×0.20
    //
    // 关键区分（这是设计文档里"旧核心提供质的加成，不只是量"的落地）：
    //   · 数值型效果（乘数/加成）→ 按 decay 衰减
    //   · 布尔/解锁型效果（enableFire / unlockJobs / setToolTier）→ 不衰减
    //     因为「已掌握的东西不会忘记」
    const k = eraDecay(eraDistance(tech.era, state.era));
    /** 乘数衰减：把 m 朝基线 1 拉近。m=1.25、k=0.6 → 1.15 */
    const mul = (m: number): number => 1 + (m - 1) * k;
    /** 加数衰减：把 v 朝基线 0 拉近 */
    const add = (v: number): number => v * k;

    // — 解锁/布尔型：不衰减 —
    if (e.enableFire) acc.fireEnabled = true;
    if (e.activeFireRestore) acc.activeFireRestore = true;
    if (e.removeWeakFoodPenalty) acc.removeWeakFoodPenalty = true;
    if (e.setToolTier !== undefined) acc.toolTier = Math.max(acc.toolTier, e.setToolTier);
    if (e.huntPartyThreshold) acc.huntPartyThreshold = e.huntPartyThreshold;
    if (e.enableAdvance) acc.enableAdvance = true;

    // — 数值型：按时代衰减 —
    if (e.fireDecayMultiplier !== undefined) acc.fireDecayMultiplier *= mul(e.fireDecayMultiplier);
    if (e.fireMaxBonus) acc.fireMaxBonus += add(e.fireMaxBonus);
    if (e.foodMultiplier) acc.foodMultiplier *= mul(e.foodMultiplier);
    if (e.stoneMultiplier) acc.stoneMultiplier *= mul(e.stoneMultiplier);
    if (e.expMultiplier) acc.expMultiplier *= mul(e.expMultiplier);
    if (e.gathererMultiplier) acc.gathererMultiplier *= mul(e.gathererMultiplier);
    if (e.buildingCostMultiplier) acc.buildingCostMultiplier *= mul(e.buildingCostMultiplier);
    if (e.stabilityBonus) acc.stabilityBonus += add(e.stabilityBonus);
    if (e.huntPartyBonus) acc.huntPartyBonus = add(e.huntPartyBonus);
    if (e.foodStorageMultiplier) acc.foodStorageMultiplier *= mul(e.foodStorageMultiplier);

    // — E2 布尔/解锁型：不衰减 —
    if (e.enableSeasons) acc.seasonsEnabled = true;
    if (e.removeCapacityCap) acc.removeCapacityCap = true;

    // — E2 绝对设置型：取「已研究科技中的最大值」，不衰减 —
    //
    // 这些是能力上限而非产量加成：地基期也不该退回石器时代的水准。
    if (e.fieldEfficiencyCap !== undefined) {
      acc.fieldEfficiencyCap = Math.max(acc.fieldEfficiencyCap, e.fieldEfficiencyCap);
    }
    if (e.livestockTier !== undefined) {
      acc.livestockTier = Math.max(acc.livestockTier, e.livestockTier);
    }
    if (e.granaryPerUnit !== undefined) {
      acc.granaryPerUnit = Math.max(acc.granaryPerUnit, e.granaryPerUnit);
    }
    if (e.kilnBonus !== undefined) {
      acc.kilnBonus = Math.max(acc.kilnBonus, e.kilnBonus);
    }
    if (e.livestockFamineSurvival !== undefined) {
      acc.livestockFamineSurvival = Math.max(
        acc.livestockFamineSurvival,
        e.livestockFamineSurvival
      );
    }

    // — E2 季节倍率加成：加法键，按时代衰减 —
    if (e.springAgriMul) acc.seasonAgriBonus.spring += add(e.springAgriMul);
    if (e.summerAgriMul) acc.seasonAgriBonus.summer += add(e.summerAgriMul);
    if (e.autumnAgriMul) acc.seasonAgriBonus.autumn += add(e.autumnAgriMul);
    if (e.winterAgriMul) acc.seasonAgriBonus.winter += add(e.winterAgriMul);

    // — E2 乘法键：按时代衰减 —
    if (e.grainMultiplier) acc.grainMultiplier *= mul(e.grainMultiplier);
    if (e.livestockFoodMul) acc.livestockFoodMul *= mul(e.livestockFoodMul);
    if (e.summerHerderMul) acc.summerHerderMul *= mul(e.summerHerderMul);
    if (e.fieldYieldMul) acc.fieldYieldMul *= mul(e.fieldYieldMul);
    if (e.feedCostMultiplier) acc.feedCostMultiplier *= mul(e.feedCostMultiplier);
    if (e.villageHouseCostMul) acc.villageHouseCostMul *= mul(e.villageHouseCostMul);
    if (e.granaryCapacityMul) acc.granaryCapacityMul *= mul(e.granaryCapacityMul);
    if (e.jobSwitchCostMul) acc.jobSwitchCostMul *= mul(e.jobSwitchCostMul);

    // — E2 加法键：按时代衰减 —
    if (e.penCapacityAdd) acc.penCapacityAdd += add(e.penCapacityAdd);
    if (e.granaryOverflowBonus) acc.granaryOverflowBonus += add(e.granaryOverflowBonus);

    // — E2 按岗位 / 按资源的乘数 —
    if (e.jobMultiplier) {
      for (const [job, m] of Object.entries(e.jobMultiplier)) {
        if (m === undefined) continue;
        const id = job as JobId;
        acc.jobMultiplier[id] = (acc.jobMultiplier[id] ?? 1) * mul(m);
      }
    }
    if (e.resourceMultiplier) {
      for (const [res, m] of Object.entries(e.resourceMultiplier)) {
        if (m === undefined) continue;
        const id = res as ResourceId;
        acc.resourceMultiplier[id] = (acc.resourceMultiplier[id] ?? 1) * mul(m);
      }
    }
  }

  return acc;
}

// ─────────────────────────────────────────────
// T2.1 火种系统
// ─────────────────────────────────────────────

export function getFireMax(state: E1State): number {
  const eff = aggregateEffects(state);
  const hearths = state.buildings.hearth ?? 0;
  return FIRE.MAX + eff.fireMaxBonus + hearths * BUILDING_EFFECTS.HEARTH_MAX_BONUS;
}

export function getFireDecay(state: E1State): number {
  // 定居时代（E2 起）：火源转为恒定，不再衰减也不再需要维护。
  // tickFire 早已对非 E1 提前返回（火值冻结），若这里仍返回非零值，
  // UI 会显示一个「N 秒后熄灭」的假倒计时 —— 引擎与视图必须同源。
  if (state.era !== 'E1') return 0;

  const eff = aggregateEffects(state);
  const hearths = state.buildings.hearth ?? 0;
  let decay = FIRE.DECAY_PER_SEC * eff.fireDecayMultiplier;
  for (let i = 0; i < hearths; i++) {
    decay *= 1 - BUILDING_EFFECTS.HEARTH_DECAY_REDUCTION;
  }
  return decay;
}

/** 推进火种 dt 秒（含自动维持消耗木材） */
export function tickFire(
  state: E1State,
  dt: number
): { fire: number; wood: number; maintained: boolean } {
  let fire = state.fire;
  let wood = state.wood;
  let maintained = false;

  if (!aggregateEffects(state).fireEnabled) {
    return { fire: 0, wood, maintained: false };
  }

  // E2 起：火种维护取消（定居后有固定炉灶），火值冻结不再衰减
  // —— 设计文档：进入新时代时旧核心「不废弃，只降权」
  //    维护压力解除，但它的加成仍按时代衰减继续生效（见 getFireFoodBonus）
  if (state.era !== 'E1') {
    return { fire, wood, maintained: false };
  }

  if (state.autoMaintainFire && fire < FIRE.AUTO_MAINTAIN_THRESHOLD && wood >= 1) {
    const need = Math.ceil((FIRE.AUTO_MAINTAIN_THRESHOLD - fire) / FIRE.PER_WOOD);
    const use = Math.min(need, Math.floor(wood));
    if (use > 0) {
      wood -= use;
      fire = Math.min(fire + use * FIRE.PER_WOOD, getFireMax(state));
      maintained = true;
    }
  }

  fire = Math.max(0, fire - getFireDecay(state) * dt);
  return { fire, wood, maintained };
}

/** 手动投入木材 */
export function addFuel(state: E1State, woodAmount: number): { fire: number; wood: number } {
  const use = Math.min(woodAmount, Math.floor(state.wood));
  const fire = Math.min(state.fire + use * FIRE.PER_WOOD, getFireMax(state));
  return { fire, wood: state.wood - use };
}

export function getFireFactor(state: E1State): number {
  return FIRE_TIER_INFO[getFireTier(state.fire)].factor;
}

export function getFireTierInfo(state: E1State): {
  tier: FireTier;
  name: string;
  factor: number;
  color: string;
} {
  const tier = getFireTier(state.fire);
  const info = FIRE_TIER_INFO[tier];
  return { tier, name: info.name, factor: info.factor, color: info.color };
}

/** 火种带来的食物加成（热石煮食可取消微弱档惩罚） */
export function getFireFoodBonus(state: E1State): number {
  const tier = getFireTier(state.fire);
  const eff = aggregateEffects(state);

  const raw =
    tier === 'weak' && eff.removeWeakFoodPenalty
      ? FIRE_TIER_INFO.stable.foodBonus
      : FIRE_TIER_INFO[tier].foodBonus;

  // 火种属 E1 的核心科技：进入后续时代后加成按时代距离衰减
  // （E1 内 d=0 系数 1.0，不影响现有手感）
  const k = eraDecay(eraDistance('E1', state.era));
  return raw * k;
}

// ─────────────────────────────────────────────
// T2.2 人口模型（逻辑斯蒂增长）
// ─────────────────────────────────────────────

export function getCapacity(state: E1State): number {
  const houses = state.buildings.house ?? 0;
  const villageHouses = state.buildings.village_house ?? 0;
  const fields = state.buildings.field ?? 0;
  const farmers = state.jobs.farmer ?? 0;

  // 只有「已耕作」的田地才算承载力：田地必须凑够最低农夫数才在种。
  const cultivatedFields = Math.min(
    fields,
    Math.floor(farmers / E2.FIELD_MIN_FARMERS)
  );

  // E1 的住所不会因为进入定居时代而失效——跃迁瞬间 K 必须连续。
  // 设计文档 §6：E2 起始 K=16 = E1 基础 4 + 3 住所 × 4。
  // 定居时代在此之上叠加村落民居与已耕作田地。
  return (
    POPULATION.BASE_CAPACITY +
    houses * POPULATION.CAPACITY_PER_HOUSE +
    villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
    cultivatedFields * E2.CAPACITY_PER_FIELD
  );
}

export function getFoodConsumption(state: E1State): number {
  return state.population * POPULATION.FOOD_CONSUMPTION_PER_PERSON;
}

export function getFoodProduction(state: E1State): number {
  return calcResourceOutput('food', state);
}

export function getFoodFactor(state: E1State): number {
  // ── E2 定居时代：主粮换成谷物 ──
  //
  // 流式「产出/消耗」比值在这里没有意义：定居时代的问题不是"今天够不够吃"，
  // 而是"入冬前攒了多少"。所以食物因子直接由人均储粮推导
  // （设计文档 §5：≥60→1.0，≥32→0.8，≥12→0.4，<12→0，=0→−0.5）。
  if (aggregateEffects(state).seasonsEnabled) {
    const perPerson = state.population > 0 ? state.grain / state.population : state.grain;
    return getFoodFactorFromStorage(perPerson);
  }

  const prod = getFoodProduction(state);
  const cons = getFoodConsumption(state);
  if (cons <= 0) return FOOD_FACTOR.ABUNDANT;
  if (state.food <= 0 && prod < cons) return FOOD_FACTOR.FAMINE;
  if (prod < cons) return FOOD_FACTOR.TIGHT;
  if (prod > cons * 2) return FOOD_FACTOR.ABUNDANT;
  return FOOD_FACTOR.NORMAL;
}

/** 人口增长速率（每秒），可正可负 */
export function getPopulationGrowth(state: E1State): number {
  const eff = aggregateEffects(state);
  const K = getCapacity(state);
  const P = state.population;

  // 季节因子：只在开启季节循环（E2 农业）后生效，E1 恒为 1.0
  // —— 因此远古时代的配平逐字节不变。
  // 冬季为负（−0.15）：人口自然回落，这是"青黄不接"的机制表达，
  // 而不是靠饿死人来惩罚玩家。
  const seasonR = eff.seasonsEnabled ? getSeasonGrowthFactor(state.eraElapsedSec) : 1;

  // 火种系统尚未开启（还没研究「掌握火」）：
  // 此时不存在"熄灭惩罚"，火源因子按中性 1.0 处理。
  // —— 否则开局 fire=0 会被误判为"火灭了"，人口在几秒内死光。
  if (!eff.fireEnabled) {
    const r0 = POPULATION.BASE_GROWTH_RATE * seasonR;
    const foodFactor0 = getFoodFactor(state);
    if (foodFactor0 < 0) return -POPULATION.STARVATION_DECAY;
    return r0 * P * (1 - P / K) * foodFactor0;
  }

  // 火源因子：定居时代（E2 起）火源转为恒定，不再作为生存开关。
  // 设计文档 §13：「火源 · 人口舒适度基础」，标签为「当前 ×1.0（恒定，无需维护）」。
  // 若沿用 E1 的「熄灭 → 饥荒」规则，玩家只要带着 fire=0 跃迁（例如木材耗尽时），
  // 定居时代就会陷入永久 −0.5/秒 的人口衰减 —— 一个玩家无法自救的死局。
  const fireFactor = state.era === 'E1' ? getFireFactor(state) : 1;

  // 火种已开启但熄灭了 → 生存惩罚（仅远古时代）
  if (fireFactor === 0) return -POPULATION.STARVATION_DECAY;

  const r = POPULATION.BASE_GROWTH_RATE * fireFactor * seasonR;
  const foodFactor = getFoodFactor(state);
  if (foodFactor < 0) return -POPULATION.STARVATION_DECAY;

  return r * P * (1 - P / K) * foodFactor;
}

// ─────────────────────────────────────────────
// T2.3 资源产出
// ─────────────────────────────────────────────

export function calcJobOutput(jobId: JobId, state: E1State): number {
  const def = JOB_MAP[jobId];
  const count = state.jobs[jobId] ?? 0;
  if (count <= 0) return 0;

  const eff = aggregateEffects(state);
  const workshops = state.buildings.workshop ?? 0;
  let rate = def.outputRate * count;

  if (def.scaledByTool) {
    const workshopBonus = workshops * BUILDING_EFFECTS.WORKSHOP_BONUS;
    rate *= getToolMultiplier(eff.toolTier, workshopBonus);
  }
  if (jobId === 'gatherer') rate *= eff.gathererMultiplier;
  if (jobId === 'hunter' && eff.huntPartyThreshold > 0 && count >= eff.huntPartyThreshold) {
    rate *= 1 + eff.huntPartyBonus;
  }

  // ── E2 定居时代 ──

  // 科技给的按岗位乘数（跨时代通用）
  rate *= eff.jobMultiplier[jobId] ?? 1;

  if (eff.seasonsEnabled) {
    if (jobId === 'farmer') {
      // 田地效率：田地是农夫的工作位，农夫不够就有一部分田闲着。
      // 覆盖度 = min(上限, 农夫数 / (田数×每田工位))；没有田则不产出。
      const fields = state.buildings.field ?? 0;
      const coverage =
        fields > 0
          ? Math.min(eff.fieldEfficiencyCap, count / (fields * E2.JOBS_PER_FIELD))
          : 0;
      rate *=
        getSeasonOutputMultiplier(state.eraElapsedSec, true) * coverage * eff.fieldYieldMul;
    } else if (jobId === 'woodcutter' || jobId === 'knapper') {
      // 冬季伐木/打石 ×0.7
      rate *= getSeasonOutputMultiplier(state.eraElapsedSec, false);
    }
    // 牧人 / 织工 / 猎人：无季节波动
    if (jobId === 'herder' && getSeasonFromElapsed(state.eraElapsedSec) === 'summer') {
      rate *= eff.summerHerderMul;
    }
  }

  return rate;
}

export function calcResourceOutput(resourceId: ResourceId, state: E1State): number {
  if (resourceId === 'experience') return calcExperienceOutput(state);
  if (resourceId === 'population') return getPopulationGrowth(state);

  const eff = aggregateEffects(state);
  let total = 0;

  for (const job of JOBS) {
    if (job.output !== resourceId) continue;
    total += calcJobOutput(job.id, state);
  }

  if (resourceId === 'food') {
    total *= 1 + getFireFoodBonus(state);
    total *= eff.foodMultiplier;
  }
  if (resourceId === 'stone') total *= eff.stoneMultiplier;

  // ── E2 ──
  if (resourceId === 'grain') total *= eff.grainMultiplier;
  if (resourceId === 'livestock') total *= eff.livestockFoodMul;

  // 科技给的按资源乘数（跨时代通用）
  const perResource = eff.resourceMultiplier[resourceId];
  if (perResource !== undefined) total *= perResource;

  return total;
}

// ─────────────────────────────────────────────
// T2.4 经验产出
// ─────────────────────────────────────────────
export function calcExperienceOutput(state: E1State): number {
  const eff = aggregateEffects(state);
  return state.population * POPULATION.EXP_PER_PERSON * eff.expMultiplier;
}

// ─────────────────────────────────────────────
// 建筑
// ─────────────────────────────────────────────
export function getBuildingCost(
  buildingId: BuildingId,
  state: E1State
): Partial<Record<ResourceId, number>> {
  const def = BUILDING_MAP[buildingId];
  const owned = state.buildings[buildingId] ?? 0;
  const eff = aggregateEffects(state);
  const mult = Math.pow(def.costMultiplier, owned) * eff.buildingCostMultiplier;

  const out: Partial<Record<ResourceId, number>> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    out[res as ResourceId] = Math.ceil((amount as number) * mult);
  }
  return out;
}

export function canAffordBuilding(buildingId: BuildingId, state: E1State): boolean {
  const cost = getBuildingCost(buildingId, state);
  // 成本键可能是任意资源（E1 用木材/石头，E2 起谷物也可能进入成本表），
  // 所以这里按资源名取存量，而不是只白名单 food/wood/stone。
  for (const [res, amount] of Object.entries(cost)) {
    const owned = state[res as keyof E1State];
    if (typeof owned !== 'number' || owned < (amount as number)) return false;
  }
  return true;
}

export function isBuildingUnlocked(buildingId: BuildingId, state: E1State): boolean {
  const def = BUILDING_MAP[buildingId];
  if (!def.requires.tech) return true;
  return !!state.techs[def.requires.tech];
}

// ─────────────────────────────────────────────
// 岗位
// ─────────────────────────────────────────────
export function isJobUnlocked(jobId: JobId, state: E1State): boolean {
  const def = JOB_MAP[jobId];
  if (def.requires.tech && !state.techs[def.requires.tech]) return false;
  if (def.requires.toolTier !== undefined) {
    if (aggregateEffects(state).toolTier < def.requires.toolTier) return false;
  }
  return true;
}

export function getAssignedPopulation(state: E1State): number {
  return Object.values(state.jobs).reduce((s, n) => s + n, 0);
}

export function getIdlePopulation(state: E1State): number {
  return Math.max(0, state.population - getAssignedPopulation(state));
}

// ─────────────────────────────────────────────
// T2.5 科技树引擎
// ─────────────────────────────────────────────
export interface ResearchCheck {
  ok: boolean;
  reason?: string;
}

export function canResearch(techId: string, state: E1State): ResearchCheck {
  const def = TECH_MAP[techId];
  if (!def) return { ok: false, reason: '未知科技' };
  if (state.techs[techId]) return { ok: false, reason: '已研究' };

  for (const req of def.requires) {
    if (!state.techs[req]) {
      return { ok: false, reason: `需要「${TECH_MAP[req]?.name ?? req}」` };
    }
  }

  if (def.requiresAny && def.requiresAny.length > 0) {
    if (!def.requiresAny.some(r => state.techs[r])) {
      const names = def.requiresAny.map(r => `「${TECH_MAP[r]?.name ?? r}」`).join(' 或 ');
      return { ok: false, reason: `需走通任一条分支：${names}` };
    }
  }

  if (state.experience < def.cost) {
    return { ok: false, reason: `经验不足（还差 ${Math.ceil(def.cost - state.experience)}）` };
  }

  return { ok: true };
}

/** 前置是否满足（不论经验够不够）—— 用于"可研究"高亮 */
export function isTechAvailable(techId: string, state: E1State): boolean {
  const def = TECH_MAP[techId];
  if (!def || state.techs[techId]) return false;
  for (const req of def.requires) {
    if (!state.techs[req]) return false;
  }
  if (def.requiresAny && def.requiresAny.length > 0) {
    if (!def.requiresAny.some(r => state.techs[r])) return false;
  }
  return true;
}

export function countResearched(state: E1State): number {
  return Object.values(state.techs).filter(Boolean).length;
}

// ─────────────────────────────────────────────
// T3.3 时代跃迁
// ─────────────────────────────────────────────
export interface AdvanceCheck {
  ok: boolean;
  items: { label: string; done: boolean; detail: string }[];
}

export function checkAdvance(state: E1State): AdvanceCheck {
  // 条件从时代配置表读取，不再硬编码 ——
  // 否则加入 E2 之后永远只检查 E1 的条件，到了 E2 就无法再跃迁到 E3
  const meta = ERAS[state.era];
  const { gateTech, advanceConditions: cond } = meta;
  const gateName = TECH_MAP[gateTech]?.name ?? gateTech;

  // ── 时代的「主粮」与「住所」在不同时代是不同字段 ──
  //
  //   E1 人口吃 food，住所是 house
  //   E2 人口改吃 grain（0.25/秒/人），住所由「住所 → 村落民居」升级为 village_house
  //
  // 不做这个映射，定居时代的跃迁检查会永远输出
  // 「食物储备 0/800」「建成住所 0/5」—— 因为这两个字段在 E2 根本不是主资源。
  // 玩家即便把 E2 玩到极致也永远无法跃迁，是硬阻断。
  //
  // ⚠️ ERAS.E1/E2 的 advanceConditions 数值本身仍是**占位值**（见 era.ts 注释），
  //    这里只修正"读哪个字段"，不动数值，配平定稿后仍需校准。
  //    E3 及以后若引入新的主粮 / 住所体系，需要在这里继续扩展映射。
  const settled = state.era !== 'E1';
  const staple = settled ? state.grain : state.food;
  const housing = settled ? (state.buildings.village_house ?? 0) : (state.buildings.house ?? 0);
  const stapleLabel = settled ? '谷物储备' : '食物储备';
  const housingLabel = settled ? '村落民居' : '住所';

  const items: AdvanceCheck['items'] = [
    {
      label: `研究「${gateName}」`,
      done: !!state.techs[gateTech],
      detail: state.techs[gateTech] ? '已完成' : '尚未研究',
    },
  ];

  // ── 时间条件（E2 独有）──
  //
  // 「完整度过 ≥N 个冬季」是 E2 的毕业考试：核心机制是周期，所以条件也必须
  // 是周期性的 —— 否则玩家靠一次暴收就能攒够粮，却没有证明自己能重复这个周期。
  // 见 design/game/eras/E2-sedentary.md §11.8。
  if (cond.minYears !== undefined) {
    const years = Math.floor(state.eraElapsedSec / YEAR_DURATION_SEC);
    const need = cond.minYears * YEAR_DURATION_SEC;
    items.push({
      label: `完整度过 ≥ ${cond.minYears} 个冬季`,
      done: state.eraElapsedSec >= need,
      detail: `${years} / ${cond.minYears} 年（${Math.floor(state.eraElapsedSec / 60)} / ${need / 60} 分钟）`,
    });
  }

  // ── 资源与人口 ──
  if (cond.minFood !== undefined) {
    items.push({
      label: `${stapleLabel} ≥ ${cond.minFood}`,
      done: staple >= cond.minFood,
      detail: `${Math.floor(staple)} / ${cond.minFood}`,
    });
  }

  // ── 建筑门槛 ──
  if (cond.minHouses !== undefined) {
    items.push({
      label: `建成 ${cond.minHouses} 座${housingLabel}`,
      done: housing >= cond.minHouses,
      detail: `${housing} / ${cond.minHouses}`,
    });
  }
  for (const [buildingId, count] of Object.entries(cond.minBuildings ?? {})) {
    const owned = state.buildings[buildingId] ?? 0;
    const name = (BUILDING_MAP as Record<string, { name: string } | undefined>)[buildingId]?.name ?? buildingId;
    items.push({
      label: `建成 ${count} 座${name}`,
      done: owned >= count,
      detail: `${owned} / ${count}`,
    });
  }

  if (cond.minPopulation !== undefined) {
    items.push({
      label: `人口 ≥ ${cond.minPopulation}`,
      done: state.population >= cond.minPopulation,
      detail: `${Math.floor(state.population)} / ${cond.minPopulation}`,
    });
  }

  return { ok: items.every(i => i.done), items };
}

// ─────────────────────────────────────────────
// 资源上限
// ─────────────────────────────────────────────
export function getResourceStorage(resourceId: ResourceId, state: E1State): number {
  const eff = aggregateEffects(state);
  switch (resourceId) {
    case 'food':
      // 首轮实测 500 太早撞上限（10 分钟就满），浪费产出
      return 1000 * eff.foodStorageMultiplier;
    case 'wood':
      // 基础建材容量 = 基础上限 500 + Σ粮仓 ×300（「存储建筑双扩容」，见 storage-plan.md §4）
      // 粮仓是 E2 建筑，E1 拿不到（受时代 + 科技双重门禁），因此本条对 E1 无影响。
      return 500 + (state.buildings.granary ?? 0) * E2.GRANARY_WOOD_BONUS;
    case 'stone':
      return 500 + (state.buildings.granary ?? 0) * E2.GRANARY_STONE_BONUS;
    case 'grain': {
      // 谷物容量 = (400 + Σ粮仓×单仓容量) × (1 + 陶窑加成×min(陶窑数,3) + 陶罐储藏加成)
      // 「谷仓通风系统」再按溢出阈值放宽容量的 20%。
      const granaries = state.buildings.granary ?? 0;
      const kilns = state.buildings.kiln ?? 0;
      const jarStorageBonus = eff.granaryCapacityMul - 1;
      const base = getGranaryCapacity(
        granaries,
        kilns,
        jarStorageBonus,
        eff.granaryPerUnit > 0 ? eff.granaryPerUnit : undefined,
        eff.kilnBonus > 0 ? eff.kilnBonus : undefined
      );
      return base * (1 + eff.granaryOverflowBonus);
    }
    // 牲畜是活体储备，不占粮仓容量；织物同理
    default:
      return Number.POSITIVE_INFINITY;
  }
}

// ─────────────────────────────────────────────
// T4.6 卡点提示
// ─────────────────────────────────────────────
export function getBottleneck(state: E1State): string | null {
  const eff = aggregateEffects(state);
  if (!eff.fireEnabled) return null;

  // ── E2 定居时代：压力从「火种」换成「季节 + 谷仓」 ──
  // 火源在本时代恒定、无需维护，因此不再作为卡点提示（否则会一直误报"火源太弱"）
  if (eff.seasonsEnabled) {
    if (getFoodFactor(state) <= 0) {
      return '谷仓告急 —— 秋季派更多人下田，或宰杀牲畜换粮';
    }
    if (getPopulationGrowth(state) <= 0.001 && state.population >= getCapacity(state) - 0.5) {
      const farmers = state.jobs.farmer ?? 0;
      const fields = state.buildings.field ?? 0;
      if (fields > 0 && farmers < fields * E2.JOBS_PER_FIELD) {
        return '田地缺人耕作 —— 每块田需至少 2 名农夫才计入承载力';
      }
      return '住处不足 —— 建造村落民居，或开垦更多田地提升人口上限';
    }
    return null;
  }

  // ── E1 远古时代：火源 → 人口上限 → 食物 ──
  if (getFireFactor(state) <= 0.5) {
    return '火源太弱 —— 派更多人去伐木，或手动投入木材';
  }
  if (getPopulationGrowth(state) <= 0.001 && state.population >= getCapacity(state) - 0.5) {
    return '房屋不足 —— 建造更多住所提升人口上限';
  }
  if (getFoodFactor(state) <= 0) {
    return '食物短缺 —— 派更多人去采集或狩猎';
  }
  return null;
}

// ─────────────────────────────────────────────
// 批量推进（fastLoop 调用）
// ─────────────────────────────────────────────
export interface TickResult {
  food: number;
  wood: number;
  stone: number;
  experience: number;
  population: number;
  populationProgress: number;
  fire: number;
  // ── E2 定居时代 ──
  grain: number;
  livestock: number;
  fabric: number;
  eraElapsedSec: number;
}

export function tick(state: E1State, dt: number): TickResult {
  const eff = aggregateEffects(state);

  // 本时代已经过的秒数——季节循环的驱动源
  const eraElapsedSec = (state.eraElapsedSec ?? 0) + dt;

  // 1) 产出
  const foodGain = calcResourceOutput('food', state) * dt;
  const woodGain = calcResourceOutput('wood', state) * dt;
  const stoneGain = calcResourceOutput('stone', state) * dt;
  const expGain = calcExperienceOutput(state) * dt;

  let wood = Math.min(state.wood + woodGain, getResourceStorage('wood', state));
  const stone = Math.min(state.stone + stoneGain, getResourceStorage('stone', state));
  const experience = state.experience + expGain;

  // 2) 火种（自动维持消耗木材）
  const fireResult = tickFire({ ...state, wood }, dt);
  wood = fireResult.wood;
  const fire = fireResult.fire;

  // 3) 人口：**整数增长**
  //
  // 为什么不能直接保留小数人口：
  //   逻辑斯蒂曲线是渐近逼近上限的（P 越接近 K 增长越慢），
  //   人口会永远停在 K−ε（实测 K=4 时停在 3.9999…）。
  //   而岗位分配用 Math.floor(人口) 计算可分配数，于是满员时
  //   最后一个位置永远排不上人 —— 这是玩家能直接感知的 bug。
  //
  // 方案：人口保持整数，小数增长累积进 populationProgress，满 1 才 +1 人。
  const K = getCapacity(state);
  const growth = getPopulationGrowth(state);
  // Math.floor 兜底：旧存档可能存了小数人口（修复前遗留），
  // 这里强制归整，保证人口始终是整数
  let population = Math.floor(state.population);
  let progress = state.populationProgress ?? 0;

  progress += growth * dt;

  if (growth >= 0) {
    while (progress >= 1 && population < K) {
      population += 1;
      progress -= 1;
    }
    // 已满员：不再累积（否则进度会虚假增长）
    if (population >= K) progress = 0;
  } else {
    // 负增长（饥荒/火灭）：进度向负方向累积，满 −1 减 1 人
    while (progress <= -1 && population > 0) {
      population -= 1;
      progress += 1;
    }
    if (population <= 0) progress = 0;
  }

  const consumption = population * POPULATION.FOOD_CONSUMPTION_PER_PERSON * dt;

  let food = state.food + foodGain - consumption;
  food = Math.max(0, Math.min(food, getResourceStorage('food', state)));

  // ─────────────────────────────────────────────
  // 4) E2 定居时代：谷物 / 牲畜 / 织物
  // ─────────────────────────────────────────────
  //
  // 谷物是定居时代的主粮，且有**硬容量**（粮仓）——这是「秋天必须攒够」
  // 这个核心玩法的落地点：产出集中在秋季，但仓库装不下就只能眼看着烂掉。
  let grain = state.grain ?? 0;
  let livestock = state.livestock ?? 0;
  let fabric = state.fabric ?? 0;

  if (eff.seasonsEnabled) {
    const grainGain = calcResourceOutput('grain', state) * dt;
    const livestockGain = calcResourceOutput('livestock', state) * dt;
    const fabricGain = calcResourceOutput('fabric', state) * dt;

    // 牲畜先按畜栏存栏上限封顶（畜栏 = 活体库存的"仓库"）
    const pens = state.buildings.animal_pen ?? 0;
    const penCap = pens * (E2.PEN_CAPACITY + eff.penCapacityAdd);
    livestock = Math.min(livestock + livestockGain, penCap);

    // 人吃谷物；牲畜吃饲料（「畜力与厩肥」可降饲料成本）
    const grainConsumption =
      population * E2.GRAIN_PER_PERSON_SEC * dt +
      livestock * E2.FEED_PER_LIVESTOCK_SEC * eff.feedCostMultiplier * dt;

    grain = grain + grainGain - grainConsumption;

    // 谷物见底 → 牲畜闹饥荒。
    // 默认（无兽医知识）存活率为 0，即"饥荒牲畜死亡率 100%"；
    // 「兽医知识」把它提到 50%。注意这里只损失牲畜，不损失人口与科技。
    if (grain < 0) {
      grain = 0;
      const loss = 1 - eff.livestockFamineSurvival;
      if (loss > 0) livestock = Math.max(0, livestock * (1 - loss));
    }

    grain = Math.min(grain, getResourceStorage('grain', state));
    fabric = Math.max(0, fabric + fabricGain);
  }

  return {
    food,
    wood,
    stone,
    experience,
    population,
    populationProgress: progress,
    fire,
    grain,
    livestock,
    fabric,
    eraElapsedSec,
  };
}

export { JOBS, TECHS, TECH_MAP, BUILDING_MAP };
export type { JobId, BuildingId, ResourceId };
