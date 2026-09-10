// E1 远古时代 · 建筑定义（3 座）
// 三座建筑恰好对应三大限制：人口上限 / 环境（火） / 产出

import type { ResourceId } from './resources';

export type BuildingId = 'house' | 'hearth' | 'workshop';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  /** 建造成本 */
  cost: Partial<Record<ResourceId, number>>;
  /** 成本递增倍率 */
  costMultiplier: number;
  /** 解锁条件 */
  requires: { tech?: string };
  /** 对应的人口的哪一个限制 */
  limit: 'population' | 'environment' | 'output';
  desc: string;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'house',
    name: '住所',
    icon: '🏕️',
    cost: { wood: 30 },
    costMultiplier: 1.35,
    requires: { tech: 'shelter_building' },
    limit: 'population',
    desc: '为族人提供栖身之所。每座提升人口上限 4。',
  },
  {
    id: 'hearth',
    name: '火塘',
    icon: '🔥',
    cost: { stone: 20 },
    costMultiplier: 1.4,
    requires: { tech: 'hearth_construction' },
    limit: 'environment',
    desc: '固定的火塘让火种衰减减缓 20%，并提升火种上限 20。',
  },
  {
    id: 'workshop',
    name: '作坊',
    icon: '⚒️',
    cost: { stone: 40 },
    costMultiplier: 1.45,
    requires: { tech: 'stone_knapping' },
    limit: 'output',
    desc: '集中制作工具，使工具世代效果提升 20%。',
  },
];

export const BUILDING_MAP: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map(b => [b.id, b])
) as Record<BuildingId, BuildingDef>;
