// E4 帝国时代 · 核心引擎（empire systems）
//
// 本代四条主线（E4-empire.md §1–§3）：
//   ① 版图扩张 vs 规模不经济 —— A_eff 超线性上升，维稳成本 ρ 吃掉产出
//   ② 治理覆盖率 κ —— 官吏供给 G 压不住 A_eff 时秩序崩坏
//   ③ 铸币三层依赖链 —— 铁→铸币厂→铸币工→官吏/军团俸禄，扩张要花钱
//   ④ 政体三选 —— 君主/共和/神权的取舍
//
// 铁律：
//   · 全部函数**时代门控**——只在 state.era === 'E4' 时被 tick 调用，
//     E1/E2/E3 的代码路径字面上不变（基线 1163s / 1920s 依赖它）。
//   · 纯函数优先：所有 get* 不修改入参；副作用（扣铸币/搬秩序）集中在 tick 与 store action。

import { E4 } from '../data/constants';
import { aggregateEffects, type E1State } from './engine';

// ─────────────────────────────────────────────
// 政体（T2.5）
// ─────────────────────────────────────────────
export type Polity = 'monarchy' | 'republic' | 'theocracy';

/**
 * 政体系数表（E4-empire.md §3.1；人口增长率用 E4.GOV_* 常量）。
 *
 * ⚠️ 研究/秩序恢复系数为首轮草案（§3.1 与 §11.3 两处不一致，见 E4-devplan §四·2），
 * 配平期统一定稿后回填此处与设计文档。
 */
export const POLITY_TABLE: Record<
  Polity,
  {
    name: string;
    icon: string;
    /** 研究效率乘数 */
    researchMul: number;
    /** 人口增长率乘数（E4.GOV_*：君主 0.90 / 共和 1.10 / 神权 0.85） */
    popGrowthMul: number;
    /** 秩序恢复乘数 */
    orderRecoveryMul: number;
    /** 一句话取舍 */
    desc: string;
  }
> = {
  monarchy: {
    name: '君主制',
    icon: '👑',
    researchMul: 1.0,
    popGrowthMul: E4.GOV_MONARCHY,
    orderRecoveryMul: 1.1,
    desc: '继承危机每 25 分钟冲击秩序 −15，但兵员配额与军饷效率最高。',
  },
  republic: {
    name: '共和制',
    icon: '🏛️',
    researchMul: 1.15,
    popGrowthMul: E4.GOV_REPUBLIC,
    orderRecoveryMul: 1.0,
    desc: '研究更快、人口增长更好，但扩张需额外官署支撑（每 3 格 1 座）。',
  },
  theocracy: {
    name: '神权制',
    icon: '⛩️',
    researchMul: 1.1,
    popGrowthMul: E4.GOV_THEOCRACY,
    orderRecoveryMul: 1.2,
    desc: '秩序最稳，人口与军团成长最慢——用信仰换稳定。',
  },
};

/** 当前政体（未解锁/未切换时返回 null） */
export function getPolity(s: E1State): Polity | null {
  return (s.polity ?? null) as Polity | null;
}

/** 政体是否已解锁（支撑科技「郡县制」） */
export function isPolityUnlocked(s: E1State): boolean {
  return !!s.techs['commandery'];
}

export interface PolitySwitchCheck {
  ok: boolean;
  reason?: string;
}

/** 能否切换政体（不修改入参） */
export function canSwitchPolity(s: E1State, next: Polity): PolitySwitchCheck {
  if (!isPolityUnlocked(s)) return { ok: false, reason: '需研究「郡县制」解锁政体' };
  if (getPolity(s) === next) return { ok: false, reason: '已是该政体' };
  if ((s.polityCooldownSec ?? 0) > 0) return { ok: false, reason: '政体切换冷却中' };
  if (s.coin < E4.GOV_SWITCH_COIN_COST)
    return { ok: false, reason: `铸币不足（需 ${E4.GOV_SWITCH_COIN_COST}）` };
  if (s.order < E4.GOV_SWITCH_ORDER_COST)
    return { ok: false, reason: `秩序不足（需 ${E4.GOV_SWITCH_ORDER_COST}）` };
  return { ok: true };
}

// ─────────────────────────────────────────────
// 版图与规模不经济（T2.3）
// ─────────────────────────────────────────────

/** 驰道等级：每座 +1，上限 4（「御道网」科技提到 5） */
export function getRoadLevel(s: E1State): number {
  const eff = aggregateEffects(s);
  const max = eff.roadLevelMax ?? 4;
  return Math.min(max, s.buildings.road ?? 0);
}

/** 官署等级：每座 +1，上限 4 —— 治理效率 ×(1+0.25k) */
export function getChanceryLevel(s: E1State): number {
  return Math.min(4, s.buildings.chancery ?? 0);
}

export interface AdminLoad {
  /** 原始行政负荷 A(n) = 1.5·n^1.5 */
  A: number;
  /** 半径修正 R(n) = 1 + (0.030 − 0.006·D)·(n−1)，D = 驰道等级 */
  R: number;
  /** 军团威慑 Λ(L) = max(0.70, 1 − 0.02·L)，L = 军团数 */
  Lambda: number;
  /** 平定期惩罚（扩张后 900… 秒内 ×1.5） */
  flatMul: number;
  /** 有效行政负荷 A_eff = A·R·Λ·flat */
  Aeff: number;
}

/**
 * 有效行政负荷。n=20、D=0、L 取设计需求值时 ρ≈37.4%（§1.3 对照表）。
 */
export function getAdminLoad(s: E1State): AdminLoad {
  const n = s.territory ?? 1;
  const D = getRoadLevel(s);
  const L = s.jobs.legionary ?? 0;
  const A = 1.5 * Math.pow(n, 1.5);
  const R = 1 + (0.03 - E4.ROAD_RADIUS_BONUS * 1 * D) * (n - 1);
  const Lambda = Math.max(0.7, 1 - E4.LEGION_SUPPRESSION * L);
  const flatMul = (s.expansionFlatSec ?? 0) > 0 ? 1.5 : 1;
  return { A, R, Lambda, flatMul, Aeff: A * R * Lambda * flatMul };
}

// ─────────────────────────────────────────────
// 治理覆盖率 κ（T2.4）
// ─────────────────────────────────────────────

/**
 * 治理供给 G = B × E。
 * B = 官吏编制数（jobs.official）；E = 治理效率 = (1 + 0.25×官署等级) × 科技加成。
 */
export function getGovernanceSupply(s: E1State): number {
  const eff = aggregateEffects(s);
  const B = s.jobs.official ?? 0;
  const E = (1 + 0.25 * getChanceryLevel(s)) * (eff.governanceMul ?? 1);
  return B * E;
}

/** 治理覆盖率 κ = G / A_eff（可 >1，封顶展示时另说） */
export function getCoverage(s: E1State): number {
  const Aeff = getAdminLoad(s).Aeff;
  if (Aeff <= 0) return 1;
  return getGovernanceSupply(s) / Aeff;
}

/**
 * 维稳成本率 ρ（占产出的比例，0..1）。
 * ρ = 0.80 × A_eff/(A_eff+240) × (1 + 0.6·δ)，δ = max(0, 1−κ)。
 * κ ≥ 1 时 δ=0，ρ 只随 A_eff 变化；κ 崩了 δ 放大 ρ。
 */
export function getStabilityRate(s: E1State): number {
  const Aeff = getAdminLoad(s).Aeff;
  const kappa = getCoverage(s);
  const delta = Math.max(0, 1 - kappa);
  return (
    E4.UPKEEP_BASE * (Aeff / (Aeff + E4.UPKEEP_SCALE)) * (1 + 0.6 * delta)
  );
}

/** 秩序档位（E4.ORDER_TIERS：≥80 太平 / ≥70 安定 / ≥40 紧张 / <40 动荡） */
export type OrderRegime = 'peaceful' | 'stable' | 'tense' | 'chaos';

export function getOrderRegime(s: E1State): OrderRegime {
  const O = s.order ?? 0;
  if (O >= E4.ORDER_TIERS.peaceful) return 'peaceful';
  if (O >= E4.ORDER_TIERS.stable) return 'stable';
  if (O >= E4.ORDER_TIERS.tense) return 'tense';
  return 'chaos';
}

/** 各秩序档位的许可/乘子（产出、研究、扩张） */
export function getOrderRegimeEffects(s: E1State): {
  label: string;
  outputMul: number;
  researchMul: number;
  expandAllowed: boolean;
} {
  switch (getOrderRegime(s)) {
    case 'peaceful':
      return { label: '太平', outputMul: 1.0, researchMul: 1.0, expandAllowed: true };
    case 'stable':
      return { label: '安定', outputMul: 1.0, researchMul: 1.0, expandAllowed: true };
    case 'tense':
      return { label: '紧张', outputMul: 0.9, researchMul: 0.9, expandAllowed: false };
    case 'chaos':
      return { label: '动荡', outputMul: 0.7, researchMul: 0.7, expandAllowed: false };
  }
}

/**
 * 秩序变化速率 dO/dt（秒）。
 * clamp(15·(κ−0.8), −8, +3) × 秩序恢复乘数 × 政体恢复系数。
 * 铸币欠饷（coin=0 且有俸禄义务）额外 −1.0/秒。
 */
export function getOrderDelta(s: E1State): number {
  const eff = aggregateEffects(s);
  const kappa = getCoverage(s);
  const base = Math.max(-8, Math.min(3, 15 * (kappa - 0.8)));
  const polity = getPolity(s);
  const polityRecovery = polity ? POLITY_TABLE[polity].orderRecoveryMul : 1.0;
  const techRecovery = eff.orderRecoveryMul ?? 1.0;
  let d = base * polityRecovery * techRecovery;
  // 欠饷：铸币耗尽且还有要养的人
  const onPayroll = (s.jobs.official ?? 0) + (s.jobs.legionary ?? 0);
  if (s.coin <= 0 && onPayroll > 0) d -= 1.0;
  // 盐铁专营：与民争利，秩序承压
  if (eff.orderPressureAdd) d += eff.orderPressureAdd;
  return d;
}

// ─────────────────────────────────────────────
// 扩张（T2.7）
// ─────────────────────────────────────────────

/** 兵员配额需求：⌈0.15·n^1.15⌉ 个军团 */
export function legionRequirement(n: number): number {
  return Math.ceil(0.15 * Math.pow(n, 1.15));
}

export interface ExpandCheck {
  ok: boolean;
  reason?: string;
  coinCost: number;
  ironCost: number;
  flatSec: number;
}

/** 扩张到 n+1 的成本与条件（不修改入参） */
export function canExpand(s: E1State): ExpandCheck {
  const n = s.territory ?? 1;
  const coinCost = Math.ceil(800 * Math.pow(n, 1.3));
  const ironCost = Math.ceil(200 * Math.pow(n, 1.1));
  const flatSec = 15 + 2 * n;
  const O = s.order ?? 0;
  if (O < 50) return { ok: false, reason: `秩序不足（需 ≥50，当前 ${Math.round(O)}）`, coinCost, ironCost, flatSec };
  const regime = getOrderRegimeEffects(s);
  if (!regime.expandAllowed)
    return { ok: false, reason: `秩序档位「${regime.label}」禁止扩张`, coinCost, ironCost, flatSec };
  const L = s.jobs.legionary ?? 0;
  const need = legionRequirement(n);
  if (L < need)
    return { ok: false, reason: `军团不足（需 ${need} 个建制，当前 ${L}）`, coinCost, ironCost, flatSec };
  const polity = getPolity(s);
  if (polity === 'republic') {
    const chanceryNeed = Math.ceil(n / 3);
    if ((s.buildings.chancery ?? 0) < chanceryNeed)
      return {
        ok: false,
        reason: `共和制需官署 ≥${chanceryNeed}（当前 ${s.buildings.chancery ?? 0}）`,
        coinCost,
        ironCost,
        flatSec,
      };
  }
  if (s.coin < coinCost)
    return { ok: false, reason: `铸币不足（需 ${coinCost}）`, coinCost, ironCost, flatSec };
  if (s.iron < ironCost)
    return { ok: false, reason: `铁不足（需 ${ironCost}）`, coinCost, ironCost, flatSec };
  return { ok: true, coinCost, ironCost, flatSec };
}

// ─────────────────────────────────────────────
// 人口与承载力（T2.8）—— 引擎 getCapacity/getPopulationGrowth 的 E4 分支调用
// ─────────────────────────────────────────────

/**
 * E4 承载力：K = 200 基础 + Σ历代住宅 + 60·n^0.85（版图递减承载力）。
 * 旧时代建筑继续叠加（跃迁不重置、K 连续）。
 */
export function getCapacityE4(s: E1State): number {
  const b = s.buildings;
  const territoryK =
    E4.TERRITORY_CAPACITY_BASE * Math.pow(s.territory ?? 1, E4.TERRITORY_CAPACITY_EXP);
  return (
    E4.POP_BASE_CAPACITY +
    (b.house ?? 0) * 4 +
    (b.village_house ?? 0) * 4 +
    (b.city_house ?? 0) * 130 +
    (b.housing_1 ?? 0) * 100 +
    (b.housing_2 ?? 0) * 400 +
    (b.housing_3 ?? 0) * 1600 +
    (b.housing_4 ?? 0) * 6400 +
    territoryK
  );
}

/**
 * E4 人口增长率 r（每秒的常数项）：
 * r = 0.004 × 政体系数 × 安定因子(0.50 + 0.50·min(κ,1))。
 */
export function getGrowthRateE4(s: E1State): number {
  const kappa = Math.min(1, getCoverage(s));
  const polity = getPolity(s);
  const popMul = polity ? POLITY_TABLE[polity].popGrowthMul : 1.0;
  const stability = E4.STABILITY_BASE + E4.STABILITY_BASE * kappa;
  return E4.POP_GROWTH_RATE * popMul * stability;
}

// ─────────────────────────────────────────────
// 知识产出（T2.2）—— E4 关闭书吏模型，改人口扁平产出
// ─────────────────────────────────────────────

/**
 * E4 知识产出 = 人口 × 0.012/秒 × 政体研究系数 × 秩序档位研究乘数。
 * 书吏在 E4 不再产出知识（岗位保留、玩家自行转岗；退役机制 TODO(E4)）。
 */
export function getKnowledgeOutputE4(s: E1State): number {
  const polity = getPolity(s);
  const researchMul = polity ? POLITY_TABLE[polity].researchMul : 1.0;
  const regime = getOrderRegimeEffects(s);
  return s.population * E4.KNOWLEDGE_PER_PERSON * researchMul * regime.researchMul;
}

// ─────────────────────────────────────────────
// 俸禄链（T2.6）—— tick 每拍调用
// ─────────────────────────────────────────────

/** 每秒铸币支出：官吏俸禄 + 军团军饷（常备军制科技减免） */
export function getCoinUpkeepPerSec(s: E1State): number {
  const eff = aggregateEffects(s);
  const officialPay = (s.jobs.official ?? 0) * E4.OFFICIAL_COIN;
  const legionPay =
    (s.jobs.legionary ?? 0) * E4.LEGION_COIN * (eff.legionPayMul ?? 1);
  return officialPay + legionPay;
}

/** 每秒额外口粮支出：官吏 + 军团（屯田制科技自给率抵扣） */
export function getRationUpkeepPerSec(s: E1State): number {
  const eff = aggregateEffects(s);
  const selfSuff = eff.legionGrainSelfSufficiency ?? 1;
  const officialFood = (s.jobs.official ?? 0) * E4.OFFICIAL_FOOD;
  const legionFood = (s.jobs.legionary ?? 0) * E4.LEGION_FOOD * selfSuff;
  return officialFood + legionFood;
}

/**
 * 铸币存量上限（铸币是"流动资金"，设一个大额软上限防溢出；
 * 允许玩家攒 150,000 通关款并留余量）。
 */
export function getCoinStorage(_s: E1State): number {
  return 1_000_000;
}

/** 铁存量上限 */
export function getIronStorage(_s: E1State): number {
  return 50_000;
}
