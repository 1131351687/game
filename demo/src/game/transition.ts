// 时代跃迁 · 交接规则（纯函数）
//
// ─────────────────────────────────────────────
// 设计原则（用户拍板 2026-09-12）
// ─────────────────────────────────────────────
//
// **时代分界线只决定"新增什么内容"，不改动其它任何状态。**
//
// 即：进入新时代 = 解锁新时代的科技 / 建筑 / 岗位，
// 而玩家的**资源、人口、建筑、岗位分配、经验、研究队列一律原样保留**。
// 旧时代的内容不是"被替换"或"被清零"，而是**继续生效**——
// 这正是"文明层层递进"的机制表达。
//
// ── 三次演进的历史（为什么最终是这个形态）──
//
// 1. 最初：木材/石头归零、人口硬编码 15、建筑清零、岗位清零。
//    → 玩家在 E1 攒的 1000 食物 / 300 木材 / 20 人跃迁后全部蒸发，
//      「层层递进」的体感被彻底抹平。
// 2. 第一次修正：资源改为继承，但仍**把食物折算成另一种主粮**（原「谷物」，归零食物）、
//    **建筑清零后只映射住宅**（住所 → 村落民居）、**岗位清零**。
//    → 仍属"跃迁改变了状态"：玩家会发现自己的火塘/作坊不见了、
//      分配好的伐木工全部下岗，得从头再点一遍。
// 3. 现在（本版）：跃迁**只有一个副作用** —— 新时代的季节时钟从 0 起算。
//    其余字段全部原样透传。
//
// ── 2026-09-13 的唯一例外：退役建筑 ──
//
// 用户进一步拍板建筑分类：绑定**时代独属机制**的建筑（retireAfterEra，如火塘
// 之于火种）在进入更晚时代时随机制退役、跃迁时拆除；住所链（住所→村落民居→
// 民居）不走拆除，由玩家研究科技后主动升级（upgradesTo，半价材料）；
// 其余建筑依旧全数保留、可新建。"只新增"原则在此让位于机制的一致性：
// 机制没了，依附机制的建筑留着只会是尸体。
//
// ── 为什么不是"什么都不做" ──
//
// 季节循环是 E2 才引入的**新机制**，它的计时起点必须定义（否则会沿用 E1
// 的时间轴，第一年从冬天开始，教学节奏错乱）。这属于"新内容的初始化"，
// 不是对旧内容的修改。
//
// ── 连带影响（引擎侧同步调整，见 game/engine.ts）──
//
// 食物不再被折算掉。又因用户拍板「**暂时不区分采集所得与农耕收获**」，
// 原本独立的「谷物」资源已并入「食物」（见 data/resources.ts）——
// 于是 E1 攒下的食物自然就是定居时代的启动粮，
// 玩家不会经历"刚进 E2 就断粮"的假饥饿。

import type { EraId } from '../data/era';
import { ERAS } from '../data/era';
import { BUILDING_MAP, type BuildingId } from '../data/buildings';

/**
 * 跃迁换算常数。
 *
 * ⚠️ 本模块已**不再做任何资源换算**（旧版的食物折算率、主粮保底/上限
 * 均随"只新增不重置"原则一起废除）。
 */
export const TRANSITION = {
  /**
   * 新时代的季节时钟是否从 0 起算。
   *
   * 这不是"重置旧内容"，而是**新机制的初始化**：
   * 季节循环始于 E2，若沿用 E1 的时间轴，第一个游戏年可能从冬天开始，
   * 教学节奏（春吃老本 → 夏打平 → 秋暴收 → 冬停摆）会错乱。
   */
  RESET_ERA_CLOCK: true,
} as const;

/** 跃迁所需的输入切片（store 与模拟器的状态结构都能结构化匹配） */
export interface EraTransitionSource {
  era: EraId;
  eraElapsedSec: number;
  population: number;
  populationProgress: number;
  food: number;
  wood: number;
  stone: number;
  livestock: number;
  fabric: number;
  experience: number;
  buildings: Record<string, number>;
  jobs: Record<string, number>;
  techs: Record<string, boolean>;
}

/**
 * 跃迁产出的新状态切片。
 *
 * 除 `era` 与 `eraElapsedSec` 外，其余字段都是**入参的原样透传**——
 * 显式列出是为了让调用方（store / 模拟器）看得见"到底带着什么过河"，
 * 而不是靠一个含糊的"其余不变"。
 */
export interface EraTransitionResult {
  era: EraId;
  eraElapsedSec: number;
  population: number;
  populationProgress: number;
  food: number;
  wood: number;
  stone: number;
  livestock: number;
  fabric: number;
  experience: number;
  buildings: Record<string, number>;
  jobs: Record<string, number>;
  techs: Record<string, boolean>;
  /**
   * 本次跃迁拆除的**退役建筑**（绑定旧时代独属机制的建筑，如火塘之于火种）。
   * 2026-09-13 用户拍板：这是"叠加开放"原则的唯一例外——
   * 机制随时代谢幕，依附它的建筑随之消失，其余建筑全数保留。
   * 空数组 = 本次跃迁没有退役建筑。
   */
  retired: Array<{ id: BuildingId; name: string; count: number; note?: string }>;
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
  nextEraId: EraId,
): EraTransitionResult {
  const result: EraTransitionResult = {
    era: nextEraId,
    // 唯一被改动的字段：新机制的计时起点（见 TRANSITION.RESET_ERA_CLOCK 注释）
    eraElapsedSec: TRANSITION.RESET_ERA_CLOCK ? 0 : s.eraElapsedSec,

    // ── 以下全部原样保留：时代分界线不改变这些 ──
    // 人口与人口增长进度：玩家养到多少人，就带多少人过去
    population: s.population,
    populationProgress: s.populationProgress,
    // 资源：食物/木材/石头 与 牲畜/织物
    // —— 注意**不做任何折算**，食物既是采集所得也是农耕所得（已合并为一种资源）
    food: s.food,
    wood: s.wood,
    stone: s.stone,
    livestock: s.livestock,
    fabric: s.fabric,
    // 经验与科技：文明积累，跨代保留（科技效果按 eraDecay 自动衰减）
    experience: s.experience,
    techs: s.techs,
    // 建筑：**全数保留**（住所/作坊继续生效、继续贡献承载力与加成），
    // 不再做"升级映射"式的替换——那等于把玩家的建筑换成另一种东西。
    // （住所链的进阶改由玩家主动升级：upgradesTo + 半价材料，见 buildings.ts；
    //   唯一被拆除的是退役建筑，见下方 retired 段。）
    buildings: { ...s.buildings },
    // 岗位：**保留分配**。猎人/伐木者等无进阶关系的岗位原样继续；
    // 采集者的"进阶为农夫"发生在跃迁**之后**（store.advanceEra 第 6 步的事件，
    // 见 applyJobUpgradeAll）——那是新时代带来的内容，不是本函数的职责
    jobs: s.jobs,

    // 退役建筑拆除明细（下方 retired 段填充；先占位数组以满足类型）
    retired: [],
  };

  // ⚠️ 矿脉随机制已废除（2026-09-13 用户拍板）：铜/锡产出改由矿工科技链驱动，
  // 不再有"开局抽定铜矿带/锡矿带/冲积平原"的随机地图变量。
  // 原 E2→E3 的 rng 抽签段随 localOre 字段一并删除，rng 参数同步移除。

  // ── 退役建筑拆除（2026-09-13 用户拍板的建筑分类规则）──
  //
  // 绑定**时代独属机制**的建筑（def.retireAfterEra）在进入更晚时代时随机制退役：
  // 当前唯一实例是火塘（E1 火种机制）——进入定居时代后火种常燃不熄（E2 §11.1），
  // 火塘不再有任何效果，留着只会让建筑栏挂着一具"尸体"。
  // 拆除明细返回给调用方（store.advanceEra）生成公告，玩家清楚知道少了什么、为什么。
  const retired: EraTransitionResult['retired'] = result.retired;
  for (const [id, count] of Object.entries(result.buildings)) {
    const def = BUILDING_MAP[id as BuildingId];
    if (!def?.retireAfterEra || count <= 0) continue;
    if (ERAS[nextEraId].index > ERAS[def.retireAfterEra].index) {
      retired.push({ id: def.id, name: def.name, count, note: def.retireNote });
      delete result.buildings[id];
    }
  }

  return result;
}
