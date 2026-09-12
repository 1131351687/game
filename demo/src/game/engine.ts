// 游戏引擎（多时代）
// 只做纯计算；状态变更由 store 负责
// 数值来源：design/game/02-tech-eras.md 第 11 节 + 各时代设计文档

import { TECHS, TECH_MAP, type TechEffects } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDING_MAP, type BuildingId } from '../data/buildings';
import { RESOURCE_MAP, type ResourceId } from '../data/resources';
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
import { settleTradeCycle } from './trade';
import {
  FIRE,
  FIRE_TIER_INFO,
  POPULATION,
  FOOD_FACTOR,
  BUILDING_EFFECTS,
  E2,
  E3,
  HUNT,
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

  // 注：谷物（grain）曾是与食物并列的主粮资源，2026-09-12 用户拍板
  // 「暂时不区分采集所得与农耕收获」，两资源已**合并为单一「食物」**。
  // 粮仓体系（容量 / 陶窑加成 / 通风）保留，作用对象改为食物上限。
  /** 活体牲畜：既是储备也是畜力，**不占储存容量** */
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

  // ─────────────────────────────────────────────
  // E3 城邦时代（核心科技：楔形文字）
  //
  // ⚠️ 研究货币：用户拍板「改名即可」——E3 继续使用 experience 字段，
  //    显示名变为「知识」（researchCurrencyName），产出通道改为书吏。
  //    不新增独立 knowledge 字段。
  // ─────────────────────────────────────────────

  /** 铜：青铜原料之一；仅本地矿藏为铜矿时可采 */
  copper: number;
  /** 锡：本地产出恒为 0（设计约束），只能贸易进口 */
  tin: number;
  /** 青铜：冶炼工以铜+锡炼出 */
  bronze: number;
  /** 青金石：远方贸易品（需「青金石商路」解锁） */
  lapis: number;

  /** 已刻录科技 id（槽位占用 = recorded.length；刻录不可撤销） */
  recorded: string[];
  /** 历史上刻录过的科技 id（供档案库加成计数，与技术退役解耦） */
  recordedOnce: string[];

  /** 本地矿藏：决定铜/锡自给（开局随机，用户拍板） */
  localOre: 'copper' | 'tin' | 'alluvial';
  /** 已建立的贸易路线 */
  tradeRoutes: TradeRoute[];
  /** 声望 0–100，初始 50 */
  reputation: number;
}

/**
 * 一条贸易路线（虚拟邻邦）。
 * 数据定义见 game/trade.ts（固定 5 个邻邦）。
 */
export interface TradeRoute {
  /** 邻邦 id */
  partnerId: string;
  /** 我方支付的货物 */
  demand: ResourceId;
  /** 我方换得的货物 */
  supply: ResourceId;
  /** 距离（1/2/3），距离系数 = 1 + 0.15 × 距离 */
  distance: 1 | 2 | 3;
  /** 商队周期计时（30 秒一轮） */
  cycleAccum: number;
  /** 近 5 周期价格（供迷你折线图与需求冲击计算） */
  priceHistory: number[];
  /** 契约锁价截止时间戳（秒，绝对时间） */
  contractUntil?: number;
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

  // ─────────────────────────────────────────────
  // E3 城邦时代（核心科技：楔形文字）
  // ─────────────────────────────────────────────

  /** 记录/刻录系统是否开启 */
  recordingEnabled: boolean;
  /** 记录容量加成（加法键：泥板制作 +2） */
  recordCapacityAdd: number;
  /** 书吏产出乘数 */
  scribeOutputMul: number;
  /** 档案库加成：每项已刻录科技的产出加成（取最大，0.03 → 扩建 0.04） */
  archiveBonus: number;

  /** 每条路线所需书吏（绝对设置：40 → 账目分类 30） */
  scribesPerRoute: number;
  /** 路线槽位加成（商栈 +2/座 计入独立公式） */
  routeSlotsAdd: number;
  /** 换算损耗（未研究度量衡 0.15；度量衡 → 0；取最小） */
  conversionLoss: number;
  /** 契约违约惩罚倍率（印章封泥 0.5） */
  contractBreachPenalty: number;
  /** 契约时长倍率（契约刻录 ×2.4） */
  contractDurationMul: number;
  /** 可同时锁定契约的路线数（取最大） */
  contractSlots: number;
  /** 陆路运力乘数（轮子 1.4 / 驴队 1.3 叠加） */
  landCaravanMul: number;
  /** 水路距离系数乘数（河运帆船 0.6） */
  waterDistMul: number;
  /** 路线中断概率加成（<0 降低） */
  routeBreakChance: number;
  /** 是否解锁青金石货类 */
  lapisEnabled: boolean;

  /** 青铜回收率（再生冶炼 0.3） */
  recyclingRate: number;
  /** 文明级损失事件减幅（青铜兵器 0.4） */
  lossReduction: number;
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

  // ── E3 城邦时代 ──
  recordingEnabled: false,
  recordCapacityAdd: 0,
  scribeOutputMul: 1,
  archiveBonus: 0,
  scribesPerRoute: 40,
  routeSlotsAdd: 0,
  conversionLoss: 0.15,
  contractBreachPenalty: 1,
  contractDurationMul: 1,
  contractSlots: 1,
  landCaravanMul: 1,
  waterDistMul: 1,
  routeBreakChance: 0,
  lapisEnabled: false,
  recyclingRate: 0,
  lossReduction: 0,
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

    // ── E3 刻录口径：口头 ×50% / 已刻录 ×100% ──
    //
    // 记录系统开启后（E3 研究「楔形文字」），**未刻录**的科技效果打对折——
    // 知识靠口耳相传会衰减，刻上泥板才是"文明的确定沉淀"。
    // 只对**数值型**效果生效；解锁/布尔型不衰减（"已掌握的东西不会忘记"）。
    //
    // ⚠️ 时代门控：E1/E2 没有记录系统（recorded 恒空、recordingEnabled=false），
    // 此处必须零影响，否则 E1/E2 基线（1163s/1920s）会被整体腰斩。
    const isOral = acc.recordingEnabled && !state.recorded.includes(tech.id);
    const oralMul = isOral ? 0.5 : 1;
    /** 乘数衰减 × 刻录口径：口头再 ×0.5 */
    const mulR = (m: number): number => mul(m) * oralMul;
    /** 加数衰减 × 刻录口径 */
    const addR = (v: number): number => add(v) * oralMul;

    // — 解锁/布尔型：不衰减 —
    if (e.enableFire) acc.fireEnabled = true;
    if (e.activeFireRestore) acc.activeFireRestore = true;
    if (e.removeWeakFoodPenalty) acc.removeWeakFoodPenalty = true;
    if (e.setToolTier !== undefined) acc.toolTier = Math.max(acc.toolTier, e.setToolTier);
    if (e.huntPartyThreshold) acc.huntPartyThreshold = e.huntPartyThreshold;
    if (e.enableAdvance) acc.enableAdvance = true;

    // — 数值型：按时代衰减 —
    if (e.fireDecayMultiplier !== undefined) acc.fireDecayMultiplier *= mulR(e.fireDecayMultiplier);
    if (e.fireMaxBonus) acc.fireMaxBonus += addR(e.fireMaxBonus);
    if (e.foodMultiplier) acc.foodMultiplier *= mulR(e.foodMultiplier);
    if (e.stoneMultiplier) acc.stoneMultiplier *= mulR(e.stoneMultiplier);
    if (e.expMultiplier) acc.expMultiplier *= mulR(e.expMultiplier);
    if (e.gathererMultiplier) acc.gathererMultiplier *= mulR(e.gathererMultiplier);
    if (e.buildingCostMultiplier) acc.buildingCostMultiplier *= mulR(e.buildingCostMultiplier);
    if (e.stabilityBonus) acc.stabilityBonus += addR(e.stabilityBonus);
    if (e.huntPartyBonus) acc.huntPartyBonus = addR(e.huntPartyBonus);
    if (e.foodStorageMultiplier) acc.foodStorageMultiplier *= mulR(e.foodStorageMultiplier);

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
    if (e.springAgriMul) acc.seasonAgriBonus.spring += addR(e.springAgriMul);
    if (e.summerAgriMul) acc.seasonAgriBonus.summer += addR(e.summerAgriMul);
    if (e.autumnAgriMul) acc.seasonAgriBonus.autumn += addR(e.autumnAgriMul);
    if (e.winterAgriMul) acc.seasonAgriBonus.winter += addR(e.winterAgriMul);

    // — E2 乘法键：按时代衰减 —
    if (e.grainMultiplier) acc.grainMultiplier *= mulR(e.grainMultiplier);
    if (e.livestockFoodMul) acc.livestockFoodMul *= mulR(e.livestockFoodMul);
    if (e.summerHerderMul) acc.summerHerderMul *= mulR(e.summerHerderMul);
    if (e.fieldYieldMul) acc.fieldYieldMul *= mulR(e.fieldYieldMul);
    if (e.feedCostMultiplier) acc.feedCostMultiplier *= mulR(e.feedCostMultiplier);
    if (e.villageHouseCostMul) acc.villageHouseCostMul *= mulR(e.villageHouseCostMul);
    if (e.granaryCapacityMul) acc.granaryCapacityMul *= mulR(e.granaryCapacityMul);
    if (e.jobSwitchCostMul) acc.jobSwitchCostMul *= mulR(e.jobSwitchCostMul);

    // — E2 加法键：按时代衰减 —
    if (e.penCapacityAdd) acc.penCapacityAdd += addR(e.penCapacityAdd);
    if (e.granaryOverflowBonus) acc.granaryOverflowBonus += addR(e.granaryOverflowBonus);

    // — E2 按岗位 / 按资源的乘数 —
    if (e.jobMultiplier) {
      for (const [job, m] of Object.entries(e.jobMultiplier)) {
        if (m === undefined) continue;
        const id = job as JobId;
        acc.jobMultiplier[id] = (acc.jobMultiplier[id] ?? 1) * mulR(m);
      }
    }
    if (e.resourceMultiplier) {
      for (const [res, m] of Object.entries(e.resourceMultiplier)) {
        if (m === undefined) continue;
        const id = res as ResourceId;
        acc.resourceMultiplier[id] = (acc.resourceMultiplier[id] ?? 1) * mulR(m);
      }
    }

    // ── E3 布尔/解锁型：不衰减 ──
    if (e.enableRecording) acc.recordingEnabled = true;
    if (e.enableLapis) acc.lapisEnabled = true;

    // ── E3 乘法键：按时代衰减 ──
    if (e.scribeOutputMul) acc.scribeOutputMul *= mulR(e.scribeOutputMul);
    if (e.contractBreachPenalty) acc.contractBreachPenalty *= mulR(e.contractBreachPenalty);
    if (e.contractDurationMul) acc.contractDurationMul *= mulR(e.contractDurationMul);
    if (e.landCaravanMul) acc.landCaravanMul *= mulR(e.landCaravanMul);
    if (e.waterDistMul) acc.waterDistMul *= mulR(e.waterDistMul);

    // ── E3 加法键：按时代衰减 ──
    if (e.recordCapacityAdd) acc.recordCapacityAdd += addR(e.recordCapacityAdd);
    if (e.routeSlotsAdd) acc.routeSlotsAdd += addR(e.routeSlotsAdd);
    if (e.routeBreakChance) acc.routeBreakChance += addR(e.routeBreakChance);

    // ── E3 绝对设置型：取最大 / 最小，不衰减 ──
    //   能力上限（档案加成 / 契约槽 / 回收率）取最大；
    //   换算损耗是"缺陷消除"，取最小（度量衡把它压到 0）。
    if (e.archiveBonus !== undefined) acc.archiveBonus = Math.max(acc.archiveBonus, e.archiveBonus);
    if (e.scribesPerRoute !== undefined) {
      acc.scribesPerRoute = Math.min(acc.scribesPerRoute, e.scribesPerRoute);
    }
    if (e.contractSlots !== undefined) {
      acc.contractSlots = Math.max(acc.contractSlots, e.contractSlots);
    }
    if (e.recyclingRate !== undefined) {
      acc.recyclingRate = Math.max(acc.recyclingRate, e.recyclingRate);
    }
    if (e.lossReduction !== undefined) {
      acc.lossReduction = Math.max(acc.lossReduction, e.lossReduction);
    }
    if (e.conversionLoss !== undefined) {
      acc.conversionLoss = Math.min(acc.conversionLoss, e.conversionLoss);
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

  // ── E3 城邦时代：人口模型切换 ──
  // K = 320 基础 + 民居×130（E3-citystate.md §11.3）。
  // 旧时代住所/田地在此之上继续叠加——跃迁不重置，K 必须连续。
  if (state.era === 'E3') {
    const cityHouses = state.buildings.city_house ?? 0;
    return (
      E3.POP_BASE_CAPACITY +
      cityHouses * E3.POP_PER_CITY_HOUSE +
      houses * POPULATION.CAPACITY_PER_HOUSE +
      villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
      Math.min(fields, Math.floor(farmers / E2.FIELD_MIN_FARMERS)) * E2.CAPACITY_PER_FIELD
    );
  }

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
  // E3 人口消耗 0.2/秒/人（与 E1 相同；E2 为 0.25 因定居后更集中）
  const perPerson = state.era === 'E3' ? E3.POP_FOOD_PER_PERSON : POPULATION.FOOD_CONSUMPTION_PER_PERSON;
  return state.population * perPerson;
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
    // 定居时代：人均**存量**决定食物因子（原按谷物，现按合并后的食物）
    const perPerson = state.population > 0 ? state.food / state.population : state.food;
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

  // ── E3 城邦时代：人口模型切换 ──
  // E3 基础增长率从 0.03 下调到 0.003（更慢的增长配合更低的资源门槛）。
  // 贸易繁荣 / 农业底线三因子首版留为 TODO(balance)：先用 1.0。
  if (state.era === 'E3') {
    const r0 = E3.POP_GROWTH_RATE * fireFactor * seasonR;
    const foodFactor = getFoodFactor(state);
    if (foodFactor < 0) return -POPULATION.STARVATION_DECAY;
    return r0 * P * (1 - P / K) * foodFactor;
  }

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

  // 猎人：猎场承载力模型 —— 总产出按饱和曲线收敛，替代「单人产出 × 人数」的线性公式。
  // 场地能养活的猎物有上限（HUNT.CAP），猎人越多边际产出越低。
  // 见 data/constants.ts 的 HUNT 注释。工具世代与集体围猎加成仍在下方叠加。
  let rate =
    jobId === 'hunter'
      ? HUNT.CAP * (1 - Math.exp(-count / HUNT.TAU))
      : def.outputRate * count;

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

  // ── E3 城邦时代：规模递减（N^0.9）──
  //
  // 设计文档 §11：E3 起「实际产能 = 单位产出 × N^0.9」。
  // 直觉：同一种岗位堆得越多，人均产出越低（组织/土地/原料的边际递减）。
  // 必须**时代门控**——E1/E2 的产出公式字面上不变（回归基线 1163s/1920s 依赖它）。
  // ⚠️ 猎人已有饱和曲线（HUNT.CAP），此处不再叠加 N^0.9（双重非线性失真）。
  // ⚠️ 2026-09-12 修正：设计公式是「实际产能 = 单位产出 × N^0.9」（次线性），
  // 原实现 rate = outputRate × count 之后再 ×count^0.9 = outputRate × N^1.9（超线性），
  // 产能随人数爆炸（百人规模虚高约百倍）。此处**替换**线性基数，而不是叠加。
  if (state.era === 'E3' && jobId !== 'hunter') {
    rate = def.outputRate * Math.pow(count, E3.SCALING_EXP);
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
  // 「食物总产出 ×N」类科技（原 grainMultiplier，谷物合并前的作用对象）
  // 现在作用于合并后的食物产出——采集/狩猎/农耕一视同仁。
  if (resourceId === 'food') total *= eff.grainMultiplier;
  if (resourceId === 'livestock') total *= eff.livestockFoodMul;

  // 科技给的按资源乘数（跨时代通用）
  const perResource = eff.resourceMultiplier[resourceId];
  if (perResource !== undefined) total *= perResource;

  return total;
}

// ─────────────────────────────────────────────
// T2.4 研究货币产出（经验 ⚡ / 知识 📜 同一字段）
// ─────────────────────────────────────────────
/**
 * 研究货币（experience 字段）的产出速率。
 *
 * - E1/E2：人口 × EXP_PER_PERSON（0.08/人/秒）—— **逐字节不变**
 * - E3 起：由**书吏**产出（0.15/秒/人 × 书吏训练/六十进制加成 × 档案库加成）。
 *   设计明确 E3 关闭"人口生经验"通道（用户拍板：字段改名「知识」，不新增字段）。
 *
 * 按时代门控：E1/E2 走旧路径，E3 走书吏路径。
 */
export function calcExperienceOutput(state: E1State): number {
  const eff = aggregateEffects(state);

  if (state.era === 'E3') {
    const scribes = state.jobs.scribe ?? 0;
    if (scribes <= 0) return 0;
    // 书吏其实力受「记录容量」约束：无空槽则无产出（尚未拍板，先不实现）
    // 档案库加成：已刻录科技每项 +0.03（扩建后 0.04），与刻录本身解耦
    const archiveBonus = 1 + eff.archiveBonus * state.recordedOnce.length;
    // 规模递减（E3-citystate.md §11.6）：知识同样吃 N^0.9 ——
    //   305 人书吏 → 305^0.9 ≈ 172 等效 → 25.8 知识/秒
    //   425 人书吏 → 425^0.9 ≈ 238 等效 → 35.7 知识/秒
    // 之前漏算这条（纯线性），导致后期知识通胀、E3 科技成本形同虚设。
    const effective = Math.pow(scribes, E3.SCALING_EXP);
    return effective * 0.15 * eff.scribeOutputMul * archiveBonus;
  }

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
/**
 * 某岗位的工位上限（不限工位的岗位返回 Infinity）。
 *
 * 为什么需要它：岗位进阶**不能把人送进没有工位的地方**。
 * 农夫受「田地 ×3」限制、牧人受「畜栏 ×3」限制——
 * 若农业刚研究完就把采集者全转成农夫，而田地还没建，
 * 这些农夫产出为 0，玩家会在毫无预警的情况下断粮。
 */
export function getJobSlotCapacity(jobId: JobId, state: E1State): number {
  switch (jobId) {
    case 'farmer':
      return (state.buildings.field ?? 0) * E2.JOBS_PER_FIELD;
    case 'herder':
      return (state.buildings.animal_pen ?? 0) * E2.JOBS_PER_PEN;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * 一次岗位进阶是否可以发生。
 *
 * **判定只看时代**（2026-09-12 用户拍板）：
 *   「进入农耕（定居）时代后，采集者自动进阶为农夫」——
 *   因此规则是"目标岗位所属的时代已经到来"，而不是"目标岗位已解锁"。
 *
 * 为什么之前不是这样（历史记录，避免以后又改回去）：
 *   上一版要求 `isJobUnlocked(目标岗位)`（即「农业」科技已研究）**且有空工位**，
 *   理由是"农业刚研究完就把采集者全变成没田可种的农夫会当场断粮"。
 *   但那样一来，玩家在界面上几乎看不到这个机制（农业还没研究时一句提示都没有），
 *   而且进阶的时点被推迟到"研究完农业 + 建好田地"，与"时代推进带来职业专职化"
 *   的设计意图不符。用户明确要"进城农耕时代就转"，故改为按时代判定。
 *
 * 代价与补偿：无田地时农夫**产出为 0**，因此时代入口会给出明确警告
 * （见 store.advanceEra 的消息），岗位面板也会提示"需先建田地/研究农业"。
 */
export function canUpgradeJob(state: E1State, from: JobId): JobId | null {
  const up = JOB_MAP[from].upgradesTo;
  if (!up) return null;
  if ((state.jobs[from] ?? 0) <= 0) return null;
  // 目标岗位所属时代已到来即可进阶
  if (eraDistance(JOB_MAP[up.job].era, state.era) < 0) return null;
  return up.job;
}

/**
 * 推进一次岗位进阶（每 tick 调用；每次最多转换 1 人）。
 *
 * 为什么每 tick 只转 1 人而不是一次转完：
 * 逐人转换让"职业逐渐专职化"这件事在界面上看得见。
 * 时代入口处会先做一次**批量转换**（见 applyJobUpgradeAll），
 * 所以这里主要处理"玩家在此之后又把某人派回采集者"的情况。
 *
 * 返回新的岗位表与本次转换信息；无进阶可做时返回 null（调用方应保持原对象）。
 */
export function applyJobUpgrade(
  state: E1State
): { jobs: Record<string, number>; from: JobId; to: JobId } | null {
  for (const def of JOBS) {
    const to = canUpgradeJob(state, def.id);
    if (!to) continue;
    const jobs = { ...state.jobs };
    jobs[def.id] = (state.jobs[def.id] ?? 0) - 1;
    jobs[to] = (state.jobs[to] ?? 0) + 1;
    return { jobs, from: def.id, to };
  }
  return null;
}

/**
 * 一次性完成所有可进行的进阶（时代入口调用）。
 *
 * 时代入口用批量而不是逐 tick：玩家跨过时代边界的那一刻，
 * "我的采集者成了农夫"应当是**一个事件**，而不是几秒钟内陆续发生。
 */
export function applyJobUpgradeAll(
  state: E1State
): { jobs: Record<string, number>; moved: Array<{ from: JobId; to: JobId; count: number }> } | null {
  const jobs = { ...state.jobs };
  const moved: Array<{ from: JobId; to: JobId; count: number }> = [];

  for (const def of JOBS) {
    const to = canUpgradeJob({ ...state, jobs }, def.id);
    if (!to) continue;
    const count = jobs[def.id] ?? 0;
    jobs[def.id] = 0;
    jobs[to] = (jobs[to] ?? 0) + count;
    moved.push({ from: def.id, to, count });
  }

  return moved.length > 0 ? { jobs, moved } : null;
}

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
  // 主粮：采集与农耕所得已合并为「食物」，两个时代都读同一个字段
  const staple = state.food;
  // 住所：住所（E1）与村落民居（E2）都提供承载力，跃迁后**两者并存**，
  // 所以门槛也要合计——否则玩家建了满村新民居，门槛却只数其中一种。
  const housing = (state.buildings.house ?? 0) + (state.buildings.village_house ?? 0);
  const stapleLabel = '食物储备';
  const housingLabel = settled ? '住所/村落民居' : '住所';

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
      detail: `${years} / ${cond.minYears} 年`,
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

  // ── E3 已刻录科技门槛（记录系统）──
  //
  // 「已刻录」是 E3 的核心矛盾：研究可以靠知识，但刻录要占槽位、
  // 付刻录费，且不可撤销。用「刻了多少」而不是「研究了多少」做毕业条件，
  // 逼玩家为知识做"确定性沉淀"——这正是"文明"的题中之义。
  if (cond.minRecorded !== undefined) {
    const recorded = state.recorded.length;
    items.push({
      label: `已刻录科技 ≥ ${cond.minRecorded} 项`,
      done: recorded >= cond.minRecorded,
      detail: `${recorded} / ${cond.minRecorded}`,
    });
  }

  // ── 资源存量门槛（E3：青铜 ≥ 2000）──
  // 通用字段：资源 id → 最低存量。E3 用它表达"青铜库存证明工业能力"。
  for (const [resId, amount] of Object.entries(cond.minResources ?? {})) {
    const value = state[resId as keyof E1State];
    const numeric = typeof value === 'number' ? value : 0;
    const resName = (RESOURCE_MAP as Record<string, { name: string } | undefined>)[resId]?.name ?? resId;
    items.push({
      label: `${resName} ≥ ${amount}`,
      done: numeric >= amount,
      detail: `${Math.floor(numeric)} / ${amount}`,
    });
  }

  // ── E3 特殊条件：钢铁必须已刻录 ──
  // devplan §7.2：跃迁六项条件中的第一项是「研究「钢铁」并完成刻录」。
  // 刻录是刻录系统本身的要求（铁门槛刻录需 1 槽），这里额外校验以防漏刻。
  if (state.era === 'E3' && state.techs.iron && !state.recorded.includes('iron')) {
    items.push({
      label: '钢铁刻录',
      done: false,
      detail: '已研究钢铁，但尚未刻录到泥板上',
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
    case 'food': {
      // 首轮实测 500 太早撞上限（10 分钟就满），浪费产出
      const base = 1000 * eff.foodStorageMultiplier;
      // 定居时代：粮仓体系并入食物上限（谷物合并后的结果）
      //
      // 原公式（独立谷物资源时）：(400 + Σ粮仓×单仓容量) × (1 + 陶窑加成 + 陶罐储藏) × (1 + 通风)
      // 现在这两种粮是一种，所以容量**相加**：
      //   E1 的储存技术（烟熏 ×2）继续生效，粮仓/陶窑/陶罐再加一层。
      // E1 没有季节循环（seasonsEnabled=false）→ 直接返回 base，逐字节不变。
      if (!eff.seasonsEnabled) return base;
      const granaries = state.buildings.granary ?? 0;
      const kilns = state.buildings.kiln ?? 0;
      const jarStorageBonus = eff.granaryCapacityMul - 1;
      const granaryCap = getGranaryCapacity(
        granaries,
        kilns,
        jarStorageBonus,
        eff.granaryPerUnit > 0 ? eff.granaryPerUnit : undefined,
        eff.kilnBonus > 0 ? eff.kilnBonus : undefined
      );
      return base + granaryCap * (1 + eff.granaryOverflowBonus);
    }
    case 'wood':
      // 基础建材容量 = 基础上限 500 + Σ粮仓 ×300（「存储建筑双扩容」，见 storage-plan.md §4）
      // 粮仓是 E2 建筑，E1 拿不到（受时代 + 科技双重门禁），因此本条对 E1 无影响。
      return 500 + (state.buildings.granary ?? 0) * E2.GRANARY_WOOD_BONUS;
    case 'stone':
      return 500 + (state.buildings.granary ?? 0) * E2.GRANARY_STONE_BONUS;
    // E3 金属：共用建材仓储体系（铜/锡/青铜，无独立仓库建筑——学宫/商栈时代扩容靠 city_house）
    case 'copper':
    case 'tin':
    case 'bronze':
      if (state.era !== 'E3') return Number.POSITIVE_INFINITY;
      return 500 + (state.buildings.city_house ?? 0) * 150;
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
  // ── E2 定居时代 ──（食物已与谷物合并，不再单列）
  livestock: number;
  fabric: number;
  eraElapsedSec: number;
  // ── E3 城邦时代 ──
  copper: number;
  tin: number;
  bronze: number;
  lapis: number;
  tradeRoutes: TradeRoute[];
  reputation: number;
  tradeNotes: string[];
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
  let stone = Math.min(state.stone + stoneGain, getResourceStorage('stone', state));
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

  // ── 3.5) 吃粮：单一「食物」池 ──
  //
  // 2026-09-12 用户拍板：**暂时不区分**采集所得与农耕收获，统一为「食物」
  // （原独立的「谷物」资源已合并进来，见 data/resources.ts）。
  //
  // 于是这里是唯一的吃粮路径：
  //   食物 = 现值 + 产出（采集/狩猎/农耕同源） − 人口消耗 − 牲畜饲料
  // 定居时代人口更集中，人均消耗取 E2.FOOD_PER_PERSON_SEC（0.25/秒），
  // E1 仍是 0.2/秒 —— E1 逐字节不变。
  const popPerSec = eff.seasonsEnabled
    ? E2.FOOD_PER_PERSON_SEC
    : POPULATION.FOOD_CONSUMPTION_PER_PERSON;

  let food = state.food + foodGain - population * popPerSec * dt;

  // ─────────────────────────────────────────────
  // 4) E2 定居时代：牲畜 / 织物
  // ─────────────────────────────────────────────
  //
  // 食物有**硬容量**（E1 由储存技术决定，E2 再加粮仓体系）——
  // 这是「秋天必须攒够」这个核心玩法的落地点：产出集中在秋季，
  // 但仓库装不下就只能眼看着烂掉。
  let livestock = state.livestock ?? 0;
  let fabric = state.fabric ?? 0;

  if (eff.seasonsEnabled) {
    const livestockGain = calcResourceOutput('livestock', state) * dt;
    const fabricGain = calcResourceOutput('fabric', state) * dt;

    // 牲畜先按畜栏存栏上限封顶（畜栏 = 活体库存的"仓库"）
    const pens = state.buildings.animal_pen ?? 0;
    const penCap = pens * (E2.PEN_CAPACITY + eff.penCapacityAdd);
    livestock = Math.min(livestock + livestockGain, penCap);

    // 牲畜吃饲料（「畜力与厩肥」可降饲料成本）
    food -= livestock * E2.FEED_PER_LIVESTOCK_SEC * eff.feedCostMultiplier * dt;

    // 食物见底 → 牲畜闹饥荒。
    // 默认（无兽医知识）存活率为 0，即"饥荒牲畜死亡率 100%"；
    // 「兽医知识」把它提到 50%。注意这里只损失牲畜，不损失人口与科技。
    if (food < 0) {
      const loss = 1 - eff.livestockFamineSurvival;
      if (loss > 0) livestock = Math.max(0, livestock * (1 - loss));
    }

    fabric = Math.max(0, fabric + fabricGain);
  }

  food = Math.max(0, Math.min(food, getResourceStorage('food', state)));

  // ─────────────────────────────────────────────
  // 5) E3 城邦时代：铜锡青铜链 + 贸易
  // ─────────────────────────────────────────────
  //
  // 执行顺序（devplan §7.3）：资源产出 → 消耗 → **贸易** → 人口增长。
  // 贸易换回的粮食必须计入本 tick 的食物池**之后**再结算人口——
  // 否则"粮食断供 → 贸易救回来"会晚一拍体现（E2 踩过顺序失真的坑）。
  //
  // 但注意：E3 的人口增长已在本函数上方用「tick 前的 state」算完，
  // 此处只在末尾返回增量。真正的顺序约束体现在 store 的 doTick 里
  // （先 tick 资源含贸易 → 再调人口）。这里只负责算 E3 资源增量。
  let copper = state.copper ?? 0;
  let tin = state.tin ?? 0;
  let bronze = state.bronze ?? 0;
  let lapis = state.lapis ?? 0;
  let tradeRoutes = state.tradeRoutes ?? [];
  let reputation = state.reputation ?? 50;
  const tradeNotes: string[] = [];

  if (state.era === 'E3') {
    // 5a) 铜/锡/青铜产出
    const copperGain = calcResourceOutput('copper', state) * dt;
    copper += copperGain;
    // 锡矿带开局：采矿工转采锡，本地可自给"少量"锡（设计 §2.2「锡自给 ✅ 少量」）。
    // ⚠️ 此前实现为"锡本地产出恒为 0"，与设计表冲突——锡矿带开局名存实亡。
    // 产量按铜矿工产出的一半折算（"少量"），本地无铜 → copperGain 本来就是 0。
    if (state.localOre === 'tin') {
      tin = Math.min(tin + copperGain * 0.5, getResourceStorage('tin', state));
    }

    // 铜矿工仅当本地有铜矿时有效（开局随机，用户拍板）
    // 已集成在 calcResourceOutput（job.output === 'copper'）里，
    // 但铜矿 gating 在 isJobUnlocked（jobs.ts requires）通过 localOre 处理——
    // 这里无需额外 gate，因为 job 本身不会有人分配给 copper_miner 当 localOre !== 'copper'。

    // 5b) 冶炼：每名冶炼工需 0.045 铜 + 0.005 锡，产出 0.05 青铜/秒（×熔炉加成）
    //     缺料按比例降速（"缺料停工"而不是报错）
    const smelters = state.jobs.smelter ?? 0;
    if (smelters > 0 && state.techs.bronze_smelting) {
      const needCopper = smelters * E3.SMELT_COPPER_IN * dt;
      const needTin = smelters * E3.SMELT_TIN_IN * dt;
      const copperRatio = needCopper > 0 ? Math.min(1, copper / needCopper) : 1;
      const tinRatio = needTin > 0 ? Math.min(1, tin / needTin) : 1;
      const ratio = Math.min(copperRatio, tinRatio);
      if (ratio > 0) {
        copper -= needCopper * ratio;
        tin -= needTin * ratio;
        const furnaceBonus = 1 + (state.buildings.furnace ?? 0) * E3.FURNACE_BONUS;
        bronze += smelters * E3.SMELT_BRONZE_OUT * ratio * furnaceBonus * dt;
      } else if (tin <= 0) {
        tradeNotes.push('缺锡 —— 需与迪尔蒙建立贸易路线');
      } else if (copper <= 0) {
        tradeNotes.push('缺铜 —— 需开矿或与埃兰/玛甘贸易');
      }
    }

    // 5c) 贸易结算（30 秒一轮，按需补跑——dt 通常为 0.25s，用累积器）
    //     简单实现：每周期检查一次（cycleAccum 累积到 CYCLE_SEC 则结算）
    const cycleSec = E3.TRADE_CYCLE_SEC;
    let needCycle = false;
    for (const r of tradeRoutes) {
      if (r.cycleAccum >= cycleSec) { needCycle = true; break; }
    }
    if (needCycle && tradeRoutes.length > 0) {
      const result = settleTradeCycle(state, cycleSec, Math.random);
      // 应用货物增量（付出侧做库存下限保护，不透支为负）
      const apply = (res: string, amount: number) => {
        switch (res) {
          case 'copper': copper = Math.max(0, copper + amount); break;
          case 'tin': tin = Math.max(0, tin + amount); break;
          case 'bronze': bronze = Math.max(0, bronze + amount); break;
          case 'food': food = Math.max(0, food + amount); break;
          case 'wood': wood = Math.max(0, wood + amount); break;
          case 'stone': stone = Math.max(0, stone + amount); break;
          case 'lapis': lapis = Math.max(0, lapis + amount); break;
        }
      };
      for (const [res, amount] of Object.entries(result.delta)) {
        if (amount === undefined) continue;
        apply(res, amount);
      }
      tradeRoutes = result.routes;
      tradeNotes.push(...result.notes);
      // 重置周期计时：结算完成的路线**归零**。
      //
      // ⚠️ 曾是 E3 最大恶性 bug（2026-09-12 定位）：settleTradeCycle 内部对每条
      // 路线 `cycleAccum += cycleSec`，此处若只 `-= cycleSec`，净变化为 0——
      // 累积值停在 ≥30 永远满足结算条件，此后**每个 tick（0.25s）都重复结算**
      // （应每 30s 一次），每 tick 掏走全额运力（数百单位支付货物），
      // 木材/食物产出被瞬间抽干 → 一切建设停摆。
      for (const r of tradeRoutes) {
        r.cycleAccum = 0;
      }
    } else {
      // 未到周期：推进计时
      for (const r of tradeRoutes) r.cycleAccum += dt;
    }
  }

  // E3 资源仓储上限（food/wood/stone 与铜锡青铜共用 GetCapacity 体系）
  if (state.era === 'E3') {
    food = Math.max(0, Math.min(food, getResourceStorage('food', state)));
    wood = Math.max(0, Math.min(wood, getResourceStorage('wood', state)));
    stone = Math.max(0, Math.min(stone, getResourceStorage('stone', state)));
    copper = Math.max(0, Math.min(copper, getResourceStorage('copper', state)));
    tin = Math.max(0, Math.min(tin, getResourceStorage('tin', state)));
    bronze = Math.max(0, Math.min(bronze, getResourceStorage('bronze', state)));
  }

  return {
    food,
    wood,
    stone,
    experience,
    population,
    populationProgress: progress,
    fire,
    livestock,
    fabric,
    eraElapsedSec,
    copper,
    tin,
    bronze,
    lapis,
    tradeRoutes,
    reputation,
    tradeNotes,
  };
}

export { JOBS, TECHS, TECH_MAP, BUILDING_MAP };
export type { JobId, BuildingId, ResourceId };
