/** 季节循环数值模块（定居时代 E2）。数值源：E2-sedentary.md §5 季节循环数值。 */

import { E2 } from '../data/constants';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

/** 季节顺序（春→夏→秋→冬） */
export const SEASON_ORDER: readonly SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

/** 单季时长（秒） */
export const SEASON_DURATION_SEC: number = 60;

/** 一年时长（秒）= 4 季 × 60s */
export const YEAR_DURATION_SEC: number = 240;

export interface SeasonDef {
  id: SeasonId;
  name: string;              // 中文：春 / 夏 / 秋 / 冬
  icon: string;              // 单个 emoji
  /** 进度条 / 高亮色（十六进制）—— 视图层直接用内联样式，避免 Tailwind 动态类名不被生成 */
  barColor: string;
  agriMultiplier: number;
  growthFactor: number;
  loggingMultiplier: number;
  desc: string;              // 一句话说明（中文）
}

/** 四季节定义（数值取自 §5 表；配色取自 §13「四季四色」：春绿 / 夏金 / 秋橙 / 冬灰蓝） */
export const SEASONS: Record<SeasonId, SeasonDef> = {
  spring: {
    id: 'spring', name: '春', icon: '🌱', barColor: '#4ade80',
    agriMultiplier: 0.5, growthFactor: 1.0, loggingMultiplier: 1.0,
    desc: '春耕初播，农业减半，林木石材正常。',
  },
  summer: {
    id: 'summer', name: '夏', icon: '☀️', barColor: '#fbbf24',
    agriMultiplier: 1.0, growthFactor: 1.2, loggingMultiplier: 1.0,
    desc: '盛夏生长，人口增速最快，农业正常。',
  },
  autumn: {
    id: 'autumn', name: '秋', icon: '🍂', barColor: '#fb923c',
    agriMultiplier: 2.5, growthFactor: 1.1, loggingMultiplier: 1.0,
    desc: '秋收主季，农业倍增，全年粮食大头入账。',
  },
  winter: {
    id: 'winter', name: '冬', icon: '❄️', barColor: '#93c5fd',
    agriMultiplier: 0.05, growthFactor: -0.15, loggingMultiplier: 0.7,
    desc: '寒冬凋零，农业几停，伐木打石七折，人口转负。',
  },
};

/** 将经过秒数规范化为非负有限数（负或非有限 → 0） */
function sanitize(elapsedSec: number): number {
  return Number.isFinite(elapsedSec) && elapsedSec > 0 ? elapsedSec : 0;
}

/** 距今经过秒数 → 年份索引（0 基） */
export function getYearIndex(elapsedSec: number): number {
  return Math.floor(sanitize(elapsedSec) / YEAR_DURATION_SEC);
}

/** 距今经过秒数 → 季节索引 0..3 */
export function getSeasonIndex(elapsedSec: number): number {
  return Math.floor((sanitize(elapsedSec) % YEAR_DURATION_SEC) / SEASON_DURATION_SEC);
}

/** 距今经过秒数 → 季节 id */
export function getSeasonFromElapsed(elapsedSec: number): SeasonId {
  return SEASON_ORDER[getSeasonIndex(elapsedSec)] ?? 'spring';
}

/** 当前季节内进度 0..1 */
export function getSeasonProgress(elapsedSec: number): number {
  return (sanitize(elapsedSec) % SEASON_DURATION_SEC) / SEASON_DURATION_SEC;
}

/**
 * 产出乘数。
 * 农业类（农夫/田地/谷物）用季节 agriMultiplier；
 * 非农业类（伐木、打石）用 loggingMultiplier；
 * 其余（牧人、织工、猎人）恒为 1.0。
 */
export function getSeasonOutputMultiplier(elapsedSec: number, isAgricultural: boolean): number {
  const def = SEASONS[getSeasonFromElapsed(elapsedSec)];
  return isAgricultural ? def.agriMultiplier : def.loggingMultiplier;
}

/** 人口增长的季节因子 r（冬季为负数） */
export function getSeasonGrowthFactor(elapsedSec: number): number {
  return SEASONS[getSeasonFromElapsed(elapsedSec)].growthFactor;
}

/** 人均储粮 → 食物因子（负或非有限按 0 处理 → −0.5） */
export function getFoodFactorFromStorage(storedPerPerson: number): number {
  const v = Number.isFinite(storedPerPerson) && storedPerPerson > 0 ? storedPerPerson : 0;
  if (v === 0) return -0.5;
  if (v < 12) return 0;
  if (v < 32) return 0.4;
  if (v < 60) return 0.8;
  return 1.0;
}

/** 谷物容量：(400 + 粮仓数×单仓容量) × (1 + 陶窑加成×min(陶窑数,上限) + 陶罐储藏加成)
 *
 * 后三个参数由科技决定（「粮仓分层」把单仓 800→1000、「屋顶防潮」把陶窑加成 0.15→0.20），
 * 默认值取自 E2 常量表，调用方传入已聚合的科技效果即可。
 */
export function getGranaryCapacity(
  granaryCount: number,
  kilnCount: number,
  jarStorageBonus: number,
  perGranary: number = E2.GRANARY_PER_UNIT,
  kilnBonus: number = E2.KILN_BONUS,
  maxEffectiveKilns: number = E2.KILN_MAX_EFFECTIVE,
): number {
  const g = Number.isFinite(granaryCount) && granaryCount > 0 ? granaryCount : 0;
  const k = Number.isFinite(kilnCount) && kilnCount > 0 ? kilnCount : 0;
  const j = Number.isFinite(jarStorageBonus) && jarStorageBonus > 0 ? jarStorageBonus : 0;
  const per = Number.isFinite(perGranary) && perGranary > 0 ? perGranary : E2.GRANARY_PER_UNIT;
  const kb = Number.isFinite(kilnBonus) && kilnBonus > 0 ? kilnBonus : E2.KILN_BONUS;
  const maxK =
    Number.isFinite(maxEffectiveKilns) && maxEffectiveKilns > 0
      ? maxEffectiveKilns
      : E2.KILN_MAX_EFFECTIVE;
  return (400 + g * per) * (1 + kb * Math.min(k, maxK) + j);
}

/** 一个冬季的谷物消耗总量（人口×0.25×60） */
export function getWinterConsumption(population: number): number {
  const p = Number.isFinite(population) && population > 0 ? population : 0;
  return p * 0.25 * 60;
}

/** 冬季的起始偏移（秒）= 春+夏+秋 */
const WINTER_START_SEC: number = SEASON_DURATION_SEC * 3;

/**
 * 距离「入冬」还有多少秒（0 表示已在冬季）。
 *
 * 用于「越冬预报」：玩家需要在秋季结束前把谷物攒到冬耗之上。
 * 定居时代的压力是**可预报**的，所以把"还有多久"直接摆到界面上。
 */
export function getSecondsToWinter(elapsedSec: number): number {
  const inYear = sanitize(elapsedSec) % YEAR_DURATION_SEC;
  return Math.max(0, WINTER_START_SEC - inYear);
}
