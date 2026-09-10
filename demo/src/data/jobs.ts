// E1 远古时代 · 岗位定义（4 项）
// 人口是劳动力池，岗位从池中分配人口；不消耗资源，只占用人口。

import type { ResourceId } from './resources';

export type JobId = 'gatherer' | 'woodcutter' | 'knapper' | 'hunter';

export interface JobDef {
  id: JobId;
  name: string;
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
    desc: '采集野生植物与果实。门槛最低，但效率有限。',
  },
  {
    id: 'woodcutter',
    name: '伐木者',
    icon: '🪓',
    output: 'wood',
    outputRate: 0.4,
    requires: {},
    scaledByTool: false,
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
    desc: '效率是采集者的 2.4 倍，但需先掌握工具世代。',
  },
];

export const JOB_MAP: Record<JobId, JobDef> = Object.fromEntries(
  JOBS.map(j => [j.id, j])
) as Record<JobId, JobDef>;
