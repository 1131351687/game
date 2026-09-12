// 渐进解锁 —— 决定开局给玩家看多少东西
//
// 设计原则：
//   开局**不超过 10 个可点元素**，随研究进程逐步放出模块。
//   玩家第一眼应该只看到：「采集者 +1」和「掌握火」两件事。

import { TECHS, TECH_MAP } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDINGS, BUILDING_MAP, type BuildingId } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { ERAS, eraDistance } from '../data/era';
import { aggregateEffects, countResearched, isBuildingUnlocked, type E1State } from './engine';

// ─────────────────────────────────────────────
// 顶层模块（Tab / 常驻面板）
// ─────────────────────────────────────────────
export type UiModule = 'fire' | 'production' | 'buildings' | 'advance';

/**
 * 模块解锁条件：
 *   fire       掌握火之后（火种仪表盘才出现）
 *   production 掌握火之后（有伐木者可派了；开局只有采集者，不需独立 Tab）
 *   buildings  任一"本代可建建筑"解锁，**或手里已握有旧时代建筑**
 *   advance    **本代核心（门槛）科技研究完成后**才出现
 */
export function isModuleUnlocked(m: UiModule, s: E1State): boolean {
  const eff = aggregateEffects(s);
  switch (m) {
    case 'fire':
    case 'production':
      return eff.fireEnabled;
    case 'buildings':
      // 跃迁**不重置旧内容** → 进入新时代时玩家手里还握着旧时代的建筑
      // （住所/火塘/作坊……）。若这里只数"本代建筑"，
      // 会在 E2 开局（E2 建筑一项都还没解锁时）把整个建筑栏位判为不可用，
      // 玩家的建筑就此"消失"——正是用户反馈的 bug。
      // 因此：有当前及以前时代的可建建筑，或有任何一座已建成的建筑，栏位就该在。
      return BUILDINGS.some(
        b =>
          (eraDistance(b.era, s.era) >= 0 || (s.buildings[b.id] ?? 0) > 0) &&
          isBuildingUnlocked(b.id, s)
      );
    case 'advance':
      // 「时代跃迁」栏位只在**本代核心（门槛）科技研究完成**后才出现。
      //
      // 为什么不是"可见即出现"：门槛科技一进新时代就在科技网格里，
      // 于是跃迁面板从开局就杵在那儿、还顶着一排永远勾不满的条件
      // （用户反馈："解锁了一次之后都出现，不适合"）。
      // 完成门槛科技才是"该考虑跃迁了"的信号，此时出现才有信息量。
      return !!s.techs[ERAS[s.era].gateTech];
  }
}

/** 当前可见的模块列表（按推荐顺序） */
export function getVisibleModules(s: E1State): UiModule[] {
  const order: UiModule[] = ['production', 'buildings', 'advance'];
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
    case 'livestock':
      // 牲畜一进入定居时代就需要被看到，否则玩家不知道有这笔遗产。
      // （食物不再需要时代判定：采集与农耕已合并为同一资源，从开局就显示）
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
/**
 * 该岗位是否已在当前时代**退役**（职业取消）。
 *
 * 规则（2026-09-12 用户拍板）：岗位的"进阶目标"所属时代一旦到来，
 * 源岗位就不再存在 —— 采集者在农耕（定居）时代被**取消**，
 * 从业者全员转为农夫并继承人数（不是"继承并降权"，是"这个职业没有了"）。
 *
 * 由数据驱动：只看 `JobDef.upgradesTo` 的目标岗位属于哪个时代。
 * 没有进阶关系的岗位（猎人、伐木者…）永远不会退役。
 */
export function isJobRetired(jobId: JobId, s: E1State): boolean {
  const up = JOB_MAP[jobId].upgradesTo;
  if (!up) return false;
  return eraDistance(JOB_MAP[up.job].era, s.era) >= 0;
}

export function isJobRevealed(jobId: JobId, s: E1State): boolean {
  const def = JOB_MAP[jobId];

  // 退役岗位：**还有人时仍然显示**（正在全员转出），人清零后彻底消失。
  // 为什么不直接隐藏：那会让"统计里有人、列表里没这行"——人像是凭空消失了。
  if (isJobRetired(jobId, s)) return (s.jobs[jobId] ?? 0) > 0;

  // 已派了人的岗位**必须可见**：农夫在「农业」研究完之前处于"未解锁"状态，
  // 但它可能已经有人了（时代跃迁带过来的）。若按解锁判定，
  // 玩家会看到"岗位统计里有人、列表里却没有这一行"。（同退役岗位的道理）
  if ((s.jobs[jobId] ?? 0) > 0) return true;
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
 * 当前可操作的建筑集合：**当前及以前时代的建筑 + 已建成的建筑**。
 *
 * 旧时代建筑保留新建入口（2026-09-12 修 bug）：跃迁不重置旧内容，
 * 引擎的承载力/存储/产出模型也在持续计算旧建筑（见 engine.getCapacity 的 E3 分支）——
 * 如果 UI 层单方面锁死新建，E3 里田地/粮仓/畜栏/陶窑（本代无替代建筑）将无法扩张，
 * 粮食产能与存储直接卡死。
 *
 * 例外由数据声明：`supersededBy`（功能被后续建筑取代）与 `obsoleteAfterEra`
 * （机制已失效），见 isBuildingBuildable——E1 住所/火塘仍按设计退役。
 *
 * 岗位则相反 —— 有进阶目标的岗位在其目标时代到来时**退役**（采集者→农夫，
 * 见 isJobRetired，2026-09-12 用户拍板）；无进阶关系的岗位（猎人、伐木者…）
 * 跨时代保留。E2 建筑仍消耗木材与石头，所以 JobPanel 不做时代过滤。
 */
export function eraBuildings(s: E1State) {
  return BUILDINGS.filter(
    b => eraDistance(b.era, s.era) >= 0 || (s.buildings[b.id] ?? 0) > 0
  );
}

export function isBuildingRevealed(id: BuildingId, s: E1State): boolean {
  const def = BUILDING_MAP[id];
  const owned = (s.buildings[id] ?? 0) > 0;
  // 未来时代建筑：除非已建成（不该发生，防御性保留），否则不显示
  if (eraDistance(def.era, s.era) < 0 && !owned) return false;
  if (!def.requires.tech) return true;
  return !!s.techs[def.requires.tech];
}

/**
 * 该建筑在当前时代**是否还能新建**。
 *
 * 规则：所属时代已到达即可新建（跃迁不重置，旧建筑的产能必须能继续扩张），
 * 但两类数据声明的例外除外：
 *  - supersededBy：功能被后续时代的建筑取代（E1 住所 ← 村落民居），
 *    取代者所属时代到达后不再开放——防止便宜旧建筑架空昂贵新内容；
 *  - obsoleteAfterEra：依托的机制已失效（火塘——火机制只在 E1 有意义）。
 * 已建成的建筑不受影响，继续生效（K、存储、加成照算）。
 */
export function isBuildingBuildable(id: BuildingId, s: E1State): boolean {
  const def = BUILDING_MAP[id];
  // 未来时代：不可建
  if (eraDistance(def.era, s.era) < 0) return false;
  // 功能被取代：取代者的时代到达后退役
  if (def.supersededBy) {
    const succ = BUILDING_MAP[def.supersededBy];
    if (eraDistance(succ.era, s.era) >= 0) return false;
  }
  // 机制失效：过了失效时代即退役
  if (def.obsoleteAfterEra && eraDistance(def.obsoleteAfterEra, s.era) > 0) return false;
  return isBuildingUnlocked(id, s);
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
