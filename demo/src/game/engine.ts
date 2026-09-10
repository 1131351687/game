// E1 远古时代 · 游戏引擎
// 只做纯计算；状态变更由 store 负责
// 数值来源：design/game/02-tech-eras.md 第 11 节

import { TECHS, TECH_MAP, type TechEffects } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDING_MAP, type BuildingId } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import {
  FIRE,
  FIRE_TIER_INFO,
  POPULATION,
  FOOD_FACTOR,
  BUILDING_EFFECTS,
  getFireTier,
  getToolMultiplier,
  type FireTier,
} from '../data/constants';

// ─────────────────────────────────────────────
// 状态形状（引擎只读）
// ─────────────────────────────────────────────
export interface E1State {
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
}

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
};

export function aggregateEffects(state: E1State): AggregatedEffects {
  const acc: AggregatedEffects = { ...DEFAULT_EFFECTS };

  for (const tech of TECHS) {
    if (!state.techs[tech.id]) continue;
    const e: TechEffects = tech.effects;

    if (e.enableFire) acc.fireEnabled = true;
    if (e.activeFireRestore) acc.activeFireRestore = true;
    if (e.fireDecayMultiplier !== undefined) acc.fireDecayMultiplier *= e.fireDecayMultiplier;
    if (e.fireMaxBonus) acc.fireMaxBonus += e.fireMaxBonus;
    if (e.removeWeakFoodPenalty) acc.removeWeakFoodPenalty = true;
    if (e.foodMultiplier) acc.foodMultiplier *= e.foodMultiplier;
    if (e.stoneMultiplier) acc.stoneMultiplier *= e.stoneMultiplier;
    if (e.expMultiplier) acc.expMultiplier *= e.expMultiplier;
    if (e.gathererMultiplier) acc.gathererMultiplier *= e.gathererMultiplier;
    if (e.setToolTier !== undefined) acc.toolTier = Math.max(acc.toolTier, e.setToolTier);
    if (e.buildingCostMultiplier) acc.buildingCostMultiplier *= e.buildingCostMultiplier;
    if (e.stabilityBonus) acc.stabilityBonus += e.stabilityBonus;
    if (e.huntPartyThreshold) acc.huntPartyThreshold = e.huntPartyThreshold;
    if (e.huntPartyBonus) acc.huntPartyBonus = e.huntPartyBonus;
    if (e.foodStorageMultiplier) acc.foodStorageMultiplier *= e.foodStorageMultiplier;
    if (e.enableAdvance) acc.enableAdvance = true;
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
  if (tier === 'weak' && eff.removeWeakFoodPenalty) {
    return FIRE_TIER_INFO.stable.foodBonus;
  }
  return FIRE_TIER_INFO[tier].foodBonus;
}

// ─────────────────────────────────────────────
// T2.2 人口模型（逻辑斯蒂增长）
// ─────────────────────────────────────────────

export function getCapacity(state: E1State): number {
  const houses = state.buildings.house ?? 0;
  return POPULATION.BASE_CAPACITY + houses * POPULATION.CAPACITY_PER_HOUSE;
}

export function getFoodConsumption(state: E1State): number {
  return state.population * POPULATION.FOOD_CONSUMPTION_PER_PERSON;
}

export function getFoodProduction(state: E1State): number {
  return calcResourceOutput('food', state);
}

export function getFoodFactor(state: E1State): number {
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

  // 火种系统尚未开启（还没研究「掌握火」）：
  // 此时不存在"熄灭惩罚"，火源因子按中性 1.0 处理。
  // —— 否则开局 fire=0 会被误判为"火灭了"，人口在几秒内死光。
  if (!eff.fireEnabled) {
    const r0 = POPULATION.BASE_GROWTH_RATE;
    const foodFactor0 = getFoodFactor(state);
    if (foodFactor0 < 0) return -POPULATION.STARVATION_DECAY;
    return r0 * P * (1 - P / K) * foodFactor0;
  }

  const fireFactor = getFireFactor(state);

  // 火种已开启但熄灭了 → 生存惩罚
  if (fireFactor === 0) return -POPULATION.STARVATION_DECAY;

  const r = POPULATION.BASE_GROWTH_RATE * fireFactor;
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
  for (const [res, amount] of Object.entries(cost)) {
    if ((state[res as 'food' | 'wood' | 'stone'] ?? 0) < (amount as number)) return false;
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
  const eff = aggregateEffects(state);
  const houses = state.buildings.house ?? 0;

  const items = [
    {
      label: '研究「植物栽培」',
      done: eff.enableAdvance,
      detail: state.techs['plant_cultivation'] ? '已完成' : '尚未研究',
    },
    { label: '食物储备 ≥ 300', done: state.food >= 300, detail: `${Math.floor(state.food)} / 300` },
    { label: '建成 3 座住所', done: houses >= 3, detail: `${houses} / 3` },
    { label: '人口 ≥ 15', done: state.population >= 15, detail: `${Math.floor(state.population)} / 15` },
  ];

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
      return 500;
    case 'stone':
      return 500;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

// ─────────────────────────────────────────────
// T4.6 卡点提示
// ─────────────────────────────────────────────
export function getBottleneck(state: E1State): string | null {
  if (!aggregateEffects(state).fireEnabled) return null;

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
}

export function tick(state: E1State, dt: number): TickResult {
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
  let population = state.population;
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

  return { food, wood, stone, experience, population, populationProgress: progress, fire };
}

export { JOBS, TECHS, TECH_MAP, BUILDING_MAP };
export type { JobId, BuildingId, ResourceId };
