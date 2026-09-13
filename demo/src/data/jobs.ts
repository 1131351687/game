// E1 远古时代 · 岗位定义（4 项）
// 人口是劳动力池，岗位从池中分配人口；不消耗资源，只占用人口。

import type { EraId } from './era';
import type { ResourceId } from './resources';
import type { BuildingId } from './buildings';

export type JobId = 'gatherer' | 'woodcutter' | 'knapper' | 'hunter' | 'farmer' | 'herder' | 'weaver' | 'miner' | 'smelter' | 'scribe' | 'merchant';

export interface JobDef {
  id: JobId;
  /** 岗位名称 */
  name: string;
  /** UI 图标（emoji） */
  icon: string;
  /** 产出资源 */
  output: ResourceId;
  /** 每分配 1 人时的每秒产出（猎人另乘工具世代倍率） */
  outputRate: number;
  /** 解锁条件 */
  requires: {
    /** 需要已研究的科技 */
    tech?: string;
    /** 需要的最低工具世代 */
    toolTier?: number;
  };
  /** 是否受工具世代倍率影响 */
  scaledByTool: boolean;
  /**
   * 进阶关系：本岗位的从业者在条件满足后**专职化**为新岗位。
   *
   * 设计意图（2026-09-12 用户提出）：时代推进时职业应当有"进阶感"——
   * 采集者在农耕时代自然变成农夫，而不是两个互不相干的岗位各点一遍。
   * 但这**不是每个岗位都有**：狩猎→畜牧之类的对应关系与史实不符
   * （猎人保留其冬季生态位），故猎人没有进阶目标。
   *
   * 触发条件（由 engine.applyJobUpgrade 实现）：
   *   ① 目标岗位已解锁（requires 满足）
   *   ② 目标岗位**还有空工位**（如农夫受"田地 ×3"限制）
   * 两条都满足才会把源岗位的人少一个、目标岗位多一个——**不会让人凭空消失**。
   * 目的地在没有工位时保持原岗位：这是防止"农业刚研究完就把食物生产
   * 全转成闲置农夫、当场断粮"的兜底。
   */
  upgradesTo?: {
    job: JobId;
    /** UI 上展示的一句话说明 */
    hint: string;
    /**
     * 进阶触发方式（缺省 'era'）：
     *  - 'era'  时代触发：目标岗位所属时代到来即开始进阶（采集者→农夫，2026-09-12 拍板）。
     *  - 'tech' 科技触发：目标时代已到 **且** 目标岗位前置科技研究完成才开始
     *           （打石者→矿工，2026-09-13 拍板——矿工是「铜矿开采」带来的新职业，
     *            时代一到就转会让玩家在研究前面对一个凭空出现的空岗位）。
     */
    trigger?: 'era' | 'tech';
    /**
     * 目标岗位的工位来自哪座建筑（用于 UI 告诉玩家"还差什么"）。
     * 农夫 ← 田地、牧人 ← 畜栏。留空表示不限工位。
     */
    slotBuilding?: BuildingId;
  };
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
  /** 指定时代的单位产出覆盖（如 E3 农夫 3.0/s；缺省用 outputRate） */
  outputRateByEra?: Partial<Record<EraId, number>>;
  /** 一句话说明 */
  desc: string;
}

export const JOBS: JobDef[] = [
  {
    id: 'gatherer',
    name: '采集者',
    icon: '🌾',
    output: 'food',
    outputRate: 0.5,
    requires: {},
    scaledByTool: false,
    // 采集 → 农耕：人类历史上最重要的一次职业专职化。
    // 注意它由「目标岗位解锁 + 有空工位」触发，所以玩家不会因为
    // 刚研究完「农业」就把食物生产全转成没田可种的农夫。
    upgradesTo: { job: 'farmer', hint: '掌握「农业」并有田地工位后自动专职', slotBuilding: 'field' },
    era: 'E1',
    desc: '采集野生植物与果实。门槛最低，但效率有限。',
  },
  {
    id: 'woodcutter',
    name: '伐木者',
    icon: '🪓',
    output: 'wood',
    // 首轮实测 0.4/s：维持火种就要 0.333/s，只剩 0.067/s 造建筑，木材严重不足
    // 调到 0.6/s 后，1 个伐木工可同时维持火种并积累建筑木材
    outputRate: 0.6,
    requires: {},
    scaledByTool: false,
    era: 'E1',
    outputRateByEra: { E3: 0.4 },
    desc: '收集木柴。火种会持续衰减，伐木者不足则火将熄灭。',
  },
  {
    id: 'knapper',
    name: '打石者',
    icon: '🪨',
    output: 'stone',
    outputRate: 0.3,
    requires: { tech: 'stone_knapping' },
    scaledByTool: false,
    era: 'E1',
    outputRateByEra: { E3: 0.3 },
    desc: '打制石器与建造材料。',
  },
  {
    id: 'hunter',
    name: '猎人',
    icon: '🦌',
    output: 'food',
    outputRate: 1.2,
    requires: { tech: 'wooden_spear', toolTier: 1 },
    scaledByTool: true,
    era: 'E1',
    desc: '效率是采集者的 2.4 倍，但需先掌握工具世代。',
  },
  {
    id: 'farmer',
    name: '农夫',
    icon: '🌾',
    // 农耕收获与采集所得统一为「食物」（2026-09-12 合并，见 data/resources.ts）
    output: 'food',
    outputRate: 0.8,
    requires: { tech: 'agriculture' },
    scaledByTool: false,
    era: 'E2',
    outputRateByEra: { E3: 3.0 },
    desc: '在田地上耕作，产出受季节倍率与田地效率（min(1.0, 农夫数/(田数×3))）影响。',
  },
  {
    id: 'herder',
    name: '牧人',
    icon: '🐐',
    output: 'livestock',
    outputRate: 0.25,
    requires: { tech: 'animal_domestication' },
    scaledByTool: false,
    era: 'E2',
    outputRateByEra: { E3: 1.2 },
    desc: '在畜栏旁放牧，无季节波动；每座畜栏提供 3 个工作位，上限 +20 牲畜。',
  },
  {
    id: 'weaver',
    name: '织工',
    icon: '🧵',
    output: 'fabric',
    outputRate: 0.15,
    requires: { tech: 'textile' },
    scaledByTool: false,
    era: 'E2',
    desc: '纺织织物提升舒适度；覆盖度计入火源舒适度因子。E3 起退役：织物转为贸易出口品，不再需要岗位产出。',
  },
  // ── E3 城邦时代 · 岗位定义（4 项）──
  {
    id: 'miner',
    name: '矿工',
    icon: '⛏️',
    output: 'stone',
    outputRate: 0.05,
    requires: { tech: 'copper_mining' },
    scaledByTool: false,
    era: 'E3',
    desc: '采掘石料 0.05/秒。研究「铜矿开采」后同时产出铜，「锡矿开采」后追加锡，「深井采矿」提升全部采矿产出。',
  },
  {
    id: 'smelter',
    name: '冶炼工',
    icon: '🥉',
    output: 'bronze',
    outputRate: 0.05,
    requires: { tech: 'bronze_smelting' },
    scaledByTool: false,
    era: 'E3',
    desc: '以铜（0.045/秒）+ 锡（0.005/秒）炼出青铜 0.05/秒。缺料按比例降速。',
  },
  {
    id: 'scribe',
    name: '书吏',
    icon: '✍️',
    output: 'experience',
    outputRate: 0.15,
    requires: { tech: 'cuneiform' },
    scaledByTool: false,
    era: 'E3',
    desc: '在泥板上记账与誊刻，产出知识。**不产出任何物资**——这是本代的核心矛盾。',
  },
  {
    id: 'merchant',
    name: '商人',
    icon: '🐴',
    output: 'food',
    outputRate: 1.2,
    requires: { tech: 'caravan_org' },
    scaledByTool: false,
    era: 'E3',
    desc: '运力 1.2/秒（除以路线距离系数后换得货物）。贸易系统的运力来源。',
  },
];

export const JOB_MAP: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map(j => [j.id, j])
) as Record<JobId, JobDef>;

/**
 * 返回指定时代的全部岗位
 * @param era 时代 id
 */
export function jobsOfEra(era: EraId): JobDef[] {
  return JOBS.filter(j => j.era === era);
}
