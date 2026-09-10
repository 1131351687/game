// 渐进解锁 —— 决定开局给玩家看多少东西
//
// 设计原则：
//   开局**不超过 10 个可点元素**，随研究进程逐步放出模块。
//   玩家第一眼应该只看到：「采集者 +1」和「掌握火」两件事。

import { TECHS, TECH_MAP } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDINGS, BUILDING_MAP, type BuildingId } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { eraDistance } from '../data/era';
import { aggregateEffects, countResearched, isBuildingUnlocked, type E1State } from './engine';

// ─────────────────────────────────────────────
// 顶层模块（Tab / 常驻面板）
// ─────────────────────────────────────────────
export type UiModule = 'fire' | 'production' | 'buildings' | 'queue' | 'advance';

/**
 * 模块解锁条件：
 *   fire       掌握火之后（火种仪表盘才出现）
 *   production 掌握火之后（有伐木者可派了；开局只有采集者，不需独立 Tab）
 *   buildings  任一建筑解锁后
 *   queue      研究 2 项科技后（第 1 项还没必要排队）
 *   advance    门槛科技可见后
 */
export function isModuleUnlocked(m: UiModule, s: E1State): boolean {
  const eff = aggregateEffects(s);
  switch (m) {
    case 'fire':
    case 'production':
      return eff.fireEnabled;
    case 'buildings':
      return eraBuildings(s).some(b => isBuildingUnlocked(b.id, s));
    case 'queue':
      return countResearched(s) >= 2;
    case 'advance':
      return isTechRevealed('plant_cultivation', s);
  }
}

/** 当前可见的模块列表（按推荐顺序） */
export function getVisibleModules(s: E1State): UiModule[] {
  const order: UiModule[] = ['production', 'buildings', 'queue', 'advance'];
  return order.filter(m => isModuleUnlocked(m, s));
}

// ─────────────────────────────────────────────
// 科技树渐进揭示
// ─────────────────────────────────────────────
/**
 * 科技是否对玩家可见。
 *
 * - 已研究 → 可见
 * - 前置全部满足 → 可见（玩家能看到"下一步能点什么"）
 * - requiresAny：任一满足即可见
 * - 否则隐藏
 *
 * 效果：开局只有「掌握火」1 个节点；研究后它的 3 个子节点才出现，树逐步生长。
 */
export function isTechRevealed(techId: string, s: E1State): boolean {
  const def = TECH_MAP[techId];
  if (!def) return false;
  if (s.techs[techId]) return true;

  // AND 前置必须全满足
  if (!def.requires.every(r => s.techs[r])) return false;

  // OR 前置（门槛汇聚）：任一满足
  if (def.requiresAny && def.requiresAny.length > 0) {
    return def.requiresAny.some(r => s.techs[r]);
  }
  return true;
}

/** 当前应显示的科技节点 */
export function getRevealedTechs(s: E1State): typeof TECHS {
  return TECHS.filter(t => isTechRevealed(t.id, s));
}

// ─────────────────────────────────────────────
// 资源渐进显示
// ─────────────────────────────────────────────
/**
 * 资源是否显示。
 * 开局只有食物与经验有意义（木材要等掌握火、石头要等石器打制）。
 *
 * 时代隔离：E2 的三项新资源在 E1 下必须**完全不可见**，
 * 否则远古时代的资源条会凭空多出三项恒为 0 的条目（既有布局位移，也是剧透）。
 */
export function isResourceRevealed(id: ResourceId, s: E1State): boolean {
  switch (id) {
    case 'food':
    case 'experience':
    case 'population':
      return true;
    case 'wood':
      // 掌握火之后才需要木材（维持火种 / 建住所）
      return aggregateEffects(s).fireEnabled;
    case 'stone':
      // 石器打制之后才有打石者
      return !!s.techs['stone_knapping'];

    // ── E2 定居时代 ──
    case 'grain':
    case 'livestock':
      // 谷物是定居时代的核心仪表盘数值（跃迁时即带 300 谷物入场），
      // 牲畜同理 —— 两者一进入本时代就需要被看到，否则玩家不知道有这笔遗产。
      // 用「当前时代 ≥ 资源所属时代」判定，而不是硬编码 === 'E2'，
      // 这样 E3 及以后继承这些资源时不必再改这里。
      return eraDistance('E2', s.era) >= 0;
    case 'fabric':
      // 织物由「纺织」科技解锁（见 E2-effects.md：textile → unlockResources: ['fabric']），
      // 未解锁前产不出也存不住，不显示
      return !!s.techs['textile'];

    default:
      return true;
  }
}

// ─────────────────────────────────────────────
// 岗位渐进显示
// ─────────────────────────────────────────────
/**
 * 岗位是否显示。
 * 开局只有采集者；其余随对应科技出现。
 */
export function isJobRevealed(jobId: JobId, s: E1State): boolean {
  const def = JOB_MAP[jobId];
  // 无前置的岗位（采集者）始终可见
  if (!def.requires.tech && def.requires.toolTier === undefined) return true;

  // 前置科技已研究 → 可见（即便工具世代还没到，也让玩家看到目标）
  if (def.requires.tech && s.techs[def.requires.tech]) return true;

  return false;
}

/** 当前应显示的岗位 */
export function getRevealedJobs(s: E1State) {
  return JOBS.filter(j => isJobRevealed(j.id, s));
}

// ─────────────────────────────────────────────
// 建筑渐进显示
// ─────────────────────────────────────────────
/**
 * 当前时代可建的建筑集合。
 *
 * 建筑**不跨时代继承**：E1 的住所按设计文档 §4 的「住所 → 村落民居」升级路径
 * 由 advanceEra 直接转换成村落民居，因此 E2 不再需要（也不应）重开 E1 建筑。
 * 若不过滤，E2 可以用 30 木材的 E1 住所绕过 40 木材 + 20 石头的村落民居，
 * 承载力 K 的经济性会被直接架空。
 *
 * 岗位则相反 —— 设计文档 §7 明确要求采集者 / 猎人**继承并降权**，
 * 且 E2 建筑仍消耗木材与石头，所以 JobPanel 不做时代过滤。
 */
export function eraBuildings(s: E1State) {
  return BUILDINGS.filter(b => b.era === s.era);
}

export function isBuildingRevealed(id: BuildingId, s: E1State): boolean {
  const def = BUILDING_MAP[id];
  if (def.era !== s.era) return false;
  if (!def.requires.tech) return true;
  return !!s.techs[def.requires.tech];
}

export function getRevealedBuildings(s: E1State) {
  return eraBuildings(s).filter(b => isBuildingRevealed(b.id, s));
}

// ─────────────────────────────────────────────
// 开局引导（第一屏的文案）
// ─────────────────────────────────────────────
export function getOpeningHint(s: E1State): string | null {
  const researched = countResearched(s);
  if (researched > 0) return null;

  // 还没研究任何科技 —— 给出最小引导
  const assigned = Object.values(s.jobs).reduce((a, b) => a + b, 0);
  if (assigned === 0) {
    return '派族人去采集食物 —— 经验来自人口，人口需要食物。';
  }
  return '攒够 10 点经验，点亮「掌握火」。';
}
