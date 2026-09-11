// 时代跃迁 · 交接规则（纯函数）
//
// ─────────────────────────────────────────────
// 设计原则（来自 design/game/01-core-loop.md 的铁律 3 与 E2 §11.1）
// ─────────────────────────────────────────────
//
// **跃迁 = 继承 + 降权 + 新增，绝不是清零。**
//
// 旧版本 store.advanceEra() 把木材/石头/人口一律重置（木石归零、人口硬编码 15），
// 与设计文档 E2-sedentary.md §11.1 直接冲突——文档明确写着
//   「木材 | 保留 E1 结余 | 继承」
//   「石头 | 保留 E1 结余 | 继承」
//   「人口 | 15 | E1 跃迁条件要求 ≥15」
// 前者是"继承"，后者的 15 是"下限"而不是"固定值"。
//
// 结果：玩家在 E1 攒到 1000 食物 / 20 人 / 300 木材，跃迁后只剩 15 人 + 0 资源，
// 「层层递进」的体感被彻底抹平。本模块修正这一点，并把规则集中到一处，
// 供 store.advanceEra() 与 dev/simulate.ts 共用（此前模拟器手工镜像跃迁产物，
// 两处容易漂移）。
//
// ─────────────────────────────────────────────

import { BUILDINGS } from '../data/buildings';
import { JOBS } from '../data/jobs';
import { E2 } from '../data/constants';
import type { EraId } from '../data/era';

/**
 * 跃迁换算常数
 *
 * 全部集中在此处，便于后续配平定稿时统一调整。
 * ⚠️ 除 MIN_POPULATION 有文档依据外，其余为**首轮草案**。
 */
export const TRANSITION = {
  /**
   * 食物 → 谷物的折算率。
   *
   * 为什么不按 1:1 全额带过：E1 的「食物」是**采集来的易腐存货**，
   * E2 的「谷物」是**入仓的仓储粮**，两者不是同一种东西（E2 §6 资源集把它们列为不同资源）。
   * 0.5 表达"采集食物入仓要打对折"——史实上采集食物无法长期储存，
   * 这正是农业革命要解决的核心问题。
   */
  FOOD_TO_GRAIN: 0.5,

  /**
   * 谷物保底。
   *
   * 设计文档 §11.1：E1 跃迁条件要求食物 ≥300，结算为谷物。
   * 保底 300 保证**教学年**（第一年"春吃老本 → 秋暴收 → 冬停摆"）成立，
   * 无论玩家是"卡着门槛过"还是"富着过"，第一年都能走完完整节奏。
   */
  GRAIN_MIN: 300,

  /**
   * 谷物折算上限。
   *
   * ⚠️ 取 **400** 而不是"一个更大的数"：这是 E2 **无粮仓时的基础上限**
   * （`getGranaryCapacity(0, …) = 400`）。若折算结果超过它，进 E2 的第一个 tick
   * 就会被仓储上限**直接销毁**——玩家会看到"我明明带了 1500 粮过来，落地只剩 400"，
   * 这是最伤"递进感"的一种失败方式。所以在折算处就对齐上限。
   *
   * 想要带更多粮进场？**先扩建粮仓**——这正是 E2 的核心决策。
   */
  GRAIN_MAX: 400,

  /**
   * 新时代的最低起始人口。
   *
   * 设计文档 §11.1：「人口 15 —— E1 跃迁条件要求 ≥15」。
   * 注意这是**下限**：玩家在 E1 养到 20 人，跃迁后就是 20 人，不再被压回 15。
   */
  MIN_POPULATION: 15,
} as const;

/**
 * 建筑跨时代升级映射：旧建筑 → 新建筑
 *
 * 升级必须是**等值**的（K 提供量相同），否则承载力 K 会在跃迁瞬间跳变，
 * 逻辑斯蒂项 (1 − P/K) 可能转负，人口当场崩盘（见 advanceEra 旧注释的详细推导）。
 *   - E1「住所」K +4  →  E2「村落民居」K +4   ✅ 等值
 */
const BUILDING_UPGRADE: Partial<Record<EraId, Record<string, string>>> = {
  E2: { house: 'village_house' },
};

/** 跃迁所需的输入切片（store 与模拟器的状态结构都能结构化匹配） */
export interface EraTransitionSource {
  era: EraId;
  population: number;
  food: number;
  wood: number;
  stone: number;
  grain: number;
  livestock: number;
  fabric: number;
  experience: number;
  buildings: Record<string, number>;
  jobs: Record<string, number>;
}

/** 跃迁产出的新状态切片 */
export interface EraTransitionResult {
  era: EraId;
  population: number;
  populationProgress: number;
  food: number;
  wood: number;
  stone: number;
  grain: number;
  livestock: number;
  fabric: number;
  experience: number;
  eraElapsedSec: number;
  buildings: Record<string, number>;
  jobs: Record<string, number>;
}

/**
 * 计算一次时代跃迁的交接结果。
 *
 * **不修改入参**，返回全新的状态切片；调用方（store / 模拟器）自行合并。
 *
 * @param s          跃迁前的状态
 * @param nextEraId  目标时代
 */
export function computeEraTransition(
  s: EraTransitionSource,
  nextEraId: EraId
): EraTransitionResult {
  // ── 建筑：按升级映射继承 ──
  // 映射表里没有的旧建筑**清零**（它们的"质"由科技效果继承，如工具世代、
  // 火源常量），映射表里的**等值转换**以保持 K 连续。
  const upgrades = BUILDING_UPGRADE[nextEraId];
  const buildings = Object.fromEntries(BUILDINGS.map(b => [b.id, 0])) as Record<string, number>;
  if (upgrades) {
    for (const [fromId, count] of Object.entries(s.buildings)) {
      const toId = upgrades[fromId];
      if (toId && count > 0) buildings[toId] = (buildings[toId] ?? 0) + count;
    }
  }

  // ── 基础资源：继承（文档 §11.1「保留 E1 结余」）──
  const wood = s.wood;
  const stone = s.stone;

  // ── 主粮：食物 → 谷物折算 ──
  const grain = clamp(
    Math.floor(s.food * TRANSITION.FOOD_TO_GRAIN),
    TRANSITION.GRAIN_MIN,
    TRANSITION.GRAIN_MAX
  );

  // ── 人口：继承，但不低于文档下限 ──
  // 不再硬编码 15 —— 玩家在 E1 养到多少人，就带多少人进 E2。
  const population = Math.max(TRANSITION.MIN_POPULATION, s.population);

  return {
    era: nextEraId,
    population,
    populationProgress: 0,
    food: 0, // E2 起人口改吃谷物，食物作为资源退场（E2 §6）
    wood,
    stone,
    grain,
    livestock: 0,
    fabric: 0,
    // 经验：**跨代继承**（文明积累不清零）
    //
    // ⚠️ 与 E2 文档 §11.1/§14 的字面表述冲突（文档写"从 0 重新计""每代清零"）。
    //    设计已修正：玩家攒下的经验代表文明积累，跃迁时**保留**。
    //    文档 §11.1 / §14 待同步修订。
    experience: s.experience,
    eraElapsedSec: 0, // 新时代从春天开始（E2 §11.1）
    buildings,
    // 岗位重新分配：新时代的岗位体系不同，不自动继承（这是"新动词"的体现）
    jobs: Object.fromEntries(JOBS.map(j => [j.id, 0])) as Record<string, number>,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** E2 粮仓单座容量（供调用方估算继承后的容量是否够装） */
export const E2_GRANARY_PER_UNIT = E2.GRANARY_PER_UNIT;
