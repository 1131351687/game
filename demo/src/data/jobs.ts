// E1 远古时代 · 岗位定义（4 项）
// 人口是劳动力池，岗位从池中分配人口；不消耗资源，只占用人口。

import type { EraId } from './era';
import type { ResourceId } from './resources';

export type JobId = 'gatherer' | 'woodcutter' | 'knapper' | 'hunter' | 'farmer' | 'herder' | 'weaver';

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
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
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
    output: 'grain',
    outputRate: 0.8,
    requires: { tech: 'agriculture' },
    scaledByTool: false,
    era: 'E2',
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
    desc: '纺织织物提升舒适度；覆盖度计入火源舒适度因子。',
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
